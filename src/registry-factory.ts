import {createECRRegistry, ECRRegistry} from './ecr.js';
import {HttpRegistry} from './registry-http.js';
import type {Registry} from './registry.js';
import type {RegistryImage, RegistryManifest} from './types.js';

export function createRegistry(): Registry {

    const ecr = createECRRegistry();
    const http = new HttpRegistry();

    return new RouterRegistry(ecr, http);

}

class RouterRegistry implements Registry {

    constructor(
        private readonly ecr: ECRRegistry,
        private readonly http: HttpRegistry,
    ) {}

    async getManifest(image: RegistryImage): Promise<RegistryManifest> {

        if (isECR(image.registry)) {

            return this.ecr.getManifest(image);

}

        return this.http.getManifest(image);

}

}

function isECR(registry: string): boolean {

    return /^\d+\.dkr\.ecr\.[-\w]+\.amazonaws\.com$/.test(registry);

}
