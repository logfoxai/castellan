import {test} from 'kizu';
import {loadEnvConfig} from './env-config.js';
import {withEnv} from './test-env.js';

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

test('loadEnvConfig disables poll when interval is zero', async (assert) => {

    const config = await withEnv({
        CASTELLAN_POLL_INTERVAL_MS: '0',
    }, () => loadEnvConfig());

    assert.equal(config.poll.enabled, false);
    assert.equal(config.poll.intervalMs, 0);

});
