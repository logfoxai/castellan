import {readFile} from 'fs/promises';
import path from 'path';
import type {DockerClient} from './docker.js';
import {loadEnvConfig} from './env-config.js';
import type {Config} from './types.js';
import {discoverManagedServices} from './label-discovery.js';

export async function loadConfig(docker: DockerClient): Promise<Config> {

    const env = loadEnvConfig();
    const managedServices = await discoverManagedServices(docker);

    if (managedServices.length === 0) {

        throw new Error(
            'No labeled services found. Add ai.logfox.castellan.autoupdate to compose services '
            + 'you want Castellan to manage.',
        );

}

    const compose = {...env.compose};

    compose.project = compose.project ?? await inferComposeProject(compose.file);

    return {
        managedServices,
        compose,
        poll: env.poll,
        rollback: env.rollback,
        api: env.api,
        registries: env.registries,
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

        return path.basename(dir);

} catch {

        return undefined;

}

}
