import {test} from 'kizu';
import {createServer, type Server} from 'http';
import type {ContainerInfo} from 'dockerode';
import {
    containerReportsHealthy,
    resolveHealthUrl,
    verifyDeployHealth,
} from './service-health.js';
import type {ManagedService} from './types.js';

const baseService: ManagedService = {
    name: 'api',
    registry: 'ghcr.io',
    repository: 'myorg/api',
    tag: 'staging',
    healthIntervalMs: 10,
    healthRetries: 5,
};

function runningContainer(status: string): ContainerInfo {

    return {
        Id: 'abc',
        State: 'running',
        Status: status,
    } as ContainerInfo;

}

test('containerReportsHealthy accepts running containers without a healthcheck', (assert) => {

    assert.equal(containerReportsHealthy(runningContainer('Up 2 minutes')), true);

});

test('containerReportsHealthy accepts docker healthy status', (assert) => {

    assert.equal(containerReportsHealthy(runningContainer('Up 2 minutes (healthy)')), true);

});

test('containerReportsHealthy rejects unhealthy and starting states', (assert) => {

    assert.equal(containerReportsHealthy(runningContainer('Up 2 minutes (unhealthy)')), false);
    assert.equal(containerReportsHealthy(runningContainer('Up 2 minutes (health: starting)')), false);
    assert.equal(containerReportsHealthy(null), false);

});

test('resolveHealthUrl substitutes compose service placeholders', (assert) => {

    assert.equal(
        resolveHealthUrl('http://{{service}}:3000/health', 'api-2'),
        'http://api-2:3000/health',
    );

});

test('verifyDeployHealth succeeds with docker health only when healthUrl is omitted', async (assert) => {

    await verifyDeployHealth({
        service: baseService,
        composeService: 'api-1',
        healthTimeoutMs: 500,
        findContainer: async () => runningContainer('Up 1 minute (healthy)'),
    });

    assert.equal(true, true);

});

test('verifyDeployHealth waits for docker health before succeeding without healthUrl', async (assert) => {

    let calls = 0;

    await verifyDeployHealth({
        service: baseService,
        composeService: 'api-1',
        healthTimeoutMs: 500,
        findContainer: async () => {

            calls += 1;

            if (calls < 3) {

                return runningContainer('Up 1 minute (health: starting)');

}

            return runningContainer('Up 1 minute (healthy)');

},
        sleepFn: async () => undefined,
    });

    assert.equal(calls >= 3, true);

});

test('verifyDeployHealth requires HTTP health when healthUrl is configured', async (assert) => {

    const server = await listenHealthServer((_req, res) => {

        res.statusCode = 200;
        res.end('OK');

});
    const port = serverPort(server);

    try {

        await verifyDeployHealth({
            service: {
                ...baseService,
                healthUrl: `http://127.0.0.1:${port}/health`,
            },
            composeService: 'api-1',
            healthTimeoutMs: 2000,
            findContainer: async () => runningContainer('Up 1 minute (healthy)'),
        });

        assert.equal(true, true);

} finally {

        server.close();

}

});

test('verifyDeployHealth uses compose service name in healthUrl template', async (assert) => {

    const seenPaths: string[] = [];
    const server = await listenHealthServer((req, res) => {

        seenPaths.push(req.url ?? '');
        res.statusCode = 200;
        res.end('OK');

});

    const port = serverPort(server);

    try {

        await verifyDeployHealth({
            service: {
                ...baseService,
                healthUrl: `http://127.0.0.1:${port}/{{service}}/health`,
            },
            composeService: 'api-2',
            healthTimeoutMs: 2000,
            findContainer: async () => runningContainer('Up 1 minute (healthy)'),
        });

        assert.equal(seenPaths.includes('/api-2/health'), true);

} finally {

        server.close();

}

});

test('verifyDeployHealth fails when HTTP health never passes', async (assert) => {

    const server = await listenHealthServer((_req, res) => {

        res.statusCode = 503;
        res.end('not ready');

});

    const port = serverPort(server);
    let error: Error | undefined;

    try {

        await verifyDeployHealth({
            service: {
                ...baseService,
                healthUrl: `http://127.0.0.1:${port}/health`,
                healthRetries: 1,
            },
            composeService: 'api-1',
            healthTimeoutMs: 300,
            findContainer: async () => runningContainer('Up 1 minute (healthy)'),
            sleepFn: async () => undefined,
        });

} catch (err) {

        error = err as Error;

} finally {

        server.close();

}

    assert.equal(error?.message, 'Health check failed for api-1');

});

test('verifyDeployHealth fails when the container never becomes healthy', async (assert) => {

    let error: Error | undefined;

    try {

        await verifyDeployHealth({
            service: baseService,
            composeService: 'worker',
            healthTimeoutMs: 50,
            findContainer: async () => runningContainer('Up 1 minute (health: starting)'),
            sleepFn: async () => undefined,
        });

} catch (err) {

        error = err as Error;

}

    assert.equal(error?.message, 'Health check failed for worker');

});

async function listenHealthServer(
    handler: (req: import('http').IncomingMessage, res: import('http').ServerResponse) => void,
): Promise<Server> {

    const server = createServer(handler);

    await new Promise<void>((resolve) => server.listen(0, resolve));

    return server;

}

function serverPort(server: Server): number {

    const address = server.address();
    const port = typeof address === 'string' ? 0 : address?.port ?? 0;

    if (port === 0) {

        throw new Error('Expected test server to bind a port');

}

    return port;

}
