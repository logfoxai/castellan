import {Router, type Request, type Response, type NextFunction} from 'express';
import type {DockerClient, ContainerInfoWithSize} from './docker.js';
import {formatContainerDisplayName} from './container-display.js';
import type {Roller} from './roller.js';
import {formatBytes} from './stats.js';

export type ApiMethod =
    | 'status'
    | 'forceCheck'
    | 'pause'
    | 'resume'
    | 'rollback'
    | 'history'
    | 'dockerContainers'
    | 'dockerImages'
    | 'dockerNetworks'
    | 'dockerVolumes'
    | 'dockerLogs'
    | 'dockerStats'
    | 'dockerStatsAll'
    | 'dockerInfo'
    | 'dockerEvents';

export type ApiRequest = {
    method: ApiMethod;
    args?: unknown[];
};

export function createRouter(roller: Roller, docker: DockerClient, authToken?: string): Router {

    const router = Router();

    router.get('/health', (_req, res) => {

        res.status(200).send('OK');

});

    router.post('/', requireAuth(authToken), async (req, res, next) => {

        try {

            const payload = req.body as ApiRequest;
            const result = await dispatch(payload, roller, docker);

            res.json(result);

} catch (err) {

            next(err);

}

});

    router.use((err: Error, _req: Request, res: Response, __next: NextFunction) => {

        console.error(err);
        res.status(500).json({error: err.message});

});

    return router;

}

export const SESSION_COOKIE = 'castellan_session';

export function readCookie(header: string | undefined, name: string): string | undefined {

    if (!header) {

        return undefined;

}

    for (const part of header.split(';')) {

        const [key, ...rest] = part.trim().split('=');

        if (key === name) {

            return decodeURIComponent(rest.join('='));

}

}

    return undefined;

}

export function isAuthorized(
    authToken: string | undefined,
    headers: {authorization?: string; cookie?: string},
): boolean {

    if (!authToken) {

        return true;

}

    const bearer = (headers.authorization ?? '').replace(/^Bearer\s+/i, '');

    if (bearer === authToken) {

        return true;

}

    return readCookie(headers.cookie, SESSION_COOKIE) === authToken;

}

function requireAuth(authToken: string | undefined) {

    return (req: Request, res: Response, next: NextFunction): void => {

        if (isAuthorized(authToken, {authorization: req.headers.authorization, cookie: req.headers.cookie})) {

            next();
            return;

}

        res.status(401).json({error: 'Unauthorized'});

};

}

export async function dispatch(payload: ApiRequest, roller: Roller, docker: DockerClient): Promise<unknown> {

    const args = payload.args ?? [];

    switch (payload.method) {

        case 'status':
            return status(roller);
        case 'forceCheck':
            await roller.forceCheck();
            return {ok: true};
        case 'pause':
            roller.pause();
            return {paused: roller.getStatus().paused};
        case 'resume':
            roller.resume();
            return {paused: roller.getStatus().paused};
        case 'rollback':
            return rollback(roller, args);
        case 'history':
            return history(roller);
        default:
            return dispatchDocker(payload.method, docker, args);

}

}

async function dispatchDocker(method: ApiMethod, docker: DockerClient, args: unknown[]): Promise<unknown> {

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
            return dockerLogs(docker, args);
        case 'dockerStats':
            return dockerStats(docker, args);
        case 'dockerInfo':
            return {info: await docker.getInfo()};
        case 'dockerEvents':
            return dockerEvents(docker, args);
        default:
            throw new Error(`Unknown method: ${method}`);

}

}

export type ContainerRow = {
    id: string;
    name: string;
    displayName: string;
    image: string;
    state: string;
    status: string;
    disk: string;
};

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

function status(roller: Roller): {services: unknown[]; paused: boolean} {

    const {paused, services} = roller.getStatus();

    return {
        paused,
        services: services.map((service) => ({
            ...service,
            lastCheckAt: service.lastCheckAt?.toISOString() ?? null,
        })),
    };

}

async function rollback(roller: Roller, args: unknown[]): Promise<{ok: boolean}> {

    const input = args[0];

    if (!input || typeof input !== 'object' || !('service' in input) || typeof input.service !== 'string') {

        throw new Error('Expected args[0] to be an object with a string service property');

}

    const ok = await roller.rollback(input.service);

    return {ok};

}

function history(roller: Roller): {events: unknown[]} {

    return {
        events: roller.getEvents().map((event) => ({
            ...event,
            at: event.at.toISOString(),
        })),
    };

}

async function dockerLogs(docker: DockerClient, args: unknown[]): Promise<{logs: string}> {

    const input = args[0] as {containerId: string; tail?: number};

    return {logs: await docker.getContainerLogs(input.containerId, input.tail ?? 100)};

}

async function dockerStats(docker: DockerClient, args: unknown[]): Promise<{stats: unknown}> {

    const input = args[0] as {containerId: string};

    return {stats: await docker.getContainerStats(input.containerId)};

}

async function dockerEvents(docker: DockerClient, args: unknown[]): Promise<{events: unknown[]}> {

    const input = args[0] as {since?: number};

    return {events: await docker.getEvents(input.since ?? 300)};

}
