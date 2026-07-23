import {imageRefKey} from './image-ref.js';
import type {ManagedService} from './types.js';

function pickManagedServiceName(composeServices: string[], repository: string): string {

    if (composeServices.length === 1) {

        return composeServices[0];

}

    return repository;

}

function mergeGroupLabel(existing?: string, incoming?: string): string | undefined {

    if (!existing && !incoming) {

        return undefined;

}

    if (!existing) {

        return incoming;

}

    if (!incoming) {

        return existing;

}

    return existing === incoming ? existing : undefined;

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
    const name = service.group
        ?? pickManagedServiceName(composeServices, service.repository);

    return {
        ...service,
        name,
        composeServices,
        group: undefined,
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

        groups.set(key, {
            ...existing,
            composeServices: mergeComposeServiceNames(existing, service),
            healthUrl: existing.healthUrl ?? service.healthUrl,
            group: mergeGroupLabel(existing.group, service.group),
        });

}

    return Array.from(groups.values()).map(finalizeGroupedService);

}
