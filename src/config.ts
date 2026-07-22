import {readFile} from 'fs/promises';
import {existsSync} from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type {DockerClient} from './docker.js';
import type {Config, ManagedService, RegistryCredentials, ApiConfig, PollConfig} from './types.js';
import {discoverConfig} from './watchtower.js';

const DEFAULT_CONFIG_PATHS = ['/app/config.json', '/app/config.yaml', '/app/config.yml'];

export async function loadConfig(filePath?: string): Promise<Config> {

    const resolved = await resolveConfigPath(filePath);
    const raw = await readFile(resolved, 'utf8');
    const parsed = parseConfig(raw, resolved);
    const config = normalizeConfig(parsed);

    config.compose.project = config.compose.project ?? await inferComposeProject(config.compose.file);

    return config;

}

async function resolveConfigPath(filePath?: string): Promise<string> {

    if (filePath) {

        if (!existsSync(filePath)) {

            throw new Error(`Config file not found: ${filePath}`);

}

        return filePath;

}

    const envPath = process.env.CASTELLAN_CONFIG;

    if (envPath) {

        if (!existsSync(envPath)) {

            throw new Error(`Config file not found: ${envPath}`);

}

        return envPath;

}

    for (const candidate of DEFAULT_CONFIG_PATHS) {

        if (existsSync(candidate)) {

            return candidate;

}

}

    throw new Error(`Config file not found: ${DEFAULT_CONFIG_PATHS.join(' | ')}`);

}

export function parseConfig(raw: string, filePath: string): unknown {

    if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {

        const parsed = yaml.load(raw);

        if (parsed === undefined || parsed === null) {

            throw new Error(`YAML config file is empty: ${filePath}`);

}

        return parsed;

}

    return JSON.parse(raw);

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

export async function loadConfigOrDiscover(docker: DockerClient, filePath?: string): Promise<Config> {

    try {

        return await loadConfig(filePath);

} catch (err) {

        if (err instanceof Error && err.message.startsWith('Config file not found')) {

            const config = await discoverConfig(docker, {
                file: process.env.CASTELLAN_COMPOSE_FILE ?? '/app/docker-compose.yml',
                envFile: process.env.CASTELLAN_COMPOSE_ENV_FILE,
            });

            config.compose.project = config.compose.project ?? await inferComposeProject(config.compose.file);

            return config;

}

        throw err;

}

}

export function normalizeConfig(input: unknown): Config {

    if (typeof input !== 'object' || input === null) {

        throw new Error('Config must be an object');

}

    const data = input as Record<string, unknown>;

    return {
        managedServices: normalizeServices(data.managedServices),
        compose: normalizeCompose(data.compose),
        poll: normalizePoll(data.poll),
        rollback: normalizeRollback(data.rollback),
        api: normalizeApi(data.api),
        registries: normalizeRegistries(data.registries),
    };

}

function normalizeServices(input: unknown): ManagedService[] {

    if (!Array.isArray(input)) {

        throw new Error('managedServices must be an array');

}

    return input.map((value, index) => {

        if (typeof value !== 'object' || value === null) {

            throw new Error(`Service ${index} must be an object`);

}

        const s = value as Record<string, unknown>;

        return {
            name: getString(s, 'name'),
            registry: getString(s, 'registry'),
            repository: getString(s, 'repository'),
            tag: getString(s, 'tag'),
            composeServices: getStringArray(s, 'composeServices'),
            healthUrl: getOptionalString(s, 'healthUrl'),
            healthIntervalMs: getNumber(s, 'healthIntervalMs', 5000),
            healthRetries: getNumber(s, 'healthRetries', 10),
        };

});

}

function normalizeCompose(input: unknown): {file: string; project?: string; envFile?: string} {

    if (typeof input !== 'object' || input === null) {

        return {file: '/app/docker-compose.yml'};

}

    const c = input as Record<string, unknown>;

    return {
        file: getString(c, 'file', '/app/docker-compose.yml'),
        project: getOptionalString(c, 'project'),
        envFile: getOptionalString(c, 'envFile'),
    };

}

function normalizePoll(input: unknown): PollConfig {

    if (typeof input !== 'object' || input === null) {

        return {enabled: true, intervalMs: 60000, jitterMs: 5000};

}

    const p = input as Record<string, unknown>;
    const intervalMs = getNumber(p, 'intervalMs', 60000);
    const enabled = getBoolean(p, 'enabled', intervalMs > 0);

    return {
        enabled: enabled && intervalMs > 0,
        intervalMs,
        jitterMs: getNumber(p, 'jitterMs', 5000),
    };

}

function normalizeRollback(input: unknown): {healthTimeoutMs: number; maxAttempts: number} {

    if (typeof input !== 'object' || input === null) {

        return {healthTimeoutMs: 120000, maxAttempts: 1};

}

    const r = input as Record<string, unknown>;

    return {
        healthTimeoutMs: getNumber(r, 'healthTimeoutMs', 120000),
        maxAttempts: getNumber(r, 'maxAttempts', 1),
    };

}

function normalizeRegistries(input: unknown): Record<string, RegistryCredentials> | undefined {

    if (input === undefined) {

        return undefined;

}

    if (typeof input !== 'object' || input === null) {

        throw new Error('registries must be an object');

}

    const result: Record<string, RegistryCredentials> = {};

    for (const [host, value] of Object.entries(input as Record<string, unknown>)) {

        if (typeof value !== 'object' || value === null) {

            throw new Error(`registries.${host} must be an object`);

}

        const creds = value as Record<string, unknown>;

        result[host] = {
            username: getString(creds, 'username'),
            password: getString(creds, 'password'),
        };

}

    return result;

}

function normalizeApi(input: unknown): ApiConfig {

    if (typeof input !== 'object' || input === null) {

        return {enabled: true, dashboard: true, port: 3003};

}

    const a = input as Record<string, unknown>;

    return {
        enabled: getBoolean(a, 'enabled', true),
        dashboard: getBoolean(a, 'dashboard', true),
        port: getNumber(a, 'port', 3003),
        authToken: getOptionalString(a, 'authToken'),
    };

}

function getString(obj: Record<string, unknown>, key: string, defaultValue?: string): string {

    const value = obj[key];

    if (value === undefined && defaultValue !== undefined) {

        return defaultValue;

}

    if (typeof value !== 'string') {

        throw new Error(`Expected ${key} to be a string`);

}

    return value;

}

function getOptionalString(obj: Record<string, unknown>, key: string): string | undefined {

    const value = obj[key];

    return value === undefined ? undefined : getString(obj, key);

}

function getBoolean(obj: Record<string, unknown>, key: string, defaultValue: boolean): boolean {

    const value = obj[key];

    if (value === undefined) {

        return defaultValue;

}

    if (typeof value !== 'boolean') {

        throw new Error(`Expected ${key} to be a boolean`);

}

    return value;

}

function getNumber(obj: Record<string, unknown>, key: string, defaultValue: number): number {

    const value = obj[key];

    if (value === undefined) {

        return defaultValue;

}

    if (typeof value !== 'number') {

        throw new Error(`Expected ${key} to be a number`);

}

    return value;

}

function getStringArray(obj: Record<string, unknown>, key: string): string[] {

    const value = obj[key];

    if (!Array.isArray(value)) {

        throw new Error(`Expected ${key} to be an array`);

}

    return value.map((item, index) => {

        if (typeof item !== 'string') {

            throw new Error(`Expected ${key}[${index}] to be a string`);

}

        return item;

});

}
