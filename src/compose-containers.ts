import type {ContainerInfo} from 'dockerode';
import type {ComposeConfig, ManagedService} from './types.js';
import {managedServiceMatchesImage, parseImageRef} from './image-ref.js';

function getComposeServiceName(container: ContainerInfo): string | undefined {

    return container.Labels?.['com.docker.compose.service'];

}

export function matchesComposeProject(container: ContainerInfo, project?: string): boolean {

    if (!project) {

        return false;

}

    return container.Labels?.['com.docker.compose.project'] === project;

}

export function findNewestRunningComposeContainer(
    containers: ContainerInfo[],
    serviceName: string,
    compose: ComposeConfig,
): ContainerInfo | null {

    const running = containers
        .filter((container) =>
            container.State === 'running'
            && getComposeServiceName(container) === serviceName
            && matchesComposeProject(container, compose.project),
        )
        .sort((a, b) => b.Created - a.Created);

    return running[0] ?? null;

}

export function listComposeServiceNamesForImage(
    containers: ContainerInfo[],
    service: Pick<ManagedService, 'registry' | 'repository' | 'tag'>,
    compose: ComposeConfig,
): string[] {

    const names = new Set<string>();

    for (const container of containers) {

        const composeService = getComposeServiceName(container);

        if (!composeService || !matchesComposeProject(container, compose.project)) {

            continue;

}

        const parsed = parseImageRef(container.Image);

        if (!parsed || !managedServiceMatchesImage(service, parsed)) {

            continue;

}

        names.add(composeService);

}

    return [...names].sort();

}
