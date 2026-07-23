import {test} from 'kizu';
import {mkdtemp, rm} from 'fs/promises';
import os from 'os';
import path from 'path';
import type {ContainerInfo} from 'dockerode';
import type {DockerClient} from './docker.js';
import {
    deployManagedService,
    handleDeployFailure,
    type DeploymentContext,
} from './deployment.js';
import {DeployHealthError} from './service-health.js';
import {StateManager} from './state.js';
import type {Config, ManagedService, ServiceRuntime} from './types.js';

const baseService: ManagedService = {
    name: 'api',
    registry: 'ghcr.io',
    repository: 'myorg/api',
    tag: 'prime',
    composeServices: ['api-1'],
};

const testConfig: Config = {
    managedServices: [baseService],
    compose: {file: '/app/docker-compose.yml', project: 'logfox'},
    poll: {enabled: false, intervalMs: 0, jitterMs: 0},
    rollback: {healthTimeoutMs: 1000, maxAttempts: 1},
    api: {enabled: false, dashboard: false, port: 3003},
};

function baseRuntime(): ServiceRuntime {

    return {
        name: 'api',
        registry: 'ghcr.io',
        repository: 'myorg/api',
        tag: 'prime',
        state: 'updating',
        currentDigest: 'sha256:old',
        desiredDigest: 'sha256:new',
        rejectedDigests: [],
        lastCheckAt: null,
        lastError: null,
        pollEnabled: true,
    };

}

function healthyContainer(): ContainerInfo {

    return {
        Id: 'abc',
        Created: 1,
        State: 'running',
        Status: 'Up 1 minute (healthy)',
        Labels: {
            'com.docker.compose.service': 'api-1',
            'com.docker.compose.project': 'logfox',
        },
    } as unknown as ContainerInfo;

}

function mockDockerForDeploy(track: {pullImage?: string; composePullCalls: number}): DockerClient {

    let pulled = false;

    return {
        getLocalDigest: async () => (pulled ? 'sha256:new' : 'sha256:old'),
        listContainers: async () => [healthyContainer()],
        composePull: async () => {

            track.composePullCalls += 1;

},
        composeUp: async () => undefined,
        pullImage: async (image: string) => {

            track.pullImage = image;
            pulled = true;

},
        tagImage: async () => undefined,
    } as unknown as DockerClient;

}

function createContext(
    state: StateManager,
    runtime: ServiceRuntime,
    track: {pullImage?: string; composePullCalls: number},
): DeploymentContext {

    return {
        config: testConfig,
        docker: mockDockerForDeploy(track),
        state,
        withComposeLock: async (run) => run(),
        findComposeContainer: async () => healthyContainer(),
        recordEvent: () => undefined,
        syncRejectedDigests: (): void => {

            runtime.rejectedDigests = state.getRejectedDigests(runtime.name);

},
    };

}

async function withEmptyState(
    fn: (
        ctx: DeploymentContext,
        state: StateManager,
        runtime: ServiceRuntime,
        track: {pullImage?: string; composePullCalls: number},
    ) => Promise<void>,
): Promise<void> {

    const dir = await mkdtemp(path.join(os.tmpdir(), 'castellan-deploy-'));
    const state = new StateManager(path.join(dir, 'state.json'));
    const runtime = baseRuntime();
    const track = {composePullCalls: 0};

    try {

        await fn(createContext(state, runtime, track), state, runtime, track);

} finally {

        await rm(dir, {recursive: true, force: true});

}

}

async function withContext(
    fn: (
        ctx: DeploymentContext,
        state: StateManager,
        runtime: ServiceRuntime,
        track: {pullImage?: string; composePullCalls: number},
    ) => Promise<void>,
): Promise<void> {

    const dir = await mkdtemp(path.join(os.tmpdir(), 'castellan-deploy-'));
    const state = new StateManager(path.join(dir, 'state.json'));
    const runtime = baseRuntime();
    const track = {composePullCalls: 0};

    state.appendDeployment('api', {digest: 'sha256:old', outcome: 'success'});
    await state.save();

    try {

        await fn(createContext(state, runtime, track), state, runtime, track);

} finally {

        await rm(dir, {recursive: true, force: true});

}

}

test('handleDeployFailure does not reject digest for infrastructure errors', async (assert) => {

    await withContext(async (ctx, state, runtime) => {

        await handleDeployFailure(
            ctx,
            baseService,
            'sha256:new',
            runtime,
            new Error('compose pull failed: network timeout'),
        );

        assert.equal(state.getRejectedDigests('api').length, 0);
        assert.equal(runtime.rejectedDigests.length, 0);

});

});

test('deployManagedService pulls the requested digest', async (assert) => {

    await withEmptyState(async (ctx, _state, runtime, track) => {

        await deployManagedService(ctx, baseService, 'sha256:new', runtime);

        assert.equal(track.pullImage, 'ghcr.io/myorg/api@sha256:new');
        assert.equal(track.composePullCalls, 0);

});

});

test('deployManagedService records healthy current digest before updating when not in history', async (assert) => {

    await withEmptyState(async (ctx, state, runtime) => {

        await deployManagedService(ctx, baseService, 'sha256:new', runtime);

        const digests = state.getDeployments('api').map((deployment) => deployment.digest);

        assert.equal(digests.includes('sha256:old'), true);
        assert.equal(digests.includes('sha256:new'), true);

});

});

test('deployManagedService does not duplicate baseline when digest is already listed', async (assert) => {

    await withContext(async (ctx, state, runtime) => {

        await deployManagedService(ctx, baseService, 'sha256:new', runtime);

        const oldEntries = state.getDeployments('api').filter(
            (deployment) => deployment.digest === 'sha256:old',
        );

        assert.equal(oldEntries.length, 1);

});

});

test('deployManagedService skips baseline when current containers are unhealthy', async (assert) => {

    await withEmptyState(async (ctx, state, runtime, track) => {

        let healthChecks = 0;

        const unhealthyCtx: DeploymentContext = {
            ...ctx,
            docker: mockDockerForDeploy({...track, composePullCalls: track.composePullCalls}),
            findComposeContainer: async () => {

                healthChecks += 1;

                if (healthChecks === 1) {

                    return {
                        Id: 'abc',
                        Created: 1,
                        State: 'running',
                        Status: 'Up 1 minute (unhealthy)',
                        Labels: {},
                    } as unknown as ContainerInfo;

}

                return healthyContainer();

},
        };

        await deployManagedService(unhealthyCtx, baseService, 'sha256:new', runtime);

        assert.equal(state.hasDeploymentDigest('api', 'sha256:old'), false);
        assert.equal(state.getDeployments('api')[0]?.digest, 'sha256:new');

});

});

test('handleDeployFailure rejects digest after health verification fails', async (assert) => {

    await withContext(async (ctx, state, runtime) => {

        await handleDeployFailure(
            ctx,
            baseService,
            'sha256:new',
            runtime,
            new DeployHealthError('api-1'),
        );

        assert.equal(state.isDigestRejected('api', 'sha256:new'), true);
        assert.equal(runtime.rejectedDigests.includes('sha256:new'), true);
        assert.equal(
            state.getDeployments('api').some(
                (deployment) => deployment.digest === 'sha256:new' && deployment.outcome === 'failed',
            ),
            true,
        );

});

});
