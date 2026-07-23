import {test} from 'kizu';
import type {ContainerInfo} from 'dockerode';
import {
    findNewestRunningComposeContainer,
    listComposeServiceNamesForImage,
    matchesComposeProject,
} from './compose-containers.js';

function container(
    id: string,
    service: string,
    image: string,
    project: string,
    state = 'running',
): ContainerInfo {

    return {
        Id: id,
        Created: Number(id),
        Image: image,
        State: state,
        Labels: {
            'com.docker.compose.service': service,
            'com.docker.compose.project': project,
        },
    } as unknown as ContainerInfo;

}

test('matchesComposeProject accepts containers in the configured project', (assert) => {

    const row = container('1', 'api', 'ghcr.io/myorg/api:prime', 'logfox');

    assert.equal(matchesComposeProject(row, 'logfox'), true);
    assert.equal(matchesComposeProject(row, 'other'), false);
    assert.equal(matchesComposeProject(row), true);

});

test('findNewestRunningComposeContainer picks the newest running replica', (assert) => {

    const rows = [
        container('1', 'api-1', 'ghcr.io/myorg/api:prime', 'logfox'),
        container('3', 'api-1', 'ghcr.io/myorg/api:prime', 'logfox'),
        container('2', 'api-2', 'ghcr.io/myorg/api:prime', 'logfox'),
    ];

    const found = findNewestRunningComposeContainer(rows, 'api-1', {file: '/app/docker-compose.yml', project: 'logfox'});

    assert.equal(found?.Id, '3');

});

test('listComposeServiceNamesForImage returns sorted compose service names', (assert) => {

    const rows = [
        container('1', 'api-2', 'ghcr.io/myorg/api-service:prime', 'logfox'),
        container('2', 'api-1', 'ghcr.io/myorg/api-service:prime', 'logfox'),
        container('3', 'worker', 'ghcr.io/myorg/worker:prime', 'logfox'),
    ];

    const names = listComposeServiceNamesForImage(
        rows,
        {registry: 'ghcr.io', repository: 'myorg/api-service', tag: 'prime'},
        {file: '/app/docker-compose.yml', project: 'logfox'},
    );

    assert.equal(names.join(','), 'api-1,api-2');

});
