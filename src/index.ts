import path from 'path';
import express from 'express';
import {existsSync} from 'fs';
import {DockerClient} from './docker.js';
import {StateManager} from './state.js';
import {Roller} from './roller.js';
import {createRouter, SESSION_COOKIE} from './api.js';
import {resolveAuthToken} from './auth-token.js';
import {loadConfigOrDiscover} from './config.js';
import {createRegistry} from './registry-factory.js';
import {CachingRegistry} from './registry.js';
import type {ApiConfig} from './types.js';

const DEFAULT_STATE_PATH = '/app/state/state.json';
const DEFAULT_SOCKET_PATH = '/var/run/docker.sock';
const UI_DIR = path.join(__dirname, 'ui');
const ASSETS_DIR = '/app/assets';

function mountDashboard(app: express.Express, authToken?: string): void {

    if (!existsSync(UI_DIR)) {

        return;

}

    app.use(express.static(UI_DIR));
    app.get('*', (_req, res) => {

        // The dashboard is trusted by virtue of being served from this
        // (network-protected) origin. Hand the browser a same-site, httpOnly
        // session cookie so its API calls authenticate without a user-entered
        // token. The Bearer token stays required for external clients (CLI,
        // automation) that never receive this cookie.
        if (authToken) {

            res.cookie(SESSION_COOKIE, authToken, {httpOnly: true, sameSite: 'strict', path: '/'});

}

        res.sendFile(path.join(UI_DIR, 'index.html'));

});

}

async function startApiServer(
    api: ApiConfig,
    statePath: string,
    roller: Roller,
    docker: DockerClient,
): Promise<void> {

    const auth = await resolveAuthToken(api.authToken, statePath);

    if (auth.source === 'generated') {

        console.warn(
            `No api.authToken configured; generated an API secret at ${auth.tokenFilePath}. `
            + 'Use it as Authorization: Bearer <token> for curl/scripts. '
            + 'The dashboard sets a session cookie automatically — no login UI.',
        );

}

    const app = express();

    app.use(express.json());
    app.use('/v1', createRouter(roller, docker, auth.token));

    if (api.dashboard) {

        app.use('/assets', express.static(ASSETS_DIR));
        mountDashboard(app, auth.token);

} else {

        console.log('Dashboard disabled in config; RPC API only on /v1');

}

    const port = process.env.PORT ? Number(process.env.PORT) : api.port;

    app.listen(port, () => {

        console.log(`Castellan listening on port ${port}`);

});

}

async function main(): Promise<void> {

    const docker = new DockerClient(process.env.DOCKER_SOCKET ?? DEFAULT_SOCKET_PATH);
    const config = await loadConfigOrDiscover(docker, process.env.CASTELLAN_CONFIG);
    const registry = new CachingRegistry(createRegistry(config.registries), config.poll.intervalMs);
    const statePath = process.env.CASTELLAN_STATE ?? DEFAULT_STATE_PATH;
    const state = new StateManager(statePath);

    await state.load();
    await state.save();

    const roller = new Roller(config, registry, docker, state);

    await roller.syncDiscoveredServices();

    roller.start();

    if (!config.api.enabled) {

        console.log('API disabled in config; running headless (polling and rollouts only)');

        return;

}

    await startApiServer(config.api, statePath, roller, docker);

}

main().catch((err) => {

    console.error(err);
    process.exit(1);

});
