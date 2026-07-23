import {test} from 'kizu';
import type {DockerClient} from './docker.js';
import {
    CASTELLAN_AUTUPDATE_LABEL,
    discoverConfig,
    hasDiscoveryLabel,
    WATCHTOWER_ENABLE_LABEL,
} from './watchtower.js';

function labeledRunningContainer(
    id: string,
    composeService: string,
    image: string,
): {
    Id: string;
    Names: string[];
    Image: string;
    Labels: Record<string, string>;
    State: string;
    Status: string;
} {

    return {
        Id: id,
        Names: [`/logfox_${composeService}_1`],
        Image: image,
        Labels: {
            'com.docker.compose.service': composeService,
            'com.docker.compose.project': 'logfox',
            [CASTELLAN_AUTUPDATE_LABEL]: 'true',
        },
        State: 'running',
        Status: 'Up',
    };

}

test('hasDiscoveryLabel accepts Castellan and Watchtower opt-in labels', (assert) => {

    assert.equal(hasDiscoveryLabel(undefined), false);
    assert.equal(hasDiscoveryLabel({}), false);
    assert.equal(hasDiscoveryLabel({[CASTELLAN_AUTUPDATE_LABEL]: 'false'}), false);
    assert.equal(hasDiscoveryLabel({[WATCHTOWER_ENABLE_LABEL]: 'false'}), false);
    assert.equal(hasDiscoveryLabel({[CASTELLAN_AUTUPDATE_LABEL]: ''}), true);
    assert.equal(hasDiscoveryLabel({[CASTELLAN_AUTUPDATE_LABEL]: 'true'}), true);
    assert.equal(hasDiscoveryLabel({[WATCHTOWER_ENABLE_LABEL]: 'true'}), true);
    assert.equal(hasDiscoveryLabel({[WATCHTOWER_ENABLE_LABEL]: 'yes'}), false);

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
                    [CASTELLAN_AUTUPDATE_LABEL]: '',
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

test('discoverConfig coalesces labeled containers with the same image', async (assert) => {

    const stagingImage = 'ghcr.io/myorg/api-service:staging';

    const docker = {
        listContainers: async () => [
            labeledRunningContainer('1', 'api-1', stagingImage),
            labeledRunningContainer('2', 'api-2', stagingImage),
        ],
    } as unknown as DockerClient;

    const config = await discoverConfig(docker);

    assert.equal(config.managedServices.length, 1);
    assert.equal(config.managedServices[0].name, 'myorg/api-service');
    assert.equal(config.managedServices[0].composeServices?.join(','), 'api-1,api-2');

});
