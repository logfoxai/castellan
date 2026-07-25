import type {DockerClient, ContainerInfoWithSize} from './docker.js';
import {formatContainerDisplayName} from './container-display.js';
import {formatBytes} from './stats.js';

export type ApiMethod =
    | 'status'
    | 'forceCheck'
    | 'pause'
    | 'resume'
    | 'deploy'
    | 'reject'
    | 'setPollEnabled'
    | 'history'
    | 'deployments'
    | 'dockerContainers'
    | 'dockerLogs'
    | 'dockerStatsAll';

const API_METHODS = new Set<ApiMethod>([
    'status',
    'forceCheck',
    'pause',
    'resume',
    'deploy',
    'reject',
    'setPollEnabled',
    'history',
    'deployments',
    'dockerContainers',
    'dockerLogs',
    'dockerStatsAll',
]);

export function isApiMethod(value: string): value is ApiMethod {

    return API_METHODS.has(value as ApiMethod);

}

export function isDockerMethod(method: ApiMethod): boolean {

    return method.startsWith('docker');

}

type ContainerRow = {
    id: string;
    name: string;
    displayName: string;
    image: string;
    state: string;
    status: string;
    disk: string;
};

export async function dispatchDockerMethod(
    method: ApiMethod,
    docker: DockerClient,
    body: unknown,
): Promise<unknown> {

    switch (method) {

        case 'dockerContainers':
            return {containers: (await docker.listContainers()).map(toContainerRow)};
        case 'dockerStatsAll':
            return {stats: await docker.getAllStats()};
        case 'dockerLogs':
            return dockerLogs(docker, body);
        default:
            throw new Error(`Unknown method: ${method}`);

}

}

function toContainerRow(container: ContainerInfoWithSize): ContainerRow {

    const name = (container.Names?.[0] ?? '').replace(/^\//, '') || container.Id.slice(0, 12);

    return {
        id: container.Id,
        name,
        displayName: formatContainerDisplayName(name),
        image: container.Image,
        state: container.State,
        status: container.Status,
        disk: formatBytes(container.SizeRw ?? 0),
    };

}

async function dockerLogs(docker: DockerClient, body: unknown): Promise<{logs: string}> {

    const input = body as {containerId: string; tail?: number};

    return {logs: await docker.getContainerLogs(input.containerId, input.tail ?? 100)};

}
