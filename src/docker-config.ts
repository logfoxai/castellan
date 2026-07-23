import {existsSync} from 'fs';
import {readFile} from 'fs/promises';
import path from 'path';
import type {RegistryCredentials} from './types.js';

type DockerConfigAuth = {
    auth?: string;
    username?: string;
    password?: string;
};

type DockerConfigJson = {
    auths?: Record<string, DockerConfigAuth>;
};

export async function loadDockerConfigCredentials(): Promise<Record<string, RegistryCredentials>> {

    const dockerConfigDir = process.env.DOCKER_CONFIG;

    if (!dockerConfigDir) {

        return {};

}

    const configPath = path.join(dockerConfigDir, 'config.json');

    if (!existsSync(configPath)) {

        return {};

}

    const raw = await readFile(configPath, 'utf8');
    let parsed: DockerConfigJson;

    try {

        parsed = JSON.parse(raw) as DockerConfigJson;

} catch {

        throw new Error(`Invalid JSON in ${configPath}`);

}

    const result: Record<string, RegistryCredentials> = {};

    for (const [host, entry] of Object.entries(parsed.auths ?? {})) {

        const creds = parseAuthEntry(entry);

        if (creds) {

            result[host] = creds;

}

}

    return result;

}

export function mergeRegistryCredentials(
    dockerConfig: Record<string, RegistryCredentials>,
    override?: Record<string, RegistryCredentials>,
): Record<string, RegistryCredentials> {

    if (!override) {

        return {...dockerConfig};

}

    return {...dockerConfig, ...override};

}

function parseAuthEntry(entry: DockerConfigAuth): RegistryCredentials | null {

    if (entry.username && entry.password) {

        return {username: entry.username, password: entry.password};

}

    if (!entry.auth) {

        return null;

}

    const decoded = Buffer.from(entry.auth, 'base64').toString('utf8');
    const colon = decoded.indexOf(':');

    if (colon < 0) {

        return null;

}

    return {
        username: decoded.slice(0, colon),
        password: decoded.slice(colon + 1),
    };

}
