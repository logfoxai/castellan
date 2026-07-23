import {test} from 'kizu';
import {mergeManagedServicesByImage} from './compose-targets.js';
import type {ManagedService} from './types.js';

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

test('mergeManagedServicesByImage uses agreed group label', (assert) => {

    const base: Omit<ManagedService, 'name'> = {
        registry: 'ghcr.io',
        repository: 'myorg/api-service',
        tag: 'staging',
        healthIntervalMs: 5000,
        healthRetries: 10,
    };

    const merged = mergeManagedServicesByImage([
        {name: 'api-1', group: 'api', ...base},
        {name: 'api-2', group: 'api', ...base},
    ]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.name, 'api');
    assert.equal(merged[0]?.composeServices?.join(','), 'api-1,api-2');

});
