import {test} from 'kizu';
import type {DockerClient} from './docker.js';
import {
    CASTELLAN_AUTUPDATE_LABEL,
    CASTELLAN_GROUP_LABEL,
    discoverManagedServices,
    hasDiscoveryLabel,
} from './watchtower.js';

function labeledRunningContainer(
    id: string,
    composeService: string,
    image: string,
    extraLabels: Record<string, string> = {},
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
            ...extraLabels,
        },
        State: 'running',
        Status: 'Up',
    };

}

test('hasDiscoveryLabel accepts Castellan opt-in label only', (assert) => {

    assert.equal(hasDiscoveryLabel(undefined), false);
    assert.equal(hasDiscoveryLabel({}), false);
    assert.equal(hasDiscoveryLabel({[CASTELLAN_AUTUPDATE_LABEL]: 'false'}), false);
    assert.equal(hasDiscoveryLabel({[CASTELLAN_AUTUPDATE_LABEL]: ''}), true);
    assert.equal(hasDiscoveryLabel({[CASTELLAN_AUTUPDATE_LABEL]: 'true'}), true);
    assert.equal(
        hasDiscoveryLabel({'com.centurylinklabs.watchtower.enable': 'true'}),
        false,
    );

});

test('discoverManagedServices discovers containers with Castellan autoupdate label', async (assert) => {

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

    const services = await discoverManagedServices(docker);

    assert.equal(services.length, 1);
    assert.equal(services[0].name, 'api');
    assert.equal(services[0].tag, 'staging');

});

test('discoverManagedServices coalesces labeled containers with the same image', async (assert) => {

    const stagingImage = 'ghcr.io/myorg/api-service:staging';

    const docker = {
        listContainers: async () => [
            labeledRunningContainer('1', 'api-1', stagingImage),
            labeledRunningContainer('2', 'api-2', stagingImage),
        ],
    } as unknown as DockerClient;

    const services = await discoverManagedServices(docker);

    assert.equal(services.length, 1);
    assert.equal(services[0].name, 'myorg/api-service');
    assert.equal(services[0].composeServices?.join(','), 'api-1,api-2');

});

test('discoverManagedServices uses group label when replicas agree', async (assert) => {

    const stagingImage = 'ghcr.io/myorg/api-service:staging';

    const docker = {
        listContainers: async () => [
            labeledRunningContainer('1', 'api-1', stagingImage, {[CASTELLAN_GROUP_LABEL]: 'api'}),
            labeledRunningContainer('2', 'api-2', stagingImage, {[CASTELLAN_GROUP_LABEL]: 'api'}),
        ],
    } as unknown as DockerClient;

    const services = await discoverManagedServices(docker);

    assert.equal(services.length, 1);
    assert.equal(services[0].name, 'api');
    assert.equal(services[0].composeServices?.join(','), 'api-1,api-2');

});

test('discoverManagedServices ignores disagreeing group labels', async (assert) => {

    const stagingImage = 'ghcr.io/myorg/api-service:staging';

    const docker = {
        listContainers: async () => [
            labeledRunningContainer('1', 'api-1', stagingImage, {[CASTELLAN_GROUP_LABEL]: 'api'}),
            labeledRunningContainer('2', 'api-2', stagingImage, {[CASTELLAN_GROUP_LABEL]: 'web'}),
        ],
    } as unknown as DockerClient;

    const services = await discoverManagedServices(docker);

    assert.equal(services.length, 1);
    assert.equal(services[0].name, 'myorg/api-service');

});
