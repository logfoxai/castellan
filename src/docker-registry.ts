import type {DockerClient} from './docker.js';
import type {Registry} from './registry.js';
import type {RegistryImage, RegistryManifest} from './types.js';

export class DockerRegistry implements Registry {

    constructor(private readonly docker: DockerClient) {}

    async getManifest(image: RegistryImage): Promise<RegistryManifest> {

        return this.docker.manifestInspect(image.registry, image.repository, image.tag);

}

}
