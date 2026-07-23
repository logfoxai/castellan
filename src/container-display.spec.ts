import {test} from 'kizu';
import {formatContainerDisplayName} from './container-display.js';

test('formatContainerDisplayName strips compose project and replica suffix', (assert) => {

    assert.equal(formatContainerDisplayName('api_api-1_1'), 'api-1');
    assert.equal(formatContainerDisplayName('api_ingest-worker_1'), 'ingest-worker');
    assert.equal(formatContainerDisplayName('api_castellan_1'), 'castellan');
    assert.equal(formatContainerDisplayName('nginx'), 'nginx');

});
