import {test} from 'kizu';
import {parseStatsOutput} from './stats.js';

test('parseStatsOutput parses docker stats JSON lines', (assert) => {

    const line = JSON.stringify({
        Name: '/api_api-1_1',
        CPUPerc: '0.42%',
        MemUsage: '48.3MiB / 1.9GiB',
        MemPerc: '0.61%',
    });

    assert.equal(parseStatsOutput(line), [
        {name: 'api_api-1_1', cpu: '0.42%', mem: '48.3MiB', memPerc: '0.61%'},
    ]);

});

test('parseStatsOutput fills missing fields with a dash', (assert) => {

    const line = JSON.stringify({Name: 'worker'});

    assert.equal(parseStatsOutput(line), [
        {name: 'worker', cpu: '—', mem: '—', memPerc: '—'},
    ]);

});
