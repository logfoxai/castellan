import {test} from 'kizu';
import {createServer, type Server} from 'http';
import type {ContainerInfo} from 'dockerode';
import {
    containerReportsHealthy,
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

test('containerReportsHealthy interprets docker health status', (assert) => {

    assert.equal(containerReportsHealthy(runningContainer('Up 2 minutes')), true);
    assert.equal(containerReportsHealthy(runningContainer('Up 2 minutes (healthy)')), true);
    assert.equal(containerReportsHealthy(runningContainer('Up 2 minutes (unhealthy)')), false);
    assert.equal(containerReportsHealthy(runningContainer('Up 2 minutes (health: starting)')), false);
    assert.equal(containerReportsHealthy(null), false);

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
