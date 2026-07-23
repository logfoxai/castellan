import type {Registry} from './registry.js';
import {DockerClient} from './docker.js';
import {
    attemptRollback,
    createDeploymentContext,
    deployManagedService,
    handleDeployFailure,
    rollbackManagedService,
} from './deployment.js';
import {sleep} from './health.js';
import type {RollerPort, RollerStatus} from './roller-port.js';
import {StateManager} from './state.js';
import type {ServiceDeployment, Config, DeploymentEvent, ManagedService, ServiceRuntime} from './types.js';

export type {RollerStatus} from './roller-port.js';

export class Roller implements RollerPort {

    private readonly config: Config;
    private readonly registry: Registry;
    private readonly docker: DockerClient;
    private readonly state: StateManager;
    private readonly deployment;
    private readonly runtimes: Map<string, ServiceRuntime> = new Map();
    private readonly locks: Map<string, boolean> = new Map();
    private readonly rollbackRequested: Set<string> = new Set();
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
        this.deployment = createDeploymentContext(
            config,
            docker,
            state,
            (fn) => this.withComposeLock(fn),
            {
                isRollbackRequested: (name) => this.rollbackRequested.has(name),
                checkRollbackRequested: (name) => this.checkRollbackRequested(name),
                recordEvent: (type, service, message) => this.recordEvent(type, service, message),
                clearRollbackRequest: (name) => this.rollbackRequested.delete(name),
                syncRejectedDigests: (runtime) => this.syncRejectedDigests(runtime),
            },
        );

        for (const service of config.managedServices) {

            const runtime = createRuntime(service);

            this.syncRejectedDigests(runtime);
            this.runtimes.set(service.name, runtime);

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

    pause(): void {

        this.paused = true;

}

    resume(): void {

        this.paused = false;

}

    async forceCheck(): Promise<void> {

        for (const service of this.config.managedServices) {

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

    async rollback(serviceName: string): Promise<boolean> {

        return this.runServiceMutation(serviceName, async (service) => {

            const ok = await rollbackManagedService(this.deployment, service, this.getRuntime(serviceName));

            await this.state.save();

            return ok;

}, {cancelInFlight: true, skipFnIfCancelled: true});

}

    async deploy(serviceName: string, digest: string): Promise<boolean> {

        return this.runServiceMutation(serviceName, async (service) => {

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

            await deployManagedService(this.deployment, service, digest, runtime);
            await this.state.save();

            return true;

});

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

}, {cancelInFlight: true});

}

    private async waitForCancelOrUnlock(
        serviceName: string,
        options: {cancelInFlight?: boolean; skipFnIfCancelled?: boolean},
    ): Promise<boolean | null> {

        if (!this.locks.get(serviceName)) {

            return null;

}

        await this.waitForServiceUnlock(serviceName);

        if (
            options.cancelInFlight
            && options.skipFnIfCancelled
            && !this.rollbackRequested.has(serviceName)
        ) {

            return true;

}

        return null;

}

    private async runServiceMutation(
        serviceName: string,
        fn: (service: ManagedService) => Promise<boolean>,
        options: {cancelInFlight?: boolean; skipFnIfCancelled?: boolean} = {},
    ): Promise<boolean> {

        const service = this.findService(serviceName);

        if (!service) {

            throw new Error(`Unknown service: ${serviceName}`);

}

        if (options.cancelInFlight) {

            this.rollbackRequested.add(serviceName);

}

        const cancelled = await this.waitForCancelOrUnlock(serviceName, options);

        if (cancelled !== null) {

            return cancelled;

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

            for (const service of this.config.managedServices) {

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

        await this.runRollbackIfRequested(service);

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

    private async runRollbackIfRequested(service: ManagedService): Promise<void> {

        if (this.rollbackRequested.has(service.name)) {

            await attemptRollback(this.deployment, service, this.getRuntime(service.name));

}

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

    private checkRollbackRequested(serviceName: string): void {

        if (this.rollbackRequested.has(serviceName)) {

            throw new Error(`Rollback requested for ${serviceName}`);

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

        return this.config.managedServices.find((service) => service.name === name);

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

function createRuntime(service: ManagedService): ServiceRuntime {

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
    };

}
