import {test} from 'kizu';
import {mkdtemp, writeFile, rm} from 'fs/promises';
import os from 'os';
import path from 'path';
import {loadConfig} from './config.js';
import type {DockerClient} from './docker.js';
import {CASTELLAN_AUTUPDATE_LABEL} from './label-discovery.js';

async function tempDir(): Promise<string> {

    return mkdtemp(path.join(os.tmpdir(), 'castellan-config-'));

}

async function cleanup(dir: string): Promise<void> {

    await rm(dir, {recursive: true, force: true});

}

async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {

    const previous: Record<string, string | undefined> = {};

    for (const [name, value] of Object.entries(vars)) {

        previous[name] = process.env[name];

        if (value === undefined) {

            delete process.env[name];

} else {

            process.env[name] = value;

}

}

    try {

        return await fn();

} finally {

        for (const [name, value] of Object.entries(previous)) {

            if (value === undefined) {

                delete process.env[name];

} else {

                process.env[name] = value;

}

}

}

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

test('loadConfig throws when no labeled services exist', async (assert) => {

    const docker = {
        listContainers: async () => [],
    } as unknown as DockerClient;

    let error: Error | undefined;

    try {

        await loadConfig(docker);

} catch (err) {

        error = err as Error;

}

    assert.equal(error?.message.includes('No labeled services found'), true);

});

test('loadConfig infers compose project from directory name', async (assert) => {

    const dir = await tempDir();
    const composeFile = path.join(dir, 'docker-compose.yml');

    await writeFile(composeFile, 'services:\n', 'utf8');

    const config = await withEnv({
        CASTELLAN_COMPOSE_FILE: composeFile,
    }, async () => loadConfig(labeledWorkerDocker()));

    assert.equal(config.compose.project, path.basename(dir));

    await cleanup(dir);

});
