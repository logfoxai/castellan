import {test} from 'kizu';
import {loadEnvConfig} from './env-config.js';

async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): Promise<T> {

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

        return fn();

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

test('loadEnvConfig uses defaults', async (assert) => {

    const config = await withEnv({
        CASTELLAN_COMPOSE_FILE: undefined,
        CASTELLAN_POLL_ENABLED: undefined,
        CASTELLAN_POLL_INTERVAL_MS: undefined,
        CASTELLAN_POLL_JITTER_MS: undefined,
        CASTELLAN_ROLLBACK_HEALTH_TIMEOUT_MS: undefined,
        CASTELLAN_ROLLBACK_MAX_ATTEMPTS: undefined,
        CASTELLAN_API_ENABLED: undefined,
        CASTELLAN_DASHBOARD_ENABLED: undefined,
        CASTELLAN_API_PORT: undefined,
        CASTELLAN_AUTH_TOKEN: undefined,
        CASTELLAN_REGISTRIES_JSON: undefined,
    }, () => loadEnvConfig());

    assert.equal(config.compose.file, '/app/docker-compose.yml');
    assert.equal(config.poll.enabled, true);
    assert.equal(config.poll.intervalMs, 60000);
    assert.equal(config.poll.jitterMs, 5000);
    assert.equal(config.rollback.healthTimeoutMs, 120000);
    assert.equal(config.api.port, 3003);
    assert.equal(config.api.enabled, true);
    assert.equal(config.api.dashboard, true);

});

test('loadEnvConfig applies env overrides', async (assert) => {

    const config = await withEnv({
        CASTELLAN_COMPOSE_FILE: '/opt/compose.yml',
        CASTELLAN_COMPOSE_PROJECT: 'logfox',
        CASTELLAN_POLL_ENABLED: 'false',
        CASTELLAN_POLL_INTERVAL_MS: '1800000',
        CASTELLAN_API_ENABLED: 'false',
        CASTELLAN_DASHBOARD_ENABLED: 'false',
        CASTELLAN_API_PORT: '4000',
        CASTELLAN_AUTH_TOKEN: 'token',
    }, () => loadEnvConfig());

    assert.equal(config.compose.file, '/opt/compose.yml');
    assert.equal(config.compose.project, 'logfox');
    assert.equal(config.poll.enabled, false);
    assert.equal(config.poll.intervalMs, 1800000);
    assert.equal(config.api.enabled, false);
    assert.equal(config.api.dashboard, false);
    assert.equal(config.api.port, 4000);
    assert.equal(config.api.authToken, 'token');

});

test('loadEnvConfig parses CASTELLAN_REGISTRIES_JSON', async (assert) => {

    const config = await withEnv({
        CASTELLAN_REGISTRIES_JSON: JSON.stringify({
            'ghcr.io': {username: 'user', password: 'pass'},
        }),
    }, () => loadEnvConfig());

    assert.equal(config.registries?.['ghcr.io'].username, 'user');
    assert.equal(config.registries?.['ghcr.io'].password, 'pass');

});

test('loadEnvConfig disables poll when interval is zero', async (assert) => {

    const config = await withEnv({
        CASTELLAN_POLL_INTERVAL_MS: '0',
    }, () => loadEnvConfig());

    assert.equal(config.poll.enabled, false);
    assert.equal(config.poll.intervalMs, 0);

});

test('loadEnvConfig rejects invalid CASTELLAN_REGISTRIES_JSON', async (assert) => {

    let error: Error | undefined;

    try {

        await withEnv({
            CASTELLAN_REGISTRIES_JSON: 'not-json',
        }, () => loadEnvConfig());

} catch (err) {

        error = err as Error;

}

    assert.equal(error?.message, 'CASTELLAN_REGISTRIES_JSON must be valid JSON');

});
