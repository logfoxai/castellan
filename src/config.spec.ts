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

function labeledContainer(
    id: string,
    project: string,
    service: string,
    image: string,
): {
    Id: string;
    Names: string[];
    Image: string;
    ImageID: string;
    Labels: Record<string, string>;
    State: string;
    Status: string;
} {

    return {
        Id: id,
        Names: [`/${project}_${service}_1`],
        Image: image,
        ImageID: `sha256:${id}`,
        Labels: {
            'com.docker.compose.service': service,
            'com.docker.compose.project': project,
            [CASTELLAN_AUTUPDATE_LABEL]: 'true',
        },
        State: 'running',
        Status: 'Up',
    };

}

function labeledWorkerDocker(): DockerClient {

    return {
        listContainers: async () => [
            labeledContainer(
                'abc123',
                'myapp',
                'worker',
                '123456789.dkr.ecr.us-east-1.amazonaws.com/worker:prime',
            ),
        ],
    } as unknown as DockerClient;

}

test('loadConfig merges env settings with discovered services', async (assert) => {

    const dir = await tempDir();
    const composeFile = path.join(dir, 'docker-compose.yml');

    await writeFile(composeFile, 'services:\n', 'utf8');

    const config = await withEnv({
        CASTELLAN_COMPOSE_FILE: composeFile,
        CASTELLAN_COMPOSE_PROJECT: 'myapp',
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

    const dir = await tempDir();
    const composeFile = path.join(dir, 'docker-compose.yml');

    await writeFile(composeFile, 'services:\n', 'utf8');

    const docker = {
        listContainers: async () => [
            {
                Id: 'c1',
                Names: ['/empty_db_1'],
                Image: 'postgres:16',
                ImageID: 'sha256:c1',
                Labels: {
                    'com.docker.compose.service': 'db',
                    'com.docker.compose.project': 'empty',
                },
                State: 'running',
                Status: 'Up',
            },
        ],
    } as unknown as DockerClient;

    const config = await withEnv({
        CASTELLAN_COMPOSE_FILE: composeFile,
        CASTELLAN_COMPOSE_PROJECT: 'empty',
    }, async () => loadConfig(docker));

    assert.equal(config.managedServices.length, 0);
    assert.equal(config.compose.project, 'empty');

    await cleanup(dir);

});

test('loadConfig uses the only compose project on Docker when env is unset', async (assert) => {

    const dir = await tempDir();
    const composeFile = path.join(dir, 'docker-compose.yml');

    await writeFile(composeFile, 'services:\n', 'utf8');

    const docker = {
        listContainers: async () => [
            labeledContainer('mine', 'solo', 'worker', 'example.com/worker:prime'),
        ],
    } as unknown as DockerClient;

    const config = await withEnv({CASTELLAN_COMPOSE_FILE: composeFile}, async () => loadConfig(docker));

    assert.equal(config.compose.project, 'solo');
    assert.equal(config.managedServices.length, 1);

    await cleanup(dir);

});

test('loadConfig throws when project unset and no compose projects on Docker', async (assert) => {

    const dir = await tempDir();
    const composeFile = path.join(dir, 'docker-compose.yml');

    await writeFile(composeFile, 'name: ignored\nservices:\n', 'utf8');

    const docker = {
        listContainers: async () => [],
    } as unknown as DockerClient;

    await assert.throws(
        () => withEnv({CASTELLAN_COMPOSE_FILE: composeFile}, async () => loadConfig(docker)),
        /CASTELLAN_COMPOSE_PROJECT/,
    );

    await cleanup(dir);

});

test('loadConfig throws when project unset and multiple compose projects exist', async (assert) => {

    const dir = await tempDir();
    const composeFile = path.join(dir, 'docker-compose.yml');

    await writeFile(composeFile, 'services:\n', 'utf8');

    const docker = {
        listContainers: async () => [
            labeledContainer('a', 'alpha', 'worker', 'example.com/worker:prime'),
            labeledContainer('b', 'beta', 'api', 'example.com/api:prime'),
        ],
    } as unknown as DockerClient;

    await assert.throws(
        () => withEnv({CASTELLAN_COMPOSE_FILE: composeFile}, async () => loadConfig(docker)),
        /multiple/,
    );

    await cleanup(dir);

});

test('loadConfig does not use compose file name: for project', async (assert) => {

    const dir = await tempDir();
    const composeFile = path.join(dir, 'docker-compose.yml');

    await writeFile(composeFile, 'name: fromfile\nservices:\n', 'utf8');

    const docker = {
        listContainers: async () => [
            labeledContainer('mine', 'fromdocker', 'worker', 'example.com/worker:prime'),
        ],
    } as unknown as DockerClient;

    const config = await withEnv({CASTELLAN_COMPOSE_FILE: composeFile}, async () => loadConfig(docker));

    assert.equal(config.compose.project, 'fromdocker');

    await cleanup(dir);

});

test('loadConfig discovers only containers in the resolved compose project', async (assert) => {

    const dir = await tempDir();
    const composeFile = path.join(dir, 'docker-compose.yml');

    await writeFile(composeFile, 'services:\n', 'utf8');

    const docker = {
        listContainers: async () => [
            labeledContainer('mine', 'myapp', 'worker', 'example.com/worker:prime'),
            labeledContainer('other', 'otherstack', 'api', 'example.com/api:prime'),
        ],
    } as unknown as DockerClient;

    const config = await withEnv({
        CASTELLAN_COMPOSE_FILE: composeFile,
        CASTELLAN_COMPOSE_PROJECT: 'myapp',
    }, async () => loadConfig(docker));

    assert.equal(config.managedServices.length, 1);
    assert.equal(config.managedServices[0].name, 'worker');
    assert.equal(config.compose.project, 'myapp');

    await cleanup(dir);

});
