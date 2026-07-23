import {Router, type Request, type Response, type NextFunction} from 'express';
import type {DockerClient} from './docker.js';
import {dispatchDockerMethod, isApiMethod, isDockerMethod, type ApiMethod} from './api-docker.js';
import type {RollerPort} from './roller-port.js';

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
    method: ApiMethod,
    body: unknown,
    roller: RollerPort,
    docker: DockerClient,
): Promise<unknown> {

    if (isDockerMethod(method)) {

        return dispatchDockerMethod(method, docker, body);

}

    return dispatchRollerMethod(method, body, roller);

}

const ROLLER_METHODS: Partial<Record<ApiMethod, (roller: RollerPort, body: unknown) => Promise<unknown>>> = {
    status: async (roller) => status(roller),
    forceCheck: async (roller) => {

        await roller.forceCheck();

        return {ok: true};

},
    pause: async (roller) => {

        roller.pause();

        return {paused: roller.getStatus().paused};

},
    resume: async (roller) => {

        roller.resume();

        return {paused: roller.getStatus().paused};

},
    rollback: async (roller, body) => rollback(roller, body),
    deploy: async (roller, body) => deploy(roller, body),
    reject: async (roller, body) => reject(roller, body),
    history: async (roller) => history(roller),
    deployments: async (roller, body) => deployments(roller, body),
};

async function dispatchRollerMethod(
    method: ApiMethod,
    body: unknown,
    roller: RollerPort,
): Promise<unknown> {

    const handler = ROLLER_METHODS[method];

    if (!handler) {

        throw new Error(`Unknown method: ${method}`);

}

    return handler(roller, body);

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

    const service = readService(body);

    const ok = await roller.rollback(service);

    return {ok};

}

async function deploy(roller: RollerPort, body: unknown): Promise<{ok: boolean}> {

    if (!body || typeof body !== 'object' || !('service' in body) || !('digest' in body)) {

        throw new Error('Expected body with string service and digest properties');

}

    const service = readService(body);
    const digest = (body as {digest: unknown}).digest;

    if (typeof digest !== 'string' || digest.length === 0) {

        throw new Error('Expected body with string service and digest properties');

}

    const ok = await roller.deploy(service, digest);

    return {ok};

}

async function reject(roller: RollerPort, body: unknown): Promise<{ok: boolean}> {

    if (!body || typeof body !== 'object' || !('service' in body) || !('digest' in body)) {

        throw new Error('Expected body with string service and digest properties');

}

    const service = readService(body);
    const digest = (body as {digest: unknown}).digest;

    if (typeof digest !== 'string' || digest.length === 0) {

        throw new Error('Expected body with string service and digest properties');

}

    const ok = await roller.reject(service, digest);

    return {ok};

}

function deployments(roller: RollerPort, body: unknown): {deployments: unknown[]} {

    const service = readService(body);

    return {
        deployments: roller.getDeployments(service),
    };

}

function readService(body: unknown): string {

    if (!body || typeof body !== 'object' || !('service' in body) || typeof body.service !== 'string') {

        throw new Error('Expected body with a string service property');

}

    return body.service;

}

function history(roller: RollerPort): {events: unknown[]} {

    return {
        events: roller.getEvents().map((event) => ({
            ...event,
            at: event.at.toISOString(),
        })),
    };

}
