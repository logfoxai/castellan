import {Router, type Request, type Response, type NextFunction} from 'express';
import type {DockerClient} from './docker.js';
import {dispatchDockerMethod} from './api-docker.js';
import {isApiMethod, isDockerMethod} from './api-methods.js';
import type {RollerPort} from './roller-port.js';

export {isApiMethod} from './api-methods.js';
export type {ApiMethod} from './api-methods.js';

export function createRouter(roller: RollerPort, docker: DockerClient, authToken?: string): Router {

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
    method: import('./api-methods.js').ApiMethod,
    body: unknown,
    roller: RollerPort,
    docker: DockerClient,
): Promise<unknown> {

    if (isDockerMethod(method)) {

        return dispatchDockerMethod(method, docker, body);

}

    return dispatchRollerMethod(method, body, roller);

}

async function dispatchRollerMethod(
    method: import('./api-methods.js').ApiMethod,
    body: unknown,
    roller: RollerPort,
): Promise<unknown> {

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

function status(roller: RollerPort): {services: unknown[]; paused: boolean} {

    const {paused, services} = roller.getStatus();

    return {
        paused,
        services: services.map((service) => ({
            ...service,
            lastCheckAt: service.lastCheckAt?.toISOString() ?? null,
        })),
    };

}

async function rollback(roller: RollerPort, body: unknown): Promise<{ok: boolean}> {

    if (!body || typeof body !== 'object' || !('service' in body) || typeof body.service !== 'string') {

        throw new Error('Expected body with a string service property');

}

    const ok = await roller.rollback(body.service);

    return {ok};

}

function history(roller: RollerPort): {events: unknown[]} {

    return {
        events: roller.getEvents().map((event) => ({
            ...event,
            at: event.at.toISOString(),
        })),
    };

}
