import type {ManagedService} from './types.js';

export type ParsedImageRef = {
    registry: string;
    repository: string;
    tag: string;
};

export function parseImageRef(ref: string): ParsedImageRef | null {

    if (ref.startsWith('sha256:') || ref.includes('@sha256:')) {

        return null;

}

    const tagMatch = /:([^/]+)$/.exec(ref);
    const tag = tagMatch ? tagMatch[1] : 'latest';
    const withoutTag = tagMatch ? ref.slice(0, -tagMatch[0].length) : ref;
    const parts = withoutTag.split('/');

    if (parts.length >= 2 && parts[0].includes('.')) {

        return {
            registry: parts[0],
            repository: parts.slice(1).join('/'),
            tag,
        };

}

    if (parts.length === 2) {

        return {
            registry: 'docker.io',
            repository: `${parts[0]}/${parts[1]}`,
            tag,
        };

}

    return {
        registry: 'docker.io',
        repository: `library/${withoutTag}`,
        tag,
    };

}

export function normalizeRegistryHost(registry: string): string {

    if (registry === 'docker.io' || registry === 'registry.hub.docker.com') {

        return 'registry-1.docker.io';

}

    return registry;

}

export function formatImageRef(registry: string, repository: string, tag: string): string {

    return `${registry}/${repository}:${tag}`;

}

export function imageRefKey(registry: string, repository: string, tag: string): string {

    return `${normalizeRegistryHost(registry)}/${repository}:${tag}`;

}

export function managedServiceMatchesImage(
    service: Pick<ManagedService, 'registry' | 'repository' | 'tag'>,
    parsed: ParsedImageRef,
): boolean {

    return normalizeRegistryHost(service.registry) === normalizeRegistryHost(parsed.registry)
        && service.repository === parsed.repository
        && service.tag === parsed.tag;

}
