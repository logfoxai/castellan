import {test} from 'kizu';
import {dispatchDockerMethod, isApiMethod} from './api-docker.js';
import type {DockerClient} from './docker.js';

const REMOVED_DOCKER_METHODS = [
    'dockerImages',
    'dockerNetworks',
    'dockerVolumes',
    'dockerStats',
    'dockerInfo',
    'dockerEvents',
] as const;

const KEPT_DOCKER_METHODS = [
    'dockerContainers',
    'dockerStatsAll',
    'dockerLogs',
] as const;

function createDocker(): DockerClient {

    return {
        listContainers: async () => [],
        getAllStats: async () => [],
        getContainerLogs: async () => 'log line',
        pullImage: async () => undefined,
        tagImage: async () => undefined,
        getLocalDigest: async () => null,
        manifestInspect: async () => ({digest: 'sha256:abc', pushedAt: null}),
        composeUp: async () => undefined,
    } as unknown as DockerClient;

}

for (const method of REMOVED_DOCKER_METHODS) {

    test(`isApiMethod rejects removed ${method}`, (assert) => {

        assert.equal(isApiMethod(method), false);

    });

}

for (const method of KEPT_DOCKER_METHODS) {

    test(`isApiMethod accepts ${method}`, (assert) => {

        assert.equal(isApiMethod(method), true);

    });

}

test('dispatchDockerMethod returns container logs', async (assert) => {

    const docker = createDocker();
    const result = await dispatchDockerMethod('dockerLogs', docker, {containerId: 'abc', tail: 50});

    assert.equal(result, {logs: 'log line'});

});
