import {test} from 'kizu';
import {createServer} from 'http';
import {waitForHttpHealth} from './health.js';

test('waitForHttpHealth returns true when endpoint is healthy', async (assert) => {

    const server = createServer((_req, res) => {

        res.statusCode = 200;
        res.end('OK');

});

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    const port = typeof address === 'string' ? 0 : address?.port ?? 0;
    const result = await waitForHttpHealth({
        url: `http://127.0.0.1:${port}`,
        intervalMs: 100,
        retries: 5,
        timeoutMs: 1000,
    });

    assert.equal(result, true);

    server.close();

});

test('waitForHttpHealth retries until a non-ok endpoint becomes healthy', async (assert) => {

    let attempts = 0;
    const server = createServer((_req, res) => {

        attempts += 1;

        if (attempts < 3) {

            res.statusCode = 503;
            res.end('starting');
            return;

}

        res.statusCode = 200;
        res.end('OK');

});

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    const port = typeof address === 'string' ? 0 : address?.port ?? 0;

    const result = await waitForHttpHealth({
        url: `http://127.0.0.1:${port}`,
        intervalMs: 25,
        retries: 5,
        timeoutMs: 2000,
    });

    assert.equal(result, true);
    assert.equal(attempts, 3);

    server.close();

});

test('waitForHttpHealth returns false when checkAbort is set', async (assert) => {

    const server = createServer((_req, res) => {

        res.statusCode = 503;
        res.end('starting');

});

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    const port = typeof address === 'string' ? 0 : address?.port ?? 0;

    const result = await waitForHttpHealth({
        url: `http://127.0.0.1:${port}`,
        intervalMs: 25,
        retries: 10,
        timeoutMs: 2000,
        checkAbort: () => true,
    });

    assert.equal(result, false);

    server.close();

});

test('waitForHttpHealth treats non-ok responses as unhealthy', async (assert) => {

    const server = createServer((_req, res) => {

        res.statusCode = 500;
        res.end('error');

});

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    const port = typeof address === 'string' ? 0 : address?.port ?? 0;

    const result = await waitForHttpHealth({
        url: `http://127.0.0.1:${port}`,
        intervalMs: 25,
        retries: 2,
        timeoutMs: 500,
    });

    assert.equal(result, false);

    server.close();

});
