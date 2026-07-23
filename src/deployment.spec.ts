import {test} from 'kizu';
import {mkdtemp, rm} from 'fs/promises';
import os from 'os';
import path from 'path';
import type {ContainerInfo} from 'dockerode';
import type {DockerClient} from './docker.js';
import {handleDeployFailure, type DeploymentContext} from './deployment.js';
import {DeployHealthError} from './service-health.js';
import {StateManager} from './state.js';
import type {Config, ManagedService, ServiceRuntime} from './types.js';

const baseService: ManagedService = {
    name: 'api',
    registry: 'ghcr.io',
    repository: 'myorg/api',
    tag: 'prime',
    composeServices: ['api-1'],
    healthIntervalMs: 5000,
    healthRetries: 3,
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
        badDigests: [],
        lastCheckAt: null,
        lastError: null,
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

function mockDocker(): DockerClient {

    return {
        getLocalDigest: async () => 'sha256:old',
        listContainers: async () => [healthyContainer()],
        composePull: async () => undefined,
        composeUp: async () => undefined,
        pullImage: async () => undefined,
        tagImage: async () => undefined,
    } as unknown as DockerClient;

}

function createContext(state: StateManager): DeploymentContext {

    return {
        config: testConfig,
        docker: mockDocker(),
        state,
        withComposeLock: async (run) => run(),
        findComposeContainer: async () => healthyContainer(),
        isRollbackRequested: () => false,
        checkRollbackRequested: () => undefined,
        clearRollbackRequest: () => undefined,
        recordEvent: () => undefined,
    };

}

async function withContext(
    fn: (ctx: DeploymentContext, state: StateManager, runtime: ServiceRuntime) => Promise<void>,
): Promise<void> {

    const dir = await mkdtemp(path.join(os.tmpdir(), 'castellan-deploy-'));
    const state = new StateManager(path.join(dir, 'state.json'));

    state.setKnownGood('api', 'sha256:old');
    await state.save();

    try {

        await fn(createContext(state), state, baseRuntime());

} finally {

        await rm(dir, {recursive: true, force: true});

}

}

test('handleDeployFailure does not blocklist digest for infrastructure errors', async (assert) => {

    await withContext(async (ctx, state, runtime) => {

        await handleDeployFailure(
            ctx,
            baseService,
            'sha256:new',
            runtime,
            new Error('compose pull failed: network timeout'),
        );

        assert.equal(state.getBadDigests('api').length, 0);
        assert.equal(runtime.badDigests.length, 0);

});

});

test('handleDeployFailure blocklists digest after health verification fails', async (assert) => {

    await withContext(async (ctx, state, runtime) => {

        await handleDeployFailure(
            ctx,
            baseService,
            'sha256:new',
            runtime,
            new DeployHealthError('api-1'),
        );

        assert.equal(state.getBadDigests('api').includes('sha256:new'), true);
        assert.equal(runtime.badDigests.includes('sha256:new'), true);

});

});
