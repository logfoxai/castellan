import type {DockerClient} from './docker.js';
import {listComposeProjects} from './compose-containers.js';
import {loadEnvConfig} from './env-config.js';
import type {Config} from './types.js';
import {discoverManagedServices} from './label-discovery.js';

export async function loadConfig(docker: DockerClient): Promise<Config> {

    const env = loadEnvConfig();
    const project = await resolveComposeProject(docker, env.compose.project);
    const managedServices = await discoverManagedServices(docker, project);

    if (managedServices.length === 0) {

        console.warn(
            'No labeled services found yet. Add ai.logfox.castellan.autoupdate to compose services '
            + 'you want Castellan to manage. Will keep checking on each poll.',
        );

    }

    return {
        managedServices,
        compose: {
            file: env.compose.file,
            project,
            envFile: env.compose.envFile,
        },
        poll: env.poll,
        rollback: env.rollback,
        api: env.api,
    };

}

async function resolveComposeProject(
    docker: DockerClient,
    fromEnv: string | undefined,
): Promise<string> {

    if (fromEnv) {

        return fromEnv;

    }

    const projects = listComposeProjects(await docker.listContainers());

    if (projects.length === 1) {

        console.info(
            `CASTELLAN_COMPOSE_PROJECT unset; using the only compose project on this host: ${projects[0]}`,
        );

        return projects[0];

    }

    if (projects.length === 0) {

        throw new Error(
            'Could not resolve compose project. Set CASTELLAN_COMPOSE_PROJECT to your stack name '
            + '(see `docker compose ls` or a container label com.docker.compose.project). '
            + 'Castellan does not read compose `name:` from the file.',
        );

    }

    throw new Error(
        `Could not resolve compose project: found multiple on this host (${projects.join(', ')}). `
        + 'Set CASTELLAN_COMPOSE_PROJECT to the one Castellan should manage '
        + '(see `docker compose ls`).',
    );

}
