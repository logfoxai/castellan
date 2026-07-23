import {test} from 'kizu';
import type {ContainerInfo} from 'dockerode';
import {mkdtemp, rm} from 'fs/promises';
import os from 'os';
import path from 'path';
import type {DockerClient} from './docker.js';
import {sleep} from './health.js';
import type {Registry} from './registry.js';
import {Roller} from './roller.js';
import {StateManager} from './state.js';
import type {Config, ManagedService} from './types.js';

const service: ManagedService = {
    name: 'api',
    registry: 'ghcr.io',
    repository: 'myorg/api',
    tag: 'prime',
    composeServices: ['api-1'],
    healthIntervalMs: 10,
    healthRetries: 1,
};

const config: Config = {
    managedServices: [service],
    compose: {file: '/app/docker-compose.yml', project: 'logfox'},
    poll: {enabled: false, intervalMs: 0, jitterMs: 0},
    rollback: {healthTimeoutMs: 50, maxAttempts: 1},
    api: {enabled: false, dashboard: false, port: 3003},
};

function healthyContainer(): ContainerInfo {

    return {
        Id: '1',
        Created: 1,
        Image: 'ghcr.io/myorg/api:prime',
        State: 'running',
        Status: 'Up 1 minute (healthy)',
        Labels: {
            'com.docker.compose.service': 'api-1',
            'com.docker.compose.project': 'logfox',
        },
    } as unknown as ContainerInfo;

}

function createDocker(pullStarted: {value: boolean}): DockerClient {

    return {
        listContainers: async () => [healthyContainer()],
        getLocalDigest: async () => 'sha256:known-good',
        composePull: async () => {

            pullStarted.value = true;
            await sleep(250);

},
        composeUp: async () => undefined,
        pullImage: async () => {

            pullStarted.value = true;
            await sleep(250);

},
        tagImage: async () => undefined,
    } as unknown as DockerClient;

}

async function waitForPull(pullStarted: {value: boolean}): Promise<void> {

    while (!pullStarted.value) {

        await sleep(10);

}

}

function workerContainer(): ContainerInfo {

    return {
        Id: '2',
        Created: 1,
        Image: 'ghcr.io/myorg/worker:prime',
        State: 'running',
        Status: 'Up 1 minute (healthy)',
        Labels: {
            'com.docker.compose.service': 'worker-1',
            'com.docker.compose.project': 'logfox',
            'ai.logfox.castellan.autoupdate': 'true',
        },
    } as unknown as ContainerInfo;

}

function createDiscoverDocker(): DockerClient {

    return {
        listContainers: async () => [healthyContainer(), workerContainer()],
        getLocalDigest: async () => 'sha256:known-good',
        composePull: async () => undefined,
        composeUp: async () => undefined,
        pullImage: async () => undefined,
        tagImage: async () => undefined,
    } as unknown as DockerClient;

}

test('reject waits for in-flight deploy then rejects and rolls back', async (assert) => {

    const dir = await mkdtemp(path.join(os.tmpdir(), 'castellan-roller-'));
    const state = new StateManager(path.join(dir, 'state.json'));

    state.appendDeployment('api', {digest: 'sha256:known-good', outcome: 'success'});
    await state.save();

    const pullStarted = {value: false};
    const registry: Registry = {
        getManifest: async () => ({digest: 'sha256:new', pushedAt: null}),
        invalidate: () => undefined,
    };
    const roller = new Roller(config, registry, createDocker(pullStarted), state);

    try {

        const deploy = roller.forceCheck();

        await waitForPull(pullStarted);
        const rejectOk = await roller.reject('api', 'sha256:new');

        await deploy;

        assert.equal(rejectOk, true);
        assert.equal(state.isDigestRejected('api', 'sha256:new'), true);
        assert.equal(roller.getStatus().services[0]?.currentDigest, 'sha256:known-good');
        assert.equal(roller.getStatus().services[0]?.state, 'stable');

} finally {

        roller.stop();
        await rm(dir, {recursive: true, force: true});

}

});

test('manual deploy disables polling for the service', async (assert) => {

    const dir = await mkdtemp(path.join(os.tmpdir(), 'castellan-roller-'));
    const state = new StateManager(path.join(dir, 'state.json'));
    const registry: Registry = {
        getManifest: async () => ({digest: 'sha256:new', pushedAt: null}),
        invalidate: () => undefined,
    };
    const roller = new Roller(config, registry, createDocker({value: false}), state);

    try {

        assert.equal(roller.getStatus().services[0]?.pollEnabled, true);

        await roller.deploy('api', 'sha256:known-good');

        assert.equal(roller.getStatus().services[0]?.pollEnabled, false);
        assert.equal(state.getServicePollEnabled('api', true), false);

} finally {

        roller.stop();
        await rm(dir, {recursive: true, force: true});

}

});

function createFailingPullDocker(): DockerClient {

    return {
        listContainers: async () => [healthyContainer()],
        getLocalDigest: async () => 'sha256:known-good',
        composePull: async () => undefined,
        composeUp: async () => undefined,
        pullImage: async () => {

            throw new Error('pull failed');

},
        tagImage: async () => undefined,
    } as unknown as DockerClient;

}

test('failed manual deploy does not disable polling', async (assert) => {

    const dir = await mkdtemp(path.join(os.tmpdir(), 'castellan-roller-'));
    const state = new StateManager(path.join(dir, 'state.json'));

    state.appendDeployment('api', {digest: 'sha256:known-good', outcome: 'success'});
    await state.save();

    const registry: Registry = {
        getManifest: async () => ({digest: 'sha256:new', pushedAt: null}),
        invalidate: () => undefined,
    };
    const roller = new Roller(config, registry, createFailingPullDocker(), state);

    try {

        const ok = await roller.deploy('api', 'sha256:bad');

        assert.equal(ok, true);
        assert.equal(roller.getStatus().services[0]?.pollEnabled, true);

} finally {

        roller.stop();
        await rm(dir, {recursive: true, force: true});

}

});

test('forceCheck skips services with polling disabled', async (assert) => {

    const dir = await mkdtemp(path.join(os.tmpdir(), 'castellan-roller-'));
    const state = new StateManager(path.join(dir, 'state.json'));
    let manifestCalls = 0;
    const registry: Registry = {
        getManifest: async () => {

            manifestCalls += 1;

            return {digest: 'sha256:new', pushedAt: null};

},
        invalidate: () => undefined,
    };
    const roller = new Roller(config, registry, createDocker({value: false}), state);

    try {

        await roller.setPollEnabled('api', false);
        await roller.forceCheck();

        assert.equal(manifestCalls, 0);

} finally {

        roller.stop();
        await rm(dir, {recursive: true, force: true});

}

});

test('syncDiscoveredServices respects persisted manual mode', async (assert) => {

    const dir = await mkdtemp(path.join(os.tmpdir(), 'castellan-roller-'));
    const state = new StateManager(path.join(dir, 'state.json'));

    state.setServicePollEnabled('worker-1', false);
    await state.save();

    const registry: Registry = {
        getManifest: async () => ({digest: 'sha256:worker', pushedAt: null}),
        invalidate: () => undefined,
    };
    const roller = new Roller(config, registry, createDiscoverDocker(), state);

    try {

        await roller.syncDiscoveredServices();

        assert.equal(
            roller.getStatus().services.find((entry) => entry.name === 'worker-1')?.pollEnabled,
            false,
        );

} finally {

        roller.stop();
        await rm(dir, {recursive: true, force: true});

}

});

test('syncDiscoveredServices auto-registers labeled services', async (assert) => {

    const dir = await mkdtemp(path.join(os.tmpdir(), 'castellan-roller-'));
    const state = new StateManager(path.join(dir, 'state.json'));
    const registry: Registry = {
        getManifest: async () => ({digest: 'sha256:worker', pushedAt: null}),
        invalidate: () => undefined,
    };
    const roller = new Roller(config, registry, createDiscoverDocker(), state);

    try {

        await roller.syncDiscoveredServices();

        assert.equal(roller.getStatus().services.some((entry) => entry.name === 'worker-1'), true);
        assert.equal(
            roller.getStatus().services.find((entry) => entry.name === 'worker-1')?.pollEnabled,
            true,
        );

} finally {

        roller.stop();
        await rm(dir, {recursive: true, force: true});

}

});
