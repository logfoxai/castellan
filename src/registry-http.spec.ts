import {test} from 'kizu';
import {HttpRegistry} from './registry-http.js';

type FetchCall = {
    url: string;
    init?: RequestInit;
};

type FetchHandler = (call: FetchCall) => Response | Promise<Response>;

function createFetchMock(handler: FetchHandler): typeof fetch {

    return (async (input: string | URL, init?: RequestInit) => {

        const url = typeof input === 'string' ? input : input.toString();

        return handler({url, init});

}) as typeof fetch;

}

function authHeader(init?: RequestInit): string | undefined {

    return (init?.headers as Record<string, string> | undefined)?.Authorization;

}

function unauthorizedManifest(wwwAuthenticate: string): Response {

    return new Response('', {
        status: 401,
        headers: {'www-authenticate': wwwAuthenticate},
    });

}

function manifestResponse(digest: string, contentType: string): Response {

    return new Response('{}', {
        status: 200,
        headers: {
            'content-type': contentType,
            'docker-content-digest': digest,
        },
    });

}

function dockerHubHandler({url, init}: FetchCall): Response {

    if (url.includes('registry-1.docker.io/v2/library/nginx/manifests/latest')) {

        if (!authHeader(init)) {

            return unauthorizedManifest(
                'Bearer realm="https://auth.docker.io/token",service="registry.docker.io",scope="repository:library/nginx:pull"',
            );

}

        return manifestResponse('sha256:nginx-latest', 'application/vnd.docker.distribution.manifest.v2+json');

}

    if (url.startsWith('https://auth.docker.io/token')) {

        return Response.json({token: 'hub-token'});

}

    throw new Error(`Unexpected fetch: ${url}`);

}

function ghcrHandler({url, init}: FetchCall): Response {

    if (url.includes('ghcr.io/v2/logfoxai/castellan/manifests/latest')) {

        if (!authHeader(init)) {

            return unauthorizedManifest(
                'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:logfoxai/castellan:pull"',
            );

}

        return manifestResponse('sha256:castellan-latest', 'application/vnd.oci.image.manifest.v1+json');

}

    if (url.startsWith('https://ghcr.io/token')) {

        return Response.json({token: 'ghcr-token'});

}

    throw new Error(`Unexpected fetch: ${url}`);

}

function privateGhcrHandler({url, init}: FetchCall, captureAuth: (value?: string) => void): Response {

    if (url.includes('ghcr.io/v2/org/private/manifests/main')) {

        if (!authHeader(init)) {

            return unauthorizedManifest(
                'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:org/private:pull"',
            );

}

        return manifestResponse('sha256:private-main', 'application/vnd.oci.image.manifest.v1+json');

}

    if (url.startsWith('https://ghcr.io/token')) {

        captureAuth(authHeader(init));

        return Response.json({token: 'private-token'});

}

    throw new Error(`Unexpected fetch: ${url}`);

}

test('HttpRegistry fetches Docker Hub manifests via token auth', async (assert) => {

    const registry = new HttpRegistry({}, createFetchMock(dockerHubHandler));
    const manifest = await registry.getManifest({
        registry: 'docker.io',
        repository: 'nginx',
        tag: 'latest',
    });

    assert.equal(manifest.digest, 'sha256:nginx-latest');

});

test('HttpRegistry fetches GHCR manifests via token auth', async (assert) => {

    const registry = new HttpRegistry({}, createFetchMock(ghcrHandler));
    const manifest = await registry.getManifest({
        registry: 'ghcr.io',
        repository: 'logfoxai/castellan',
        tag: 'latest',
    });

    assert.equal(manifest.digest, 'sha256:castellan-latest');

});

test('HttpRegistry sends credentials when fetching GHCR tokens', async (assert) => {

    let tokenAuthHeader: string | undefined;
    const registry = new HttpRegistry(
        {'ghcr.io': {username: 'myuser', password: 'ghp_secret'}},
        createFetchMock((call) => privateGhcrHandler(call, (value) => {

            tokenAuthHeader = value;

})),
    );

    const manifest = await registry.getManifest({
        registry: 'ghcr.io',
        repository: 'org/private',
        tag: 'main',
    });

    assert.equal(manifest.digest, 'sha256:private-main');
    assert.equal(tokenAuthHeader, `Basic ${Buffer.from('myuser:ghp_secret').toString('base64')}`);

});
