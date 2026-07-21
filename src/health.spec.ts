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

test('waitForHttpHealth returns false when endpoint never responds', async (assert) => {

    const result = await waitForHttpHealth({
        url: 'http://127.0.0.1:1',
        intervalMs: 50,
        retries: 2,
        timeoutMs: 300,
    });

    assert.equal(result, false);

});
