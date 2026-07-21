import {BatchGetImageCommand, ECRClient} from '@aws-sdk/client-ecr';
import {isManifestList, resolveManifestList} from './manifest.js';
import type {Registry} from './registry.js';
import type {RegistryImage, RegistryManifest} from './types.js';

export class ECRRegistry implements Registry {

    private readonly clients: Map<string, ECRClient> = new Map();
    private readonly defaultRegion: string | undefined;

    constructor(defaultRegion?: string) {

        this.defaultRegion = defaultRegion;

}

    async getManifest(image: RegistryImage): Promise<RegistryManifest> {

        const client = this.getClient(image.registry);
        const command = buildBatchGetImageCommand(image, this.parseRegistryId(image.registry));
        const response = await client.send(command);
        const found = response.images?.[0];

        if (!found || !found.imageId?.imageDigest) {

            throw new Error(`Image not found: ${image.repository}:${image.tag}`);

}

        return buildManifest(found.imageId.imageDigest, found.imageManifest);

}

    private getClient(registry: string): ECRClient {

        const region = parseRegion(registry) ?? this.defaultRegion ?? 'us-east-2';
        const existing = this.clients.get(region);

        if (existing) {

            return existing;

}

        const client = new ECRClient({region});

        this.clients.set(region, client);

        return client;

}

    private parseRegistryId(registry: string): string | undefined {

        const match = /^\d+\.dkr\.ecr\.[-\w]+\.amazonaws\.com$/.exec(registry);

        return match ? registry.split('.')[0] : undefined;

}

}

function parseRegion(registry: string): string | undefined {

    const match = /^\d+\.dkr\.ecr\.([-\w]+)\.amazonaws\.com$/.exec(registry);

    return match ? match[1] : undefined;

}

function buildBatchGetImageCommand(image: RegistryImage, registryId: string | undefined): BatchGetImageCommand {

    return new BatchGetImageCommand({
        registryId,
        repositoryName: image.repository,
        imageIds: [{imageTag: image.tag}],
        acceptedMediaTypes: [
            'application/vnd.docker.distribution.manifest.v2+json',
            'application/vnd.docker.distribution.manifest.list.v2+json',
            'application/vnd.oci.image.manifest.v1+json',
            'application/vnd.oci.image.index.v1+json',
        ],
    });

}

function buildManifest(digest: string, manifest: string | undefined): RegistryManifest {

    if (manifest && isManifestList(undefined, manifest)) {

        return {
            digest: resolveManifestList(manifest),
            pushedAt: null,
            manifest,
        };

}

    return {
        digest,
        pushedAt: null,
        manifest,
    };

}

export function createECRRegistry(): ECRRegistry {

    return new ECRRegistry(process.env.AWS_REGION);

}
