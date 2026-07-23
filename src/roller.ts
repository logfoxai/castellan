import type {Registry} from './registry.js';
import {DockerClient} from './docker.js';
import {sleep} from './health.js';
import {verifyDeployHealth} from './service-health.js';
import {StateManager} from './state.js';
import type {ContainerInfo} from 'dockerode';
import type {Config, DeploymentEvent, ManagedService, ServiceRuntime} from './types.js';
import {resolveComposeServicesFromContainers} from './compose-targets.js';

export type RollerStatus = {
    paused: boolean;
    services: ServiceRuntime[];
};

export class Roller {

    private readonly config: Config;
    private readonly registry: Registry;
    private readonly docker: DockerClient;
    private readonly state: StateManager;
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

        for (const service of config.managedServices) {

            const runtime = createRuntime(service);
            const knownGood = this.state.getKnownGood(service.name);

            if (knownGood) {

                runtime.currentDigest = knownGood;

}

            runtime.badDigests = this.state.getBadDigests(service.name);
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

        const service = this.findService(serviceName);

        if (!service) {

            throw new Error(`Unknown service: ${serviceName}`);

}

        this.rollbackRequested.add(serviceName);

        if (this.locks.get(serviceName)) {

            return true;

}

        this.locks.set(serviceName, true);

        try {

            this.rollbackRequested.delete(serviceName);

            return await this.rollbackService(service);

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

        if (await this.isBadDigest(runtime, desiredDigest)) {

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

            await this.attemptRollback(service);

}

}

    private isBadDigestSync(runtime: ServiceRuntime, digest: string): boolean {

        return runtime.badDigests.includes(digest);

}

    private async isBadDigest(runtime: ServiceRuntime, digest: string): Promise<boolean> {

        if (!this.isBadDigestSync(runtime, digest)) {

            return false;

}

        runtime.state = 'failed';
        runtime.lastError = `Refusing to deploy known-bad digest ${digest}`;
        this.recordEvent('failure', runtime.name, runtime.lastError);
        await this.state.save();

        return true;

}

    private async markDeploySuccess(
        service: ManagedService,
        desiredDigest: string,
        runtime: ServiceRuntime,
    ): Promise<void> {

        const localDigest = await this.docker.getLocalDigest(service.registry, service.repository, service.tag);

        runtime.currentDigest = localDigest ?? desiredDigest;
        runtime.state = 'stable';
        runtime.lastError = null;
        this.state.setKnownGood(service.name, runtime.currentDigest);
        this.recordEvent('deploy', service.name, `Updated to ${runtime.currentDigest}`);

}

    private async handleDeployFailure(
        service: ManagedService,
        desiredDigest: string,
        runtime: ServiceRuntime,
        err: unknown,
    ): Promise<void> {

        const message = err instanceof Error ? err.message : String(err);

        if (message.startsWith('Rollback requested')) {

            this.recordEvent('rollback', service.name, `Deploy cancelled: ${message}`);
            await this.attemptRollback(service);

            return;

}

        this.recordEvent('failure', service.name, `Health check failed: ${message}`);
        const failedDigest = await this.resolveFailedDigest(service, desiredDigest);

        runtime.badDigests.push(failedDigest);
        this.state.addBadDigest(service.name, failedDigest);
        await this.attemptRollback(service);

}

    private checkRollbackRequested(serviceName: string): void {

        if (this.rollbackRequested.has(serviceName)) {

            throw new Error(`Rollback requested for ${serviceName}`);

}

}

    private async resolveFailedDigest(service: ManagedService, desiredDigest: string): Promise<string> {

        const knownGood = this.state.getKnownGood(service.name);
        const currentLocal = await this.docker.getLocalDigest(service.registry, service.repository, service.tag);

        if (currentLocal && currentLocal !== knownGood) {

            return currentLocal;

}

        return desiredDigest;

}

    private async resolveComposeServices(service: ManagedService): Promise<string[]> {

        if (service.composeServices && service.composeServices.length > 0) {

            return service.composeServices;

}

        const resolved = await resolveComposeServicesFromContainers(
            this.docker,
            service,
            this.config.compose,
        );

        if (resolved.length === 0) {

            throw new Error(
                `No compose services found running ${service.registry}/${service.repository}:${service.tag}`,
            );

}

        return resolved;

}

    private async deployService(service: ManagedService, desiredDigest: string): Promise<void> {

        const runtime = this.getRuntime(service.name);
        const current = await this.docker.getLocalDigest(service.registry, service.repository, service.tag);

        if (current && current !== desiredDigest && !this.isBadDigestSync(runtime, current)) {

            this.state.setKnownGood(service.name, current);

}

        runtime.state = 'updating';
        this.recordEvent('deploy', service.name, `Updating to ${desiredDigest}`);

        this.checkRollbackRequested(service.name);
        const composeServices = await this.resolveComposeServices(service);

        await this.withComposeLock(() => this.docker.composePull(composeServices[0], this.config.compose));

        try {

            for (const composeService of composeServices) {

                this.checkRollbackRequested(service.name);
                await this.withComposeLock(() => this.docker.composeUp(composeService, this.config.compose));
                this.checkRollbackRequested(service.name);
                await this.verifyServiceHealth(service, composeService);

}

            this.checkRollbackRequested(service.name);
            await this.markDeploySuccess(service, desiredDigest, runtime);

} catch (err) {

            await this.handleDeployFailure(service, desiredDigest, runtime, err);

} finally {

            await this.state.save();

}

}

    private async attemptRollback(service: ManagedService): Promise<void> {

        const runtime = this.getRuntime(service.name);
        const maxAttempts = this.config.rollback.maxAttempts;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {

            try {

                const rolledBack = await this.rollbackService(service);

                if (!rolledBack) {

                    throw new Error('No known-good digest to rollback to');

}

                return;

} catch (err) {

                const message = err instanceof Error ? err.message : String(err);

                this.recordEvent('failure', service.name, `Rollback attempt ${attempt} failed: ${message}`);

                if (attempt === maxAttempts) {

                    runtime.state = 'failed';
                    runtime.lastError = `Rollback failed after ${maxAttempts} attempts: ${message}`;
                    this.recordEvent('failure', service.name, runtime.lastError);
                    throw new Error(runtime.lastError);

}

                await sleep(5000);

}

}

}

    private async verifyServiceHealth(service: ManagedService, composeService: string): Promise<void> {

        await verifyDeployHealth({
            service,
            composeService,
            healthTimeoutMs: this.config.rollback.healthTimeoutMs,
            findContainer: (name) => this.findComposeContainer(name),
            beforeCheck: () => this.checkRollbackRequested(service.name),
            checkAbort: () => this.rollbackRequested.has(service.name),
        });

}

    private async rollbackService(service: ManagedService): Promise<boolean> {

        this.rollbackRequested.delete(service.name);

        const runtime = this.getRuntime(service.name);
        const knownGood = this.state.getKnownGood(service.name);

        if (!knownGood) {

            runtime.state = 'failed';
            runtime.lastError = 'No known-good digest to rollback to';
            this.recordEvent('failure', service.name, runtime.lastError);
            await this.state.save();

            return false;

}

        runtime.state = 'rollback';
        this.recordEvent('rollback', service.name, `Rolling back to ${knownGood}`);

        const fullImage = `${service.registry}/${service.repository}`;

        await this.docker.pullImage(`${fullImage}@${knownGood}`);
        await this.docker.tagImage(`${fullImage}@${knownGood}`, `${fullImage}:${service.tag}`);

        const composeServices = await this.resolveComposeServices(service);

        for (const composeService of composeServices) {

            await this.withComposeLock(() => this.docker.composeUp(composeService, this.config.compose));
            await this.verifyServiceHealth(service, composeService);

}

        runtime.currentDigest = knownGood;
        runtime.desiredDigest = knownGood;
        runtime.state = 'stable';
        runtime.lastError = null;
        this.recordEvent('rollback', service.name, `Rolled back to ${knownGood}`);

        await this.state.save();

        return true;

}

    private async findComposeContainer(serviceName: string): Promise<ContainerInfo | null> {

        const containers = await this.docker.listContainers();
        const project = this.config.compose.project;
        const running = containers
            .filter((container) =>
                container.Labels?.['com.docker.compose.service'] === serviceName
                && container.State === 'running'
                && (!project || container.Labels?.['com.docker.compose.project'] === project),
            )
            .sort((a, b) => b.Created - a.Created);

        return running[0] ?? null;

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
        badDigests: [],
        lastCheckAt: null,
        lastError: null,
    };

}
