import {test} from 'kizu';
import {mkdtemp, rm} from 'fs/promises';
import os from 'os';
import path from 'path';
import {StateManager} from './state.js';

test('StateManager persists known-good and events', async (assert) => {

    const dir = await mkdtemp(path.join(os.tmpdir(), 'castellan-state-'));
    const file = path.join(dir, 'state.json');
    const manager = new StateManager(file);

    manager.setKnownGood('api', 'sha256:abc');
    manager.appendEvent({at: new Date('2026-01-01'), type: 'deploy', service: 'api', message: 'updated'});
    await manager.save();

    const restored = new StateManager(file);

    await restored.load();

    assert.equal(restored.getKnownGood('api'), 'sha256:abc');
    assert.equal(restored.getEvents().length, 1);
    assert.equal(restored.getEvents()[0].service, 'api');

    await rm(dir, {recursive: true, force: true});

});

test('StateManager limits event history', async (assert) => {

    const dir = await mkdtemp(path.join(os.tmpdir(), 'castellan-state-'));
    const file = path.join(dir, 'state.json');
    const manager = new StateManager(file);

    for (let i = 0; i < 550; i += 1) {

        manager.appendEvent({at: new Date(), type: 'check', service: 'api', message: `event ${i}`});

}

    assert.equal(manager.getEvents().length, 500);

    await rm(dir, {recursive: true, force: true});

});
