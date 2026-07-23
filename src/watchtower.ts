import type {ContainerInfo} from 'dockerode';
import type {DockerClient} from './docker.js';
import {mergeManagedServicesByImage} from './compose-targets.js';
import {parseImageRef} from './image-ref.js';
import type {ComposeConfig, Config, ManagedService} from './types.js';

/** Native Castellan opt-in label (reverse-DNS for logfox.ai). */
export const CASTELLAN_AUTUPDATE_LABEL = 'ai.logfox.castellan.autoupdate';

/** Legacy Watchtower opt-in label (`watchtower --label-enable`). */
export const WATCHTOWER_ENABLE_LABEL = 'com.centurylinklabs.watchtower.enable';

export const DISCOVERY_LABELS = [
    CASTELLAN_AUTUPDATE_LABEL,
    WATCHTOWER_ENABLE_LABEL,
] as const;

export function hasDiscoveryLabel(labels: Record<string, string> | undefined): boolean {

    if (!labels) {

        return false;

}

    const castellan = labels[CASTELLAN_AUTUPDATE_LABEL];

    if (castellan !== undefined && castellan !== 'false') {

        return true;

}

    return labels[WATCHTOWER_ENABLE_LABEL] === 'true';

}

export async function discoverConfig(
    docker: DockerClient,
    compose: ComposeConfig = {file: '/app/docker-compose.yml'},
): Promise<Config> {

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

    return {
        managedServices: mergeManagedServicesByImage(discovered),
        compose,
        poll: {enabled: true, intervalMs: 60000, jitterMs: 5000},
        rollback: {healthTimeoutMs: 120000, maxAttempts: 1},
        api: {enabled: true, dashboard: true, port: 3003},
    };

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

    return {
        name: composeService,
        registry: parsed.registry,
        repository: parsed.repository,
        tag: parsed.tag,
        healthIntervalMs: 5000,
        healthRetries: 10,
    };

}
