import {test} from 'kizu';
import type {DockerClient} from './docker.js';
import {
    CASTELLAN_AUTUPDATE_LABEL,
    discoverConfig,
    hasDiscoveryLabel,
    parseImageRef,
    WATCHTOWER_ENABLE_LABEL,
} from './watchtower.js';

test('parseImageRef handles ECR images', (assert) => {

    const parsed = parseImageRef('123456789.dkr.ecr.us-east-1.amazonaws.com/api-service:prime');

    assert.equal(parsed?.registry, '123456789.dkr.ecr.us-east-1.amazonaws.com');
    assert.equal(parsed?.repository, 'api-service');
    assert.equal(parsed?.tag, 'prime');

});

test('parseImageRef defaults to docker.io and latest', (assert) => {

    const parsed = parseImageRef('nginx');

    assert.equal(parsed?.registry, 'docker.io');
    assert.equal(parsed?.repository, 'library/nginx');
    assert.equal(parsed?.tag, 'latest');

});

test('parseImageRef handles namespaced docker images', (assert) => {

    const parsed = parseImageRef('foo/bar:1.2.3');

    assert.equal(parsed?.registry, 'docker.io');
    assert.equal(parsed?.repository, 'foo/bar');
    assert.equal(parsed?.tag, '1.2.3');

});

test('parseImageRef handles GHCR images', (assert) => {

    const parsed = parseImageRef('ghcr.io/logfoxai/castellan:latest');

    assert.equal(parsed?.registry, 'ghcr.io');
    assert.equal(parsed?.repository, 'logfoxai/castellan');
    assert.equal(parsed?.tag, 'latest');

});

test('parseImageRef returns null for digest refs', (assert) => {

    assert.equal(parseImageRef('sha256:abc123'), null);
    assert.equal(parseImageRef('nginx@sha256:abc123'), null);

});

test('hasDiscoveryLabel accepts Castellan and Watchtower opt-in labels', (assert) => {

    assert.equal(hasDiscoveryLabel(undefined), false);
    assert.equal(hasDiscoveryLabel({}), false);
    assert.equal(hasDiscoveryLabel({[CASTELLAN_AUTUPDATE_LABEL]: 'false'}), false);
    assert.equal(hasDiscoveryLabel({[WATCHTOWER_ENABLE_LABEL]: 'false'}), false);
    assert.equal(hasDiscoveryLabel({[CASTELLAN_AUTUPDATE_LABEL]: 'true'}), true);
    assert.equal(hasDiscoveryLabel({[WATCHTOWER_ENABLE_LABEL]: 'true'}), true);

});

test('discoverConfig discovers containers with Castellan autoupdate label', async (assert) => {

    const docker = {
        listContainers: async () => [
            {
                Id: 'abc123',
                Names: ['/myapp_api_1'],
                Image: 'ghcr.io/myorg/api:staging',
                ImageID: 'sha256:abc',
                Labels: {
                    'com.docker.compose.service': 'api',
                    'com.docker.compose.project': 'myapp',
                    [CASTELLAN_AUTUPDATE_LABEL]: 'true',
                },
                State: 'running',
                Status: 'Up 1 hour',
            },
        ],
    } as unknown as DockerClient;

    const config = await discoverConfig(docker);

    assert.equal(config.managedServices.length, 1);
    assert.equal(config.managedServices[0].name, 'api');
    assert.equal(config.managedServices[0].tag, 'staging');

});
