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
        pullImage: async () => undefined,
        tagImage: async () => undefined,
    } as unknown as DockerClient;

}

async function waitForPull(pullStarted: {value: boolean}): Promise<void> {

    while (!pullStarted.value) {

        await sleep(10);

}

}

test('rollback waits for in-flight deploy and completes rollback', async (assert) => {

    const dir = await mkdtemp(path.join(os.tmpdir(), 'castellan-roller-'));
    const state = new StateManager(path.join(dir, 'state.json'));

    state.setKnownGood('api', 'sha256:known-good');
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
        const rollbackOk = await roller.rollback('api');

        await deploy;

        assert.equal(rollbackOk, true);
        assert.equal(roller.getStatus().services[0]?.currentDigest, 'sha256:known-good');
        assert.equal(roller.getStatus().services[0]?.state, 'stable');

} finally {

        roller.stop();
        await rm(dir, {recursive: true, force: true});

}

});
