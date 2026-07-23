import type {DockerClient, ContainerInfoWithSize} from './docker.js';
import {formatContainerDisplayName} from './container-display.js';
import {formatBytes} from './stats.js';
import type {ApiMethod} from './api-methods.js';

export type ContainerRow = {
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
        case 'dockerImages':
            return {images: await docker.listImages()};
        case 'dockerNetworks':
            return {networks: await docker.listNetworks()};
        case 'dockerVolumes':
            return {volumes: await docker.listVolumes()};
        case 'dockerLogs':
            return dockerLogs(docker, body);
        case 'dockerStats':
            return dockerStats(docker, body);
        case 'dockerInfo':
            return {info: await docker.getInfo()};
        case 'dockerEvents':
            return dockerEvents(docker, body);
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

async function dockerStats(docker: DockerClient, body: unknown): Promise<{stats: unknown}> {

    const input = body as {containerId: string};

    return {stats: await docker.getContainerStats(input.containerId)};

}

async function dockerEvents(docker: DockerClient, body: unknown): Promise<{events: unknown[]}> {

    const input = (body ?? {}) as {since?: number};

    return {events: await docker.getEvents(input.since ?? 300)};

}
