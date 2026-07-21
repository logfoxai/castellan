import type {RegistryImage, RegistryManifest} from './types.js';

export interface Registry {
    getManifest(image: RegistryImage): Promise<RegistryManifest>;
    invalidate?(image: RegistryImage): void;
}

type CacheEntry = {
    manifest: RegistryManifest;
    fetchedAt: number;
};

export class CachingRegistry implements Registry {

    private readonly delegate: Registry;
    private readonly ttlMs: number;
    private readonly cache: Map<string, CacheEntry> = new Map();

    constructor(delegate: Registry, ttlMs: number) {

        this.delegate = delegate;
        this.ttlMs = ttlMs;

}

    async getManifest(image: RegistryImage): Promise<RegistryManifest> {

        const key = `${image.registry}/${image.repository}:${image.tag}`;
        const now = Date.now();
        const entry = this.cache.get(key);

        if (entry && now - entry.fetchedAt < this.ttlMs) {

            return entry.manifest;

}

        const manifest = await this.delegate.getManifest(image);

        this.cache.set(key, {manifest, fetchedAt: now});

        return manifest;

}

    invalidate(image: RegistryImage): void {

        const key = `${image.registry}/${image.repository}:${image.tag}`;

        this.cache.delete(key);

}

}
