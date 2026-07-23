import {test} from 'kizu';
import {CachingRegistry, type Registry} from './registry.js';
import type {RegistryImage, RegistryManifest} from './types.js';

class FakeRegistry implements Registry {

    calls = 0;

    async getManifest(image: RegistryImage): Promise<RegistryManifest> {

        this.calls += 1;

        return {
            digest: `sha256:${image.repository}-${image.tag}`,
            pushedAt: null,
        };

}

}

test('CachingRegistry caches within ttl', async (assert) => {

    const delegate = new FakeRegistry();
    const cache = new CachingRegistry(delegate, 1000);
    const image = {registry: 'r', repository: 'repo', tag: 't'};

    const first = await cache.getManifest(image);

    await cache.getManifest(image);

    assert.equal(first.digest, 'sha256:repo-t');
    assert.equal(delegate.calls, 1);

});

test('CachingRegistry invalidates cache', async (assert) => {

    const delegate = new FakeRegistry();
    const cache = new CachingRegistry(delegate, 1000);
    const image = {registry: 'r', repository: 'repo', tag: 't'};

    await cache.getManifest(image);
    cache.invalidate(image);
    await cache.getManifest(image);

    assert.equal(delegate.calls, 2);

});
