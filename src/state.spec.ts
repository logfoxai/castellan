import {test} from 'kizu';
import {mkdtemp, rm} from 'fs/promises';
import os from 'os';
import path from 'path';
import {StateManager} from './state.js';

test('StateManager persists deployments and events', async (assert) => {

    const dir = await mkdtemp(path.join(os.tmpdir(), 'castellan-state-'));
    const file = path.join(dir, 'state.json');
    const manager = new StateManager(file);

    manager.appendDeployment('api', {digest: 'sha256:abc', outcome: 'success'});
    manager.appendEvent({at: new Date('2026-01-01'), type: 'deploy', service: 'api', message: 'updated'});
    await manager.save();

    const restored = new StateManager(file);

    await restored.load();

    assert.equal(restored.getDeployments('api').length, 1);
    assert.equal(restored.getDeployments('api')[0]?.digest, 'sha256:abc');
    assert.equal(restored.getEvents().length, 1);

    await rm(dir, {recursive: true, force: true});

});

test('StateManager limits event and deployment history', async (assert) => {

    const dir = await mkdtemp(path.join(os.tmpdir(), 'castellan-state-'));
    const file = path.join(dir, 'state.json');
    const manager = new StateManager(file);

    for (let i = 0; i < 550; i += 1) {

        manager.appendEvent({at: new Date(), type: 'check', service: 'api', message: `event ${i}`});

}

    assert.equal(manager.getEvents().length, 500);

    for (let i = 0; i < 110; i += 1) {

        manager.appendDeployment('api', {digest: `sha256:${i}`, outcome: 'success'});

}

    assert.equal(manager.getDeployments('api').length, 100);
    assert.equal(manager.getDeployments('api')[0]?.digest, 'sha256:109');

    await rm(dir, {recursive: true, force: true});

});

test('StateManager findRollbackDigest prefers success before in-flight desired digest', (assert) => {

    const manager = new StateManager('/tmp/unused-state.json');

    manager.appendDeployment('api', {digest: 'sha256:new', outcome: 'failed', reject: true});
    manager.appendDeployment('api', {digest: 'sha256:known-good', outcome: 'success'});

    assert.equal(
        manager.findRollbackDigest('api', 'sha256:known-good', 'sha256:new'),
        'sha256:known-good',
    );

});

test('StateManager migrates v1 state without backfill', async (assert) => {

    const dir = await mkdtemp(path.join(os.tmpdir(), 'castellan-state-'));
    const file = path.join(dir, 'state.json');
    const {writeFile} = await import('fs/promises');

    await writeFile(file, JSON.stringify({
        version: 1,
        knownGood: {api: 'sha256:old'},
        badDigests: {api: ['sha256:bad']},
        events: [],
    }), 'utf8');

    const manager = new StateManager(file);

    await manager.load();

    assert.equal(manager.getDeployments('api').length, 0);
    assert.equal(manager.getRejectedDigests('api').length, 0);

    await rm(dir, {recursive: true, force: true});

});

test('StateManager tracks rejected digests from deployment records', (assert) => {

    const manager = new StateManager('/tmp/unused-state.json');

    manager.appendDeployment('api', {digest: 'sha256:bad', outcome: 'failed', reject: true});
    manager.setDigestRejected('api', 'sha256:manual', true);

    assert.equal(manager.isDigestRejected('api', 'sha256:bad'), true);
    assert.equal(manager.isDigestRejected('api', 'sha256:manual'), true);
    assert.equal(manager.getRejectedDigests('api').length, 2);

});
