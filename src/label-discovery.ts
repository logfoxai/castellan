import type {ContainerInfo} from 'dockerode';
import type {DockerClient} from './docker.js';
import {mergeManagedServicesByImage} from './compose-targets.js';
import {parseImageRef} from './image-ref.js';
import type {ManagedService} from './types.js';

/** Native Castellan opt-in label (reverse-DNS for logfox.ai). */
export const CASTELLAN_AUTUPDATE_LABEL = 'ai.logfox.castellan.autoupdate';

/** Optional logical service name when multiple replicas share one image. */
export const CASTELLAN_GROUP_LABEL = 'ai.logfox.castellan.group';

const HEALTH_POLL_INTERVAL_MS = 5000;

export function hasDiscoveryLabel(labels: Record<string, string> | undefined): boolean {

    if (!labels) {

        return false;

}

    const castellan = labels[CASTELLAN_AUTUPDATE_LABEL];

    return castellan !== undefined && castellan !== 'false';

}

export async function discoverManagedServices(docker: DockerClient): Promise<ManagedService[]> {

    const containers = await docker.listContainers();
    const discovered: ManagedService[] = [];

    for (const container of containers) {

        if (!hasDiscoveryLabel(container.Labels)) {

            continue;

}

        const service = buildService(container);

        if (!service) {

            continue;

}

        discovered.push(service);

}

    return mergeManagedServicesByImage(discovered);

}

function buildService(container: ContainerInfo): ManagedService | null {

    const composeService = container.Labels?.['com.docker.compose.service'];
    const imageRef = container.Image;

    if (!composeService || !imageRef) {

        return null;

}

    const parsed = parseImageRef(imageRef);

    if (!parsed) {

        return null;

}

    const group = container.Labels?.[CASTELLAN_GROUP_LABEL]?.trim();

    return {
        name: composeService,
        registry: parsed.registry,
        repository: parsed.repository,
        tag: parsed.tag,
        group: group || undefined,
    };

}

export {HEALTH_POLL_INTERVAL_MS};
