import {isManifestList, resolveManifestList} from './manifest.js';
import type {Registry} from './registry.js';
import type {RegistryImage, RegistryManifest} from './types.js';

const ACCEPT_HEADER = [
    'application/vnd.docker.distribution.manifest.v2+json',
    'application/vnd.docker.distribution.manifest.list.v2+json',
    'application/vnd.oci.image.manifest.v1+json',
    'application/vnd.oci.image.index.v1+json',
].join(', ');

export class HttpRegistry implements Registry {

    async getManifest(image: RegistryImage): Promise<RegistryManifest> {

        const url = buildManifestUrl(image);

        return fetchManifest(url, ACCEPT_HEADER);

}

}

function buildManifestUrl(image: RegistryImage): string {

    const registry = normalizeRegistryHost(image.registry);
    const repository = normalizeRepository(image.registry, image.repository);

    return `https://${registry}/v2/${repository}/manifests/${image.tag}`;

}

function normalizeRegistryHost(registry: string): string {

    if (registry === 'docker.io' || registry === 'registry.hub.docker.com') {

        return 'registry-1.docker.io';

}

    return registry;

}

function normalizeRepository(registry: string, repository: string): string {

    if (
        (registry === 'docker.io' || registry === 'registry-1.docker.io')
        && !repository.includes('/')
    ) {

        return `library/${repository}`;

}

    return repository;

}

async function fetchManifest(url: string, accept: string): Promise<RegistryManifest> {

    const response = await fetchWithTimeout(url, {headers: {Accept: accept}});
    const tokenManifest = await tryTokenAuth(url, accept, response);

    if (tokenManifest) {

        return tokenManifest;

}

    if (!response.ok) {

        throw new Error(`Registry request failed: ${response.status} ${response.statusText}`);

}

    return readManifestResponse(response);

}

async function tryTokenAuth(
    url: string,
    accept: string,
    response: Response,
): Promise<RegistryManifest | null> {

    if (response.status !== 401) {

        return null;

}

    const token = await fetchToken(response.headers.get('www-authenticate'));

    if (!token) {

        return null;

}

    const retry = await fetchWithTimeout(url, {
        headers: {
            Accept: accept,
            Authorization: `Bearer ${token}`,
        },
    });

    if (!retry.ok) {

        return null;

}

    return readManifestResponse(retry);

}

async function readManifestResponse(response: Response): Promise<RegistryManifest> {

    const contentType = response.headers.get('content-type') ?? '';
    const digest = response.headers.get('docker-content-digest');
    const body = await response.text();

    if (isManifestList(contentType, body)) {

        return {
            digest: resolveManifestList(body),
            pushedAt: null,
            manifest: body,
            mediaType: contentType,
        };

}

    if (!digest) {

        throw new Error('Registry response missing Docker-Content-Digest');

}

    return {
        digest,
        pushedAt: null,
        manifest: body,
        mediaType: contentType,
    };

}

async function fetchToken(wwwAuthenticate: string | null): Promise<string | null> {

    if (!wwwAuthenticate || !wwwAuthenticate.toLowerCase().startsWith('bearer ')) {

        return null;

}

    const params = parseWWWAuthenticate(wwwAuthenticate);

    if (!params.realm || !params.service) {

        return null;

}

    let url = `${params.realm}?service=${encodeURIComponent(params.service)}`;

    if (params.scope) {

        url += `&scope=${encodeURIComponent(params.scope)}`;

}

    const response = await fetchWithTimeout(url);

    if (!response.ok) {

        return null;

}

    const data = await response.json() as {token?: string; access_token?: string};

    return data.token ?? data.access_token ?? null;

}

function parseWWWAuthenticate(header: string): Record<string, string> {

    const result: Record<string, string> = {};
    const params = header.replace(/^Bearer\s+/i, '').split(',').map((s) => s.trim());

    for (const param of params) {

        const match = /^(\w+)="([^"]*)"$/.exec(param);

        if (match) {

            result[match[1]] = match[2];

}

}

    return result;

}

const FETCH_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {

        return await fetch(url, {...init, signal: controller.signal});

} finally {

        clearTimeout(id);

}

}
