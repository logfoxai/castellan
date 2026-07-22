import {test} from 'kizu';
import type {DockerClient} from './docker.js';
import {
    imageRefKey,
    mergeManagedServicesByImage,
    pickManagedServiceName,
    resolveComposeServicesFromContainers,
} from './compose-targets.js';
import type {ManagedService} from './types.js';

const apiImage = 'ghcr.io/myorg/api-service:prime';
const apiServiceBase = {
    registry: 'ghcr.io',
    repository: 'myorg/api-service',
    tag: 'prime',
} as const;

function labeledContainer(id: string, composeService: string, image: string): {
    Id: string;
    Image: string;
    Labels: Record<string, string>;
} {

    return {
        Id: id,
        Image: image,
        Labels: {
            'com.docker.compose.service': composeService,
            'com.docker.compose.project': 'logfox',
        },
    };

}

test('imageRefKey normalizes docker.io hosts', (assert) => {

    assert.equal(imageRefKey('docker.io', 'foo/bar', 'latest'), imageRefKey('registry-1.docker.io', 'foo/bar', 'latest'));

});

test('pickManagedServiceName uses compose name for a single target', (assert) => {

    assert.equal(pickManagedServiceName(['api'], 'api-service'), 'api');

});

test('pickManagedServiceName uses repository for multiple targets', (assert) => {

    assert.equal(pickManagedServiceName(['api-1', 'api-2'], 'api-service'), 'api-service');

});

test('mergeManagedServicesByImage groups same image ref', (assert) => {

    const base: Omit<ManagedService, 'name'> = {
        registry: 'ghcr.io',
        repository: 'myorg/api',
        tag: 'staging',
        healthIntervalMs: 5000,
        healthRetries: 10,
    };

    const merged = mergeManagedServicesByImage([
        {name: 'api-1', ...base},
        {name: 'api-2', ...base},
    ]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.name, 'myorg/api');
    assert.equal(merged[0]?.composeServices?.join(','), 'api-1,api-2');

});

test('resolveComposeServicesFromContainers finds matching compose services', async (assert) => {

    const docker = {
        listContainers: async () => [
            labeledContainer('1', 'api-2', apiImage),
            labeledContainer('2', 'api-1', apiImage),
            labeledContainer('3', 'worker', 'ghcr.io/myorg/worker:prime'),
        ],
    } as unknown as DockerClient;

    const resolved = await resolveComposeServicesFromContainers(
        docker,
        apiServiceBase,
        {file: '/app/docker-compose.yml', project: 'logfox'},
    );

    assert.equal(resolved.join(','), 'api-1,api-2');

});
