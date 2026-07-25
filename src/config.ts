import {readFile} from 'fs/promises';
import path from 'path';
import type {DockerClient} from './docker.js';
import {loadEnvConfig} from './env-config.js';
import type {Config} from './types.js';
import {discoverManagedServices} from './label-discovery.js';

export async function loadConfig(docker: DockerClient): Promise<Config> {

    const env = loadEnvConfig();
    const compose = {...env.compose};

    compose.project = compose.project ?? await inferComposeProject(compose.file);

    if (!compose.project) {

        throw new Error(
            'Could not resolve compose project. Set CASTELLAN_COMPOSE_PROJECT (or add a top-level '
            + '`name:` to the compose file). Without it Castellan cannot target the correct stack '
            + 'for health checks and deploys.',
        );

    }

    const managedServices = await discoverManagedServices(docker, compose.project);

    if (managedServices.length === 0) {

        console.warn(
            'No labeled services found yet. Add ai.logfox.castellan.autoupdate to compose services '
            + 'you want Castellan to manage. Will keep checking on each poll.',
        );

    }

    return {
        managedServices,
        compose: {
            file: compose.file,
            project: compose.project,
            envFile: compose.envFile,
        },
        poll: env.poll,
        rollback: env.rollback,
        api: env.api,
    };

}

async function inferComposeProject(file: string): Promise<string | undefined> {

    try {

        const content = await readFile(file, 'utf8');
        const nameMatch = /^name:\s*(\S+)/m.exec(content);

        if (nameMatch) {

            return nameMatch[1];

        }

        const dir = path.dirname(file);
        const inferred = path.basename(dir);

        if (inferred === 'app' || inferred === 'compose' || inferred === '.') {

            return undefined;

        }

        return inferred;

    } catch {

        return undefined;

    }

}
