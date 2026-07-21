import {test} from 'kizu';
import {mkdtemp, writeFile, rm} from 'fs/promises';
import os from 'os';
import path from 'path';
import {loadConfig, loadConfigOrDiscover, normalizeConfig, parseConfig} from './config.js';
import type {DockerClient} from './docker.js';

async function tempDir(): Promise<string> {

    return mkdtemp(path.join(os.tmpdir(), 'castellan-config-'));

}

async function cleanup(dir: string): Promise<void> {

    await rm(dir, {recursive: true, force: true});

}

async function withEnv<T>(name: string, value: string | undefined, fn: () => Promise<T>): Promise<T> {

    const previous = process.env[name];

    if (value === undefined) {

        delete process.env[name];

} else {

        process.env[name] = value;

}

    try {

        return await fn();

} finally {

        if (previous === undefined) {

            delete process.env[name];

} else {

            process.env[name] = previous;

}

}

}

test('normalizeConfig parses managed services', async (assert) => {

    const config = normalizeConfig({
        managedServices: [
            {
                name: 'api',
                registry: 'r.example.com',
                repository: 'api',
                tag: 'latest',
                composeServices: ['api-1', 'api-2'],
                healthUrl: 'http://{{service}}:3000/health',
            },
        ],
    });

    assert.equal(config.managedServices.length, 1);
    assert.equal(config.managedServices[0].name, 'api');
    assert.equal(config.managedServices[0].composeServices.length, 2);
    assert.equal(config.poll.intervalMs, 60000);

});

test('normalizeConfig uses defaults', async (assert) => {

    const config = normalizeConfig({
        managedServices: [
            {
                name: 'worker',
                registry: 'r.example.com',
                repository: 'worker',
                tag: 'latest',
                composeServices: ['worker'],
                healthUrl: 'http://worker:3000/health',
            },
        ],
    });

    assert.equal(config.rollback.healthTimeoutMs, 120000);
    assert.equal(config.api.port, 3003);
    assert.equal(config.compose.file, '/app/docker-compose.yml');

});

test('normalizeConfig requires managedServices array', async (assert) => {

    let error: Error | undefined;

    try {

        normalizeConfig({managedServices: {}});

} catch (err) {

        error = err as Error;

}

    assert.equal(error?.message, 'managedServices must be an array');

});

test('normalizeConfig requires service name', async (assert) => {

    let error: Error | undefined;

    try {

        normalizeConfig({managedServices: [{}]});

} catch (err) {

        error = err as Error;

}

    assert.equal(error?.message, 'Expected name to be a string');

});

test('normalizeConfig applies default compose file when compose is provided empty', async (assert) => {

    const config = normalizeConfig({
        managedServices: [],
        compose: {},
    });

    assert.equal(config.compose.file, '/app/docker-compose.yml');

});

test('normalizeConfig throws when healthIntervalMs is not a number', async (assert) => {

    let error: Error | undefined;

    try {

        normalizeConfig({
            managedServices: [
                {
                    name: 'api',
                    registry: 'r.example.com',
                    repository: 'api',
                    tag: 'latest',
                    composeServices: ['api'],
                    healthIntervalMs: 'fast',
                },
            ],
        });

} catch (err) {

        error = err as Error;

}

    assert.equal(error?.message, 'Expected healthIntervalMs to be a number');

});

test('normalizeConfig throws when composeServices is not an array', async (assert) => {

    let error: Error | undefined;

    try {

        normalizeConfig({
            managedServices: [
                {
                    name: 'api',
                    registry: 'r.example.com',
                    repository: 'api',
                    tag: 'latest',
                    composeServices: 'api',
                },
            ],
        });

} catch (err) {

        error = err as Error;

}

    assert.equal(error?.message, 'Expected composeServices to be an array');

});

test('normalizeConfig throws when composeServices contains a non-string', async (assert) => {

    let error: Error | undefined;

    try {

        normalizeConfig({
            managedServices: [
                {
                    name: 'api',
                    registry: 'r.example.com',
                    repository: 'api',
                    tag: 'latest',
                    composeServices: [123],
                },
            ],
        });

} catch (err) {

        error = err as Error;

}

    assert.equal(error?.message, 'Expected composeServices[0] to be a string');

});

test('normalizeConfig applies partial poll defaults', async (assert) => {

    const config = normalizeConfig({
        managedServices: [],
        poll: {intervalMs: 10000},
    });

    assert.equal(config.poll.intervalMs, 10000);
    assert.equal(config.poll.jitterMs, 5000);

});

test('normalizeConfig applies partial rollback defaults', async (assert) => {

    const config = normalizeConfig({
        managedServices: [],
        rollback: {maxAttempts: 3},
    });

    assert.equal(config.rollback.healthTimeoutMs, 120000);
    assert.equal(config.rollback.maxAttempts, 3);

});

test('normalizeConfig applies partial api defaults', async (assert) => {

    const config = normalizeConfig({
        managedServices: [],
        api: {authToken: 'secret'},
    });

    assert.equal(config.api.port, 3003);
    assert.equal(config.api.authToken, 'secret');

});

test('normalizeConfig throws when input is not an object', async (assert) => {

    let error: Error | undefined;

    try {

        normalizeConfig(null);

} catch (err) {

        error = err as Error;

}

    assert.equal(error?.message, 'Config must be an object');

});

test('normalizeConfig throws when a service is not an object', async (assert) => {

    let error: Error | undefined;

    try {

        normalizeConfig({managedServices: [null]});

} catch (err) {

        error = err as Error;

}

    assert.equal(error?.message, 'Service 0 must be an object');

});

test('parseConfig parses JSON', async (assert) => {

    const parsed = parseConfig('{"managedServices": [], "poll": {"intervalMs": 10000}}', '/app/config.json') as {
        managedServices: unknown[];
        poll: {intervalMs: number};
    };

    assert.equal(parsed.managedServices.length, 0);
    assert.equal(parsed.poll.intervalMs, 10000);

});

test('parseConfig parses YAML', async (assert) => {

    const raw = `
managedServices:
  - name: api
    registry: r.example.com
    repository: api
    tag: latest
    composeServices:
      - api-1
      - api-2
poll:
  intervalMs: 30000
`;

    const parsed = parseConfig(raw, '/app/config.yaml') as {
        managedServices: unknown[];
        poll: {intervalMs: number};
    };

    assert.equal(parsed.managedServices.length, 1);
    assert.equal(parsed.poll.intervalMs, 30000);

});

test('parseConfig throws on empty YAML', async (assert) => {

    let error: Error | undefined;

    try {

        parseConfig('', '/app/config.yaml');

} catch (err) {

        error = err as Error;

}

    assert.equal(error instanceof Error, true);

});

test('loadConfig reads JSON config file', async (assert) => {

    const dir = await tempDir();
    const file = path.join(dir, 'config.json');

    await writeFile(
        file,
        JSON.stringify({
            managedServices: [
                {
                    name: 'api',
                    registry: 'r.example.com',
                    repository: 'api',
                    tag: 'latest',
                    composeServices: ['api'],
                },
            ],
        }),
        'utf8',
    );

    const config = await loadConfig(file);

    assert.equal(config.managedServices.length, 1);
    assert.equal(config.managedServices[0].name, 'api');
    assert.equal(config.compose.file, '/app/docker-compose.yml');

    await cleanup(dir);

});

test('loadConfig reads YAML config file', async (assert) => {

    const dir = await tempDir();
    const file = path.join(dir, 'config.yaml');

    await writeFile(
        file,
        `managedServices:
  - name: worker
    registry: r.example.com
    repository: worker
    tag: latest
    composeServices:
      - worker
`,
        'utf8',
    );

    const config = await loadConfig(file);

    assert.equal(config.managedServices.length, 1);
    assert.equal(config.managedServices[0].name, 'worker');

    await cleanup(dir);

});

test('loadConfig reads from CASTELLAN_CONFIG env var', async (assert) => {

    const dir = await tempDir();
    const file = path.join(dir, 'env-config.json');

    await writeFile(
        file,
        JSON.stringify({
            managedServices: [
                {
                    name: 'svc',
                    registry: 'r.example.com',
                    repository: 'svc',
                    tag: 'latest',
                    composeServices: ['svc'],
                },
            ],
        }),
        'utf8',
    );

    const config = await withEnv('CASTELLAN_CONFIG', file, async () => loadConfig());

    assert.equal(config.managedServices.length, 1);
    assert.equal(config.managedServices[0].name, 'svc');

    await cleanup(dir);

});

test('loadConfig throws when CASTELLAN_CONFIG env var points to missing file', async (assert) => {

    let error: Error | undefined;

    try {

        await withEnv('CASTELLAN_CONFIG', '/nonexistent/env-config.json', async () => loadConfig());

} catch (err) {

        error = err as Error;

}

    assert.equal(error?.message, 'Config file not found: /nonexistent/env-config.json');

});

test('loadConfig throws when config file is missing', async (assert) => {

    let error: Error | undefined;

    try {

        await loadConfig('/nonexistent/config.json');

} catch (err) {

        error = err as Error;

}

    assert.equal(error?.message.startsWith('Config file not found'), true);

});

test('loadConfig throws when no default config exists', async (assert) => {

    let error: Error | undefined;

    try {

        await withEnv('CASTELLAN_CONFIG', undefined, async () => loadConfig());

} catch (err) {

        error = err as Error;

}

    assert.equal(error?.message.startsWith('Config file not found'), true);

});

test('parseConfig throws on YAML document with no content', async (assert) => {

    let error: Error | undefined;

    try {

        parseConfig('---', '/app/config.yaml');

} catch (err) {

        error = err as Error;

}

    assert.equal(error?.message, 'YAML config file is empty: /app/config.yaml');

});

test('loadConfig infers compose project from compose file name', async (assert) => {

    const dir = await tempDir();
    const composeFile = path.join(dir, 'docker-compose.yml');
    const configFile = path.join(dir, 'config.json');

    await writeFile(composeFile, 'name: myapp\nservices:\n', 'utf8');
    await writeFile(
        configFile,
        JSON.stringify({
            managedServices: [],
            compose: {file: composeFile},
        }),
        'utf8',
    );

    const config = await loadConfig(configFile);

    assert.equal(config.compose.project, 'myapp');

    await cleanup(dir);

});

test('loadConfig infers compose project from directory name', async (assert) => {

    const dir = await tempDir();
    const composeFile = path.join(dir, 'docker-compose.yml');
    const configFile = path.join(dir, 'config.json');

    await writeFile(composeFile, 'services:\n', 'utf8');
    await writeFile(
        configFile,
        JSON.stringify({
            managedServices: [],
            compose: {file: composeFile},
        }),
        'utf8',
    );

    const config = await loadConfig(configFile);

    assert.equal(config.compose.project, path.basename(dir));

    await cleanup(dir);

});

test('loadConfigOrDiscover uses config file when present', async (assert) => {

    const dir = await tempDir();
    const file = path.join(dir, 'config.json');

    await writeFile(
        file,
        JSON.stringify({
            managedServices: [
                {
                    name: 'api',
                    registry: 'r.example.com',
                    repository: 'api',
                    tag: 'latest',
                    composeServices: ['api'],
                },
            ],
        }),
        'utf8',
    );

    const docker = {
        listContainers: async () => [],
    } as unknown as DockerClient;

    const config = await loadConfigOrDiscover(docker, file);

    assert.equal(config.managedServices.length, 1);
    assert.equal(config.managedServices[0].name, 'api');

    await cleanup(dir);

});

test('loadConfigOrDiscover falls back to Watchtower discovery when config is missing', async (assert) => {

    const docker = {
        listContainers: async () => [
            {
                Id: 'abc123',
                Names: ['/myapp_worker_1'],
                Image: '123456789.dkr.ecr.us-east-1.amazonaws.com/worker:prime',
                ImageID: 'sha256:abc',
                Labels: {
                    'com.docker.compose.service': 'worker',
                    'com.docker.compose.project': 'myapp',
                    'com.centurylinklabs.watchtower.enable': 'true',
                },
                State: 'running',
                Status: 'Up 1 hour',
            },
        ],
    } as unknown as DockerClient;

    const config = await loadConfigOrDiscover(docker, '/nonexistent/config.json');

    assert.equal(config.managedServices.length, 1);
    assert.equal(config.managedServices[0].name, 'worker');
    assert.equal(config.managedServices[0].registry, '123456789.dkr.ecr.us-east-1.amazonaws.com');

});

test('loadConfigOrDiscover rethrows non-missing config errors', async (assert) => {

    const dir = await tempDir();
    const file = path.join(dir, 'config.json');

    await writeFile(file, 'not valid json', 'utf8');

    const docker = {
        listContainers: async () => [],
    } as unknown as DockerClient;

    let error: Error | undefined;

    try {

        await loadConfigOrDiscover(docker, file);

} catch (err) {

        error = err as Error;

}

    assert.equal(error?.message.includes('JSON'), true);

    await cleanup(dir);

});
