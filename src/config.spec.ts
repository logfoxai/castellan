import {test} from 'kizu';
import {mkdtemp, writeFile, rm} from 'fs/promises';
import os from 'os';
import path from 'path';
import {loadConfig} from './config.js';
import type {DockerClient} from './docker.js';
import {CASTELLAN_AUTUPDATE_LABEL} from './label-discovery.js';
import {withEnv} from './test-env.js';

async function tempDir(): Promise<string> {

    return mkdtemp(path.join(os.tmpdir(), 'castellan-config-'));

}

async function cleanup(dir: string): Promise<void> {

    await rm(dir, {recursive: true, force: true});

}

function labeledWorkerDocker(): DockerClient {

    return {
        listContainers: async () => [
            {
                Id: 'abc123',
                Names: ['/myapp_worker_1'],
                Image: '123456789.dkr.ecr.us-east-1.amazonaws.com/worker:prime',
                ImageID: 'sha256:abc',
                Labels: {
                    'com.docker.compose.service': 'worker',
                    'com.docker.compose.project': 'myapp',
                    [CASTELLAN_AUTUPDATE_LABEL]: 'true',
                },
                State: 'running',
                Status: 'Up 1 hour',
            },
        ],
    } as unknown as DockerClient;

}

test('loadConfig merges env settings with discovered services', async (assert) => {

    const dir = await tempDir();
    const composeFile = path.join(dir, 'docker-compose.yml');

    await writeFile(composeFile, 'name: myapp\nservices:\n', 'utf8');

    const config = await withEnv({
        CASTELLAN_COMPOSE_FILE: composeFile,
        CASTELLAN_POLL_INTERVAL_MS: '30000',
        CASTELLAN_AUTH_TOKEN: 'secret',
    }, async () => loadConfig(labeledWorkerDocker()));

    assert.equal(config.managedServices.length, 1);
    assert.equal(config.managedServices[0].name, 'worker');
    assert.equal(config.compose.file, composeFile);
    assert.equal(config.compose.project, 'myapp');
    assert.equal(config.poll.intervalMs, 30000);
    assert.equal(config.api.authToken, 'secret');

    await cleanup(dir);

});

test('loadConfig returns empty managedServices when none are labeled yet', async (assert) => {

    const docker = {
        listContainers: async () => [],
    } as unknown as DockerClient;

    const config = await loadConfig(docker);

    assert.equal(config.managedServices.length, 0);

});
