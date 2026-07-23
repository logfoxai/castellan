import {test} from 'kizu';
import type {DockerClient} from './docker.js';
import {
    CASTELLAN_AUTUPDATE_LABEL,
    CASTELLAN_GROUP_LABEL,
    discoverManagedServices,
} from './label-discovery.js';

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
