import type {DockerClient} from './docker.js';
import type {ComposeConfig, ManagedService} from './types.js';
import {parseImageRef} from './watchtower.js';

export function normalizeRegistryHost(registry: string): string {

    if (registry === 'docker.io' || registry === 'registry.hub.docker.com') {

        return 'registry-1.docker.io';

}

    return registry;

}

export function imageRefKey(registry: string, repository: string, tag: string): string {

    return `${normalizeRegistryHost(registry)}/${repository}:${tag}`;

}

export function managedServiceMatchesImage(
    service: Pick<ManagedService, 'registry' | 'repository' | 'tag'>,
    parsed: {registry: string; repository: string; tag: string},
): boolean {

    return normalizeRegistryHost(service.registry) === normalizeRegistryHost(parsed.registry)
        && service.repository === parsed.repository
        && service.tag === parsed.tag;

}

export async function resolveComposeServicesFromContainers(
    docker: DockerClient,
    service: Pick<ManagedService, 'registry' | 'repository' | 'tag'>,
    compose: ComposeConfig,
): Promise<string[]> {

    const containers = await docker.listContainers();
    const names = new Set<string>();

    for (const container of containers) {

        const composeService = container.Labels?.['com.docker.compose.service'];

        if (!composeService) {

            continue;

}

        if (compose.project) {

            const containerProject = container.Labels?.['com.docker.compose.project'];

            if (containerProject && containerProject !== compose.project) {

                continue;

}

}

        const parsed = parseImageRef(container.Image);

        if (!parsed || !managedServiceMatchesImage(service, parsed)) {

            continue;

}

        names.add(composeService);

}

    return [...names].sort();

}

export function pickManagedServiceName(composeServices: string[], repository: string): string {

    if (composeServices.length === 1) {

        return composeServices[0];

}

    return repository;

}

function mergeComposeServiceNames(existing: ManagedService, service: ManagedService): string[] {

    const merged = new Set(existing.composeServices ?? []);
    const composeName = service.composeServices?.[0] ?? service.name;

    if (service.composeServices?.length) {

        for (const name of service.composeServices) {

            merged.add(name);

}

} else if (composeName) {

        merged.add(composeName);

}

    return [...merged].sort();

}

function toInitialGroupedService(service: ManagedService): ManagedService {

    const composeName = service.composeServices?.[0] ?? service.name;
    const composeServices = service.composeServices?.length
        ? [...service.composeServices]
        : composeName ? [composeName] : [];

    return {
        ...service,
        composeServices,
    };

}

function finalizeGroupedService(service: ManagedService): ManagedService {

    const composeServices = [...(service.composeServices ?? [])].sort();

    return {
        ...service,
        name: pickManagedServiceName(composeServices, service.repository),
        composeServices,
    };

}

export function mergeManagedServicesByImage(services: ManagedService[]): ManagedService[] {

    const groups = new Map<string, ManagedService>();

    for (const service of services) {

        const key = imageRefKey(service.registry, service.repository, service.tag);
        const existing = groups.get(key);

        if (!existing) {

            groups.set(key, toInitialGroupedService(service));
            continue;

}

        const composeServices = mergeComposeServiceNames(existing, service);

        groups.set(key, {
            ...existing,
            name: pickManagedServiceName(composeServices, existing.repository),
            composeServices,
            healthUrl: existing.healthUrl ?? service.healthUrl,
            healthIntervalMs: existing.healthIntervalMs,
            healthRetries: existing.healthRetries,
        });

}

    return Array.from(groups.values()).map(finalizeGroupedService);

}
