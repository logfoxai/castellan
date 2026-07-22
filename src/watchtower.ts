import type {ContainerInfo} from 'dockerode';
import type {DockerClient} from './docker.js';
import type {ComposeConfig, Config, ManagedService} from './types.js';

const WATCHTOWER_LABEL = 'com.centurylinklabs.watchtower.enable';

export async function discoverConfig(
    docker: DockerClient,
    compose: ComposeConfig = {file: '/app/docker-compose.yml'},
): Promise<Config> {

    const containers = await docker.listContainers();
    const services = new Map<string, ManagedService>();

    for (const container of containers) {

        if (container.Labels?.[WATCHTOWER_LABEL] !== 'true') {

            continue;

}

        const service = buildService(container);

        if (!service) {

            continue;

}

        const existing = services.get(service.name);

        if (!existing || container.State === 'running') {

            services.set(service.name, service);

}

}

    return {
        managedServices: Array.from(services.values()),
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
        composeServices: [composeService],
        healthIntervalMs: 5000,
        healthRetries: 10,
    };

}

export function parseImageRef(ref: string): {registry: string; repository: string; tag: string} | null {

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
