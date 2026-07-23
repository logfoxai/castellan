import type {ContainerInfo} from 'dockerode';
import type {DockerClient} from './docker.js';
import {findNewestRunningComposeContainer, listComposeServiceNamesForImage} from './compose-containers.js';
import {sleep} from './health.js';
import {verifyDeployHealth} from './service-health.js';
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
};

export async function resolveComposeServices(
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

export async function deployManagedService(
    ctx: DeploymentContext,
    service: ManagedService,
    desiredDigest: string,
    runtime: ServiceRuntime,
): Promise<void> {

    const current = await ctx.docker.getLocalDigest(service.registry, service.repository, service.tag);

    if (current && current !== desiredDigest && !runtime.badDigests.includes(current)) {

        ctx.state.setKnownGood(service.name, current);

}

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

    const knownGood = ctx.state.getKnownGood(service.name);

    if (!knownGood) {

        runtime.state = 'failed';
        runtime.lastError = 'No known-good digest to rollback to';
        ctx.recordEvent('failure', service.name, runtime.lastError);

        return false;

}

    runtime.state = 'rollback';
    ctx.recordEvent('rollback', service.name, `Rolling back to ${knownGood}`);

    const fullImage = `${service.registry}/${service.repository}`;

    await ctx.docker.pullImage(`${fullImage}@${knownGood}`);
    await ctx.docker.tagImage(`${fullImage}@${knownGood}`, `${fullImage}:${service.tag}`);

    const composeServices = await resolveComposeServices(ctx, service);

    await restartComposeServices(ctx, service, composeServices, false);

    runtime.currentDigest = knownGood;
    runtime.desiredDigest = knownGood;
    runtime.state = 'stable';
    runtime.lastError = null;
    ctx.recordEvent('rollback', service.name, `Rolled back to ${knownGood}`);

    return true;

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

                throw new Error('No known-good digest to rollback to');

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
    ctx.state.setKnownGood(service.name, runtime.currentDigest);
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

    ctx.recordEvent('failure', service.name, `Health check failed: ${message}`);
    const failedDigest = await resolveFailedDigest(ctx, service, desiredDigest);

    runtime.badDigests.push(failedDigest);
    ctx.state.addBadDigest(service.name, failedDigest);
    await attemptRollback(ctx, service, runtime);

}

async function resolveFailedDigest(
    ctx: DeploymentContext,
    service: ManagedService,
    desiredDigest: string,
): Promise<string> {

    const knownGood = ctx.state.getKnownGood(service.name);
    const currentLocal = await ctx.docker.getLocalDigest(service.registry, service.repository, service.tag);

    if (currentLocal && currentLocal !== knownGood) {

        return currentLocal;

}

    return desiredDigest;

}

export function createDeploymentContext(
    config: Config,
    docker: DockerClient,
    state: StateManager,
    withComposeLock: DeploymentContext['withComposeLock'],
    hooks: Pick<
        DeploymentContext,
        'isRollbackRequested' | 'checkRollbackRequested' | 'recordEvent' | 'clearRollbackRequest'
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
