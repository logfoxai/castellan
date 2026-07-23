import type {ContainerInfo} from 'dockerode';
import type {DockerClient} from './docker.js';
import {findNewestRunningComposeContainer, listComposeServiceNamesForImage} from './compose-containers.js';
import {sleep} from './health.js';
import {snapshotComposeServiceHealth, verifyDeployHealth, DeployHealthError} from './service-health.js';
import type {StateManager} from './state.js';
import type {Config, DeploymentEvent, ManagedService, ServiceRuntime} from './types.js';

export type DeploymentContext = {
    config: Config;
    docker: DockerClient;
    state: StateManager;
    withComposeLock: <T>(fn: () => Promise<T>) => Promise<T>;
    findComposeContainer: (serviceName: string) => Promise<ContainerInfo | null>;
    isRollbackRequested: (serviceName: string) => boolean;
    checkRollbackRequested: (serviceName: string) => void;
    clearRollbackRequest: (serviceName: string) => void;
    recordEvent: (type: DeploymentEvent['type'], service: string, message: string) => void;
    syncRejectedDigests: (runtime: ServiceRuntime) => void;
};

async function resolveComposeServices(
    ctx: DeploymentContext,
    service: ManagedService,
): Promise<string[]> {

    if (service.composeServices && service.composeServices.length > 0) {

        return service.composeServices;

}

    const containers = await ctx.docker.listContainers();
    const resolved = listComposeServiceNamesForImage(containers, service, ctx.config.compose);

    if (resolved.length === 0) {

        throw new Error(
            `No compose services found running ${service.registry}/${service.repository}:${service.tag}`,
        );

}

    return resolved;

}

async function verifyComposeServiceHealth(
    ctx: DeploymentContext,
    service: ManagedService,
    composeService: string,
): Promise<void> {

    await verifyDeployHealth({
        service,
        composeService,
        healthTimeoutMs: ctx.config.rollback.healthTimeoutMs,
        findContainer: ctx.findComposeContainer,
        beforeCheck: () => ctx.checkRollbackRequested(service.name),
        checkAbort: () => ctx.isRollbackRequested(service.name),
    });

}

async function restartComposeServices(
    ctx: DeploymentContext,
    service: ManagedService,
    composeServices: string[],
    trackRollback: boolean,
): Promise<void> {

    for (const composeService of composeServices) {

        if (trackRollback) {

            ctx.checkRollbackRequested(service.name);

}

        await ctx.withComposeLock(() => ctx.docker.composeUp(composeService, ctx.config.compose));

        if (trackRollback) {

            ctx.checkRollbackRequested(service.name);

}

        await verifyComposeServiceHealth(ctx, service, composeService);

}

}

async function rolloutDigest(
    ctx: DeploymentContext,
    service: ManagedService,
    digest: string,
    runtime: ServiceRuntime,
    trackRollback: boolean,
): Promise<void> {

    const fullImage = `${service.registry}/${service.repository}`;

    await ctx.docker.pullImage(`${fullImage}@${digest}`);
    await ctx.docker.tagImage(`${fullImage}@${digest}`, `${fullImage}:${service.tag}`);

    const composeServices = await resolveComposeServices(ctx, service);

    await restartComposeServices(ctx, service, composeServices, trackRollback);

    runtime.currentDigest = digest;
    runtime.desiredDigest = digest;
    runtime.state = 'stable';
    runtime.lastError = null;

}

export async function deployManagedService(
    ctx: DeploymentContext,
    service: ManagedService,
    desiredDigest: string,
    runtime: ServiceRuntime,
): Promise<void> {

    if (ctx.state.isDigestRejected(service.name, desiredDigest)) {

        throw new Error(`Refusing to deploy rejected digest ${desiredDigest}`);

}

    const current = await ctx.docker.getLocalDigest(service.registry, service.repository, service.tag);

    if (current === desiredDigest) {

        runtime.currentDigest = current;
        runtime.desiredDigest = desiredDigest;
        runtime.state = 'stable';
        runtime.lastError = null;

        return;

}

    await recordHealthyBaselineIfNeeded(ctx, service, current);

    runtime.state = 'updating';
    ctx.recordEvent('deploy', service.name, `Updating to ${desiredDigest}`);

    ctx.checkRollbackRequested(service.name);
    const composeServices = await resolveComposeServices(ctx, service);

    await ctx.withComposeLock(() => ctx.docker.composePull(composeServices[0], ctx.config.compose));
    await restartComposeServices(ctx, service, composeServices, true);

    ctx.checkRollbackRequested(service.name);
    await markDeploySuccess(ctx, service, desiredDigest, runtime);

}

export async function rollbackManagedService(
    ctx: DeploymentContext,
    service: ManagedService,
    runtime: ServiceRuntime,
): Promise<boolean> {

    ctx.clearRollbackRequest(service.name);

    const targetDigest = await resolveRollbackTarget(ctx, service, runtime);

    if (!targetDigest) {

        return markStableIfAlreadySuccessful(ctx, service, runtime);

}

    runtime.state = 'rollback';
    ctx.recordEvent('rollback', service.name, `Rolling back to ${targetDigest}`);

    await rolloutDigest(ctx, service, targetDigest, runtime, false);

    ctx.state.appendDeployment(service.name, {digest: targetDigest, outcome: 'success'});
    ctx.recordEvent('rollback', service.name, `Rolled back to ${targetDigest}`);

    return true;

}

async function resolveRollbackTarget(
    ctx: DeploymentContext,
    service: ManagedService,
    runtime: ServiceRuntime,
): Promise<string | null> {

    const current = runtime.currentDigest
        ?? await ctx.docker.getLocalDigest(service.registry, service.repository, service.tag);

    return ctx.state.findRollbackDigest(service.name, current);

}

async function markStableIfAlreadySuccessful(
    ctx: DeploymentContext,
    service: ManagedService,
    runtime: ServiceRuntime,
): Promise<boolean> {

    const current = runtime.currentDigest
        ?? await ctx.docker.getLocalDigest(service.registry, service.repository, service.tag);

    if (current && ctx.state.isSuccessfulDeployment(service.name, current)) {

        runtime.currentDigest = current;
        runtime.state = 'stable';
        runtime.lastError = null;

        return true;

}

    runtime.state = 'failed';
    runtime.lastError = 'No previous successful deployment to roll back to';
    ctx.recordEvent('failure', service.name, runtime.lastError);

    return false;

}

export async function attemptRollback(
    ctx: DeploymentContext,
    service: ManagedService,
    runtime: ServiceRuntime,
): Promise<void> {

    const maxAttempts = ctx.config.rollback.maxAttempts;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {

        try {

            const rolledBack = await rollbackManagedService(ctx, service, runtime);

            if (!rolledBack) {

                throw new Error('No previous successful deployment to roll back to');

}

            return;

} catch (err) {

            const message = err instanceof Error ? err.message : String(err);

            ctx.recordEvent('failure', service.name, `Rollback attempt ${attempt} failed: ${message}`);

            if (attempt === maxAttempts) {

                runtime.state = 'failed';
                runtime.lastError = `Rollback failed after ${maxAttempts} attempts: ${message}`;
                ctx.recordEvent('failure', service.name, runtime.lastError);
                throw new Error(runtime.lastError);

}

            await sleep(5000);

}

}

}

async function recordHealthyBaselineIfNeeded(
    ctx: DeploymentContext,
    service: ManagedService,
    currentDigest: string | null,
): Promise<void> {

    if (
        !currentDigest
        || ctx.state.hasDeploymentDigest(service.name, currentDigest)
        || ctx.state.isDigestRejected(service.name, currentDigest)
    ) {

        return;

}

    const composeServices = await resolveComposeServices(ctx, service);

    for (const composeService of composeServices) {

        const healthy = await snapshotComposeServiceHealth(
            service,
            composeService,
            (name) => ctx.findComposeContainer(name),
        );

        if (!healthy) {

            return;

}

}

    ctx.state.appendDeployment(service.name, {digest: currentDigest, outcome: 'success'});

}

async function markDeploySuccess(
    ctx: DeploymentContext,
    service: ManagedService,
    desiredDigest: string,
    runtime: ServiceRuntime,
): Promise<void> {

    const localDigest = await ctx.docker.getLocalDigest(service.registry, service.repository, service.tag);

    runtime.currentDigest = localDigest ?? desiredDigest;
    runtime.state = 'stable';
    runtime.lastError = null;
    ctx.state.appendDeployment(service.name, {digest: runtime.currentDigest, outcome: 'success'});
    ctx.syncRejectedDigests(runtime);
    ctx.recordEvent('deploy', service.name, `Updated to ${runtime.currentDigest}`);

}

export async function handleDeployFailure(
    ctx: DeploymentContext,
    service: ManagedService,
    desiredDigest: string,
    runtime: ServiceRuntime,
    err: unknown,
): Promise<void> {

    const message = err instanceof Error ? err.message : String(err);

    if (message.startsWith('Rollback requested')) {

        ctx.recordEvent('rollback', service.name, `Deploy cancelled: ${message}`);
        await attemptRollback(ctx, service, runtime);

        return;

}

    ctx.recordEvent('failure', service.name, message);

    if (err instanceof DeployHealthError) {

        const failedDigest = await resolveFailedDigest(ctx, service, desiredDigest);

        ctx.state.appendDeployment(service.name, {digest: failedDigest, outcome: 'failed', reject: true});
        ctx.syncRejectedDigests(runtime);

}

    await attemptRollback(ctx, service, runtime);

}

async function resolveFailedDigest(
    _ctx: DeploymentContext,
    _service: ManagedService,
    desiredDigest: string,
): Promise<string> {

    return desiredDigest;

}

export function createDeploymentContext(
    config: Config,
    docker: DockerClient,
    state: StateManager,
    withComposeLock: DeploymentContext['withComposeLock'],
    hooks: Pick<
        DeploymentContext,
        | 'isRollbackRequested'
        | 'checkRollbackRequested'
        | 'recordEvent'
        | 'clearRollbackRequest'
        | 'syncRejectedDigests'
    >,
): DeploymentContext {

    return {
        config,
        docker,
        state,
        withComposeLock,
        findComposeContainer: async (serviceName): Promise<ContainerInfo | null> => {

            const containers = await docker.listContainers();

            return findNewestRunningComposeContainer(containers, serviceName, config.compose);

},
        ...hooks,
    };

}
