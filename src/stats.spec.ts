import {test} from 'kizu';
import {parseStatsOutput, formatBytes} from './stats.js';

test('parseStatsOutput returns empty array for empty input', (assert) => {

    assert.equal(parseStatsOutput(''), []);
    assert.equal(parseStatsOutput('   \n  '), []);

});

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

test('formatBytes handles zero and invalid values', (assert) => {

    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(-5), '0 B');
    assert.equal(formatBytes(Number.NaN), '0 B');

});

test('formatBytes formats across units', (assert) => {

    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(1024), '1 KB');
    assert.equal(formatBytes(1536), '1.5 KB');
    assert.equal(formatBytes(5 * 1024 * 1024), '5 MB');
    assert.equal(formatBytes(2 * 1024 * 1024 * 1024), '2 GB');

});
