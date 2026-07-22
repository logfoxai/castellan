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

const API_METHODS = new Set<ApiMethod>([
    'status',
    'forceCheck',
    'pause',
    'resume',
    'rollback',
    'history',
    'dockerContainers',
    'dockerImages',
    'dockerNetworks',
    'dockerVolumes',
    'dockerLogs',
    'dockerStats',
    'dockerStatsAll',
    'dockerInfo',
    'dockerEvents',
]);

function isApiMethod(value: string): value is ApiMethod {

    return API_METHODS.has(value as ApiMethod);

}

export function createRouter(roller: Roller, docker: DockerClient, authToken?: string): Router {

    const router = Router();

    router.get('/health', (_req, res) => {

        res.status(200).send('OK');

});

    router.post('/:method', requireAuth(authToken), async (req, res, next) => {

        try {

            const {method} = req.params;

            if (!isApiMethod(method)) {

                res.status(404).json({error: `Unknown method: ${method}`});
                return;

}

            const result = await dispatchMethod(method, req.body, roller, docker);

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

export async function dispatchMethod(
    method: ApiMethod,
    body: unknown,
    roller: Roller,
    docker: DockerClient,
): Promise<unknown> {

    if (method.startsWith('docker')) {

        return dispatchDocker(method, docker, body);

}

    return dispatchRoller(method, body, roller);

}

async function dispatchRoller(method: ApiMethod, body: unknown, roller: Roller): Promise<unknown> {

    switch (method) {

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
            return rollback(roller, body);
        case 'history':
            return history(roller);
        default:
            throw new Error(`Unknown method: ${method}`);

}

}

async function dispatchDocker(method: ApiMethod, docker: DockerClient, body: unknown): Promise<unknown> {

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

async function rollback(roller: Roller, body: unknown): Promise<{ok: boolean}> {

    if (!body || typeof body !== 'object' || !('service' in body) || typeof body.service !== 'string') {

        throw new Error('Expected body with a string service property');

}

    const ok = await roller.rollback(body.service);

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
