import type {ApiConfig, ComposeConfig, PollConfig, RegistryCredentials} from './types.js';

export type EnvConfig = {
    compose: ComposeConfig;
    poll: PollConfig;
    rollback: {healthTimeoutMs: number; maxAttempts: number};
    api: ApiConfig;
    registries?: Record<string, RegistryCredentials>;
};

export function loadEnvConfig(): EnvConfig {

    const poll = loadPollConfig();

    return {
        compose: loadComposeConfig(),
        poll,
        rollback: loadRollbackConfig(),
        api: loadApiConfig(),
        registries: loadRegistriesOverride(),
    };

}

function loadComposeConfig(): ComposeConfig {

    return {
        file: process.env.CASTELLAN_COMPOSE_FILE ?? '/app/docker-compose.yml',
        project: envOptionalString('CASTELLAN_COMPOSE_PROJECT'),
        envFile: envOptionalString('CASTELLAN_COMPOSE_ENV_FILE'),
    };

}

function loadPollConfig(): PollConfig {

    const intervalMs = envNumber('CASTELLAN_POLL_INTERVAL_MS', 60000);
    const enabled = envBool('CASTELLAN_POLL_ENABLED', intervalMs > 0);

    return {
        enabled: enabled && intervalMs > 0,
        intervalMs,
        jitterMs: envNumber('CASTELLAN_POLL_JITTER_MS', 5000),
    };

}

function loadRollbackConfig(): {healthTimeoutMs: number; maxAttempts: number} {

    return {
        healthTimeoutMs: envNumber('CASTELLAN_ROLLBACK_HEALTH_TIMEOUT_MS', 120000),
        maxAttempts: envNumber('CASTELLAN_ROLLBACK_MAX_ATTEMPTS', 1),
    };

}

function loadApiConfig(): ApiConfig {

    return {
        enabled: envBool('CASTELLAN_API_ENABLED', true),
        dashboard: envBool('CASTELLAN_DASHBOARD_ENABLED', true),
        port: envNumber('CASTELLAN_API_PORT', 3003),
        authToken: envOptionalString('CASTELLAN_AUTH_TOKEN'),
    };

}

function loadRegistriesOverride(): Record<string, RegistryCredentials> | undefined {

    const raw = process.env.CASTELLAN_REGISTRIES_JSON;

    if (!raw) {

        return undefined;

}

    let parsed: unknown;

    try {

        parsed = JSON.parse(raw);

} catch {

        throw new Error('CASTELLAN_REGISTRIES_JSON must be valid JSON');

}

    if (typeof parsed !== 'object' || parsed === null) {

        throw new Error('CASTELLAN_REGISTRIES_JSON must be an object');

}

    const result: Record<string, RegistryCredentials> = {};

    for (const [host, value] of Object.entries(parsed as Record<string, unknown>)) {

        if (typeof value !== 'object' || value === null) {

            throw new Error(`CASTELLAN_REGISTRIES_JSON.${host} must be an object`);

}

        const creds = value as Record<string, unknown>;

        if (typeof creds.username !== 'string' || typeof creds.password !== 'string') {

            throw new Error(`CASTELLAN_REGISTRIES_JSON.${host} requires username and password strings`);

}

        result[host] = {username: creds.username, password: creds.password};

}

    return result;

}

function envBool(name: string, defaultValue: boolean): boolean {

    const raw = process.env[name];

    if (raw === undefined || raw === '') {

        return defaultValue;

}

    if (raw === 'true' || raw === '1') {

        return true;

}

    if (raw === 'false' || raw === '0') {

        return false;

}

    throw new Error(`Expected ${name} to be true or false`);

}

function envNumber(name: string, defaultValue: number): number {

    const raw = process.env[name];

    if (raw === undefined || raw === '') {

        return defaultValue;

}

    const value = Number(raw);

    if (!Number.isFinite(value)) {

        throw new Error(`Expected ${name} to be a number`);

}

    return value;

}

function envOptionalString(name: string): string | undefined {

    const raw = process.env[name];

    if (raw === undefined || raw === '') {

        return undefined;

}

    return raw;

}
