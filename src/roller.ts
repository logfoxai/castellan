import type {Registry} from './registry.js';
import {DockerClient} from './docker.js';
import {
    createDeploymentContext,
    deployManagedService,
    handleDeployFailure,
    rollbackManagedService,
} from './deployment.js';
import {sleep} from './health.js';
import type {RollerPort, RollerStatus} from './roller-port.js';
import {StateManager} from './state.js';
import type {ServiceDeployment, Config, DeploymentEvent, ManagedService, ServiceRuntime} from './types.js';
import {discoverManagedServices} from './watchtower.js';

export type {RollerStatus} from './roller-port.js';

export class Roller implements RollerPort {

    private readonly config: Config;
    private readonly registry: Registry;
    private readonly docker: DockerClient;
    private readonly state: StateManager;
    private readonly deployment;
    private managedServices: ManagedService[];
    private readonly runtimes: Map<string, ServiceRuntime> = new Map();
    private readonly locks: Map<string, boolean> = new Map();
    private composeLock: Promise<unknown> = Promise.resolve();
    private checkingAll: boolean = false;
    private forceCheckPending: boolean = false;
    private paused: boolean = false;
    private running: boolean = false;
    private timeout: NodeJS.Timeout | null = null;

    constructor(config: Config, registry: Registry, docker: DockerClient, state: StateManager) {

        this.config = config;
        this.registry = registry;
        this.docker = docker;
        this.state = state;
        this.managedServices = [...config.managedServices];
        this.deployment = createDeploymentContext(
            config,
            docker,
            state,
            (fn) => this.withComposeLock(fn),
            {
                recordEvent: (type, service, message) => this.recordEvent(type, service, message),
                syncRejectedDigests: (runtime) => this.syncRejectedDigests(runtime),
            },
        );

        for (const service of this.managedServices) {

            const runtime = createRuntime(
                service,
                state.getServicePollEnabled(service.name, true),
            );

            this.syncRejectedDigests(runtime);
            this.runtimes.set(service.name, runtime);

}

}

    async hydratePersistedServices(): Promise<void> {

        const discovered = await discoverManagedServices(this.docker);

        for (const name of this.state.getPersistedServiceNames()) {

            if (this.findService(name)) {

                continue;

}

            const match = discovered.find((service) => service.name === name);

            if (match) {

                this.registerManagedService(match);

}

}

}

    getStatus(): RollerStatus {

        return {
            paused: this.paused,
            services: Array.from(this.runtimes.values()),
        };

}

    getEvents(): DeploymentEvent[] {

        return this.state.getEvents();

}

    getDeployments(serviceName: string): ServiceDeployment[] {

        return this.state.getDeployments(serviceName);

}

    async discoverServices(): Promise<ManagedService[]> {

        const discovered = await discoverManagedServices(this.docker);
        const managed = new Set(this.managedServices.map((service) => service.name));

        return discovered.filter((service) => !managed.has(service.name));

}

    pause(): void {

        this.paused = true;

}

    resume(): void {

        this.paused = false;

}

    async forceCheck(): Promise<void> {

        for (const service of this.managedServices) {

            const runtime = this.runtimes.get(service.name);

            if (!runtime?.pollEnabled) {

                continue;

}

            this.registry.invalidate?.({
                registry: service.registry,
                repository: service.repository,
                tag: service.tag,
            });

}

        if (this.checkingAll) {

            this.forceCheckPending = true;

            return;

}

        await this.checkAll();

}

    async deploy(serviceName: string, digest: string): Promise<boolean> {

        const ok = await this.runServiceMutation(serviceName, async (service) => {

            const runtime = this.getRuntime(serviceName);

            if (this.state.isDigestRejected(service.name, digest)) {

                throw new Error(`Refusing to deploy rejected digest ${digest}`);

}

            const current = runtime.currentDigest
                ?? await this.docker.getLocalDigest(service.registry, service.repository, service.tag);

            if (current === digest) {

                runtime.currentDigest = digest;
                runtime.desiredDigest = digest;
                runtime.state = 'stable';
                runtime.lastError = null;

                return true;

}

            try {

                await deployManagedService(this.deployment, service, digest, runtime);

} catch (err) {

                await handleDeployFailure(this.deployment, service, digest, runtime, err);

                return runtime.state === 'stable';

} finally {

                await this.state.save();

}

            return true;

});

        if (ok && this.getRuntime(serviceName).currentDigest === digest) {

            await this.disableServicePoll(serviceName, 'Polling paused after manual deploy');

}

        return ok;

}

    async reject(serviceName: string, digest: string): Promise<boolean> {

        return this.runServiceMutation(serviceName, async (service) => {

            this.state.setDigestRejected(service.name, digest, true);

            const runtime = this.getRuntime(serviceName);
            const current = runtime.currentDigest
                ?? await this.docker.getLocalDigest(service.registry, service.repository, service.tag);

            this.syncRejectedDigests(runtime);

            if (current === digest) {

                const ok = await rollbackManagedService(this.deployment, service, runtime);

                await this.state.save();

                return ok;

}

            await this.state.save();

            return true;

});

}

    async setPollEnabled(serviceName: string, enabled: boolean): Promise<boolean> {

        if (enabled) {

            await this.ensureManagedService(serviceName);

}

        const runtime = this.getRuntime(serviceName);

        runtime.pollEnabled = enabled;
        this.state.setServicePollEnabled(serviceName, enabled);
        this.recordEvent(
            'check',
            serviceName,
            enabled ? 'Polling enabled' : 'Polling disabled',
        );
        await this.state.save();

        return true;

}

    private async disableServicePoll(serviceName: string, message: string): Promise<void> {

        const runtime = this.getRuntime(serviceName);

        runtime.pollEnabled = false;
        this.state.setServicePollEnabled(serviceName, false);
        this.recordEvent('check', serviceName, message);
        await this.state.save();

}

    private async runServiceMutation(
        serviceName: string,
        fn: (service: ManagedService) => Promise<boolean>,
    ): Promise<boolean> {

        const service = this.findService(serviceName);

        if (!service) {

            throw new Error(`Unknown service: ${serviceName}`);

}

        if (this.locks.get(serviceName)) {

            await this.waitForServiceUnlock(serviceName);

}

        if (this.locks.get(serviceName)) {

            return false;

}

        this.locks.set(serviceName, true);

        try {

            return await fn(service);

} finally {

            this.locks.delete(serviceName);

}

}

    start(): void {

        if (this.running) {

            return;

}

        this.running = true;

        if (!this.config.poll.enabled) {

            console.log(
                'Periodic registry polling disabled (poll.enabled=false or poll.intervalMs=0); '
                + 'use API forceCheck to deploy',
            );

            return;

}

        this.scheduleNext();

}

    stop(): void {

        this.running = false;

        if (this.timeout) {

            clearTimeout(this.timeout);
            this.timeout = null;

}

}

    private scheduleNext(): void {

        if (!this.running) {

            return;

}

        const delay = this.config.poll.intervalMs + (Math.random() * this.config.poll.jitterMs);

        this.timeout = setTimeout(() => {

            void this.tick();

}, delay);

}

    private async tick(): Promise<void> {

        if (!this.paused) {

            await this.checkAll();

}

        this.scheduleNext();

}

    private async withComposeLock<T>(fn: () => Promise<T>): Promise<T> {

        const run = this.composeLock.then(fn);

        this.composeLock = run.catch(() => undefined);

        return run;

}

    private async checkAll(): Promise<void> {

        if (this.checkingAll) {

            return;

}

        this.checkingAll = true;

        try {

            for (const service of this.managedServices) {

                await this.checkService(service);

}

} finally {

            this.checkingAll = false;

            if (this.forceCheckPending) {

                this.forceCheckPending = false;
                await this.checkAll();

}

}

}

    private async checkService(service: ManagedService): Promise<void> {

        const runtime = this.getRuntime(service.name);

        if (!runtime.pollEnabled) {

            return;

}

        if (this.locks.get(service.name)) {

            return;

}

        this.locks.set(service.name, true);

        try {

            await this.runCheck(service);

        } catch (err) {

            const runtime = this.getRuntime(service.name);

            runtime.lastError = err instanceof Error ? err.message : String(err);
            runtime.state = 'failed';
            this.recordEvent('failure', service.name, runtime.lastError);
            await this.state.save();

} finally {

            this.locks.delete(service.name);

}

}

    private async runCheck(service: ManagedService): Promise<void> {

        const runtime = this.getRuntime(service.name);

        if (!runtime.pollEnabled) {

            return;

}

        if (runtime.state !== 'idle' && runtime.state !== 'stable' && runtime.state !== 'failed') {

            return;

}

        runtime.state = 'checking';

        const desired = await this.registry.getManifest({
            registry: service.registry,
            repository: service.repository,
            tag: service.tag,
        });

        runtime.desiredDigest = desired.digest;
        runtime.lastCheckAt = new Date();
        this.recordEvent('check', service.name, `Desired digest ${desired.digest}`);

        const current = await this.docker.getLocalDigest(service.registry, service.repository, service.tag);

        if (current) {

            runtime.currentDigest = current;

}

        await this.state.save();

        const action = await this.evaluateDesiredDigest(service, runtime, desired.digest);

        if (action === 'deploy') {

            await this.deployService(service, desired.digest);

}

}

    private async evaluateDesiredDigest(
        service: ManagedService,
        runtime: ServiceRuntime,
        desiredDigest: string,
    ): Promise<'deploy' | 'stable' | 'failed'> {

        if (await this.isRejectedDigest(runtime, desiredDigest)) {

            return 'failed';

}

        if (runtime.currentDigest === desiredDigest) {

            runtime.state = 'stable';
            runtime.lastError = null;

            return 'stable';

}

        return 'deploy';

}

    private async isRejectedDigest(runtime: ServiceRuntime, digest: string): Promise<boolean> {

        if (!runtime.rejectedDigests.includes(digest)) {

            return false;

}

        runtime.state = 'failed';
        runtime.lastError = `Refusing to deploy rejected digest ${digest}`;
        this.recordEvent('failure', runtime.name, runtime.lastError);
        await this.state.save();

        return true;

}

    private syncRejectedDigests(runtime: ServiceRuntime): void {

        runtime.rejectedDigests = this.state.getRejectedDigests(runtime.name);

}

    private async deployService(service: ManagedService, desiredDigest: string): Promise<void> {

        const runtime = this.getRuntime(service.name);

        try {

            await deployManagedService(this.deployment, service, desiredDigest, runtime);

} catch (err) {

            await handleDeployFailure(this.deployment, service, desiredDigest, runtime, err);

} finally {

            await this.state.save();

}

}

    private async waitForServiceUnlock(serviceName: string, timeoutMs = 300_000): Promise<void> {

        const deadline = Date.now() + timeoutMs;

        while (this.locks.get(serviceName)) {

            if (Date.now() >= deadline) {

                throw new Error(`Timed out waiting for ${serviceName} to finish`);

}

            await sleep(100);

}

}

    private findService(name: string): ManagedService | undefined {

        return this.managedServices.find((service) => service.name === name);

}

    private async ensureManagedService(serviceName: string): Promise<ManagedService> {

        const existing = this.findService(serviceName);

        if (existing) {

            return existing;

}

        const discovered = await discoverManagedServices(this.docker);
        const match = discovered.find((service) => service.name === serviceName);

        if (!match) {

            throw new Error(`Unknown service: ${serviceName}`);

}

        this.registerManagedService(match);

        return match;

}

    private registerManagedService(service: ManagedService): void {

        if (this.findService(service.name)) {

            return;

}

        this.managedServices.push(service);

        const runtime = createRuntime(
            service,
            this.state.getServicePollEnabled(service.name, false),
        );

        this.syncRejectedDigests(runtime);
        this.runtimes.set(service.name, runtime);

}

    private getRuntime(name: string): ServiceRuntime {

        const runtime = this.runtimes.get(name);

        if (!runtime) {

            throw new Error(`Unknown service: ${name}`);

}

        return runtime;

}

    private recordEvent(type: DeploymentEvent['type'], service: string, message: string): void {

        this.state.appendEvent({at: new Date(), type, service, message});

}

}

function createRuntime(service: ManagedService, pollEnabled: boolean): ServiceRuntime {

    return {
        name: service.name,
        registry: service.registry,
        repository: service.repository,
        tag: service.tag,
        state: 'idle',
        currentDigest: null,
        desiredDigest: null,
        rejectedDigests: [],
        lastCheckAt: null,
        lastError: null,
        pollEnabled,
    };

}
