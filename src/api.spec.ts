import {test} from 'kizu';
import {dispatchMethod, isAuthorized, readCookie, SESSION_COOKIE} from './api.js';
import type {DockerClient} from './docker.js';
import type {DeploymentEvent} from './types.js';
import type {RollerPort, RollerStatus} from './roller-port.js';

type MockRoller = RollerPort;

type MockDocker = {
    [K in keyof DockerClient]: DockerClient[K];
};

function createRoller(): MockRoller {

    let paused = false;

    return {
        getStatus(): RollerStatus {

            return {paused, services: []};

        },
        async forceCheck(): Promise<void> {

            return undefined;

        },
        pause(): void {

            paused = true;

        },
        resume(): void {

            paused = false;

        },
        async rollback(): Promise<boolean> {

            return true;

        },
        getEvents(): DeploymentEvent[] {

            return [];

        },
        start(): void {

            return undefined;

        },
        stop(): void {

            return undefined;

        },
    } as unknown as MockRoller;

}

function createDocker(): MockDocker {

    return {
        listContainers: async () => [],
        listImages: async () => [],
        listNetworks: async () => [],
        listVolumes: async () => [],
        getInfo: async () => ({}),
        getContainerStats: async () => ({}),
        getContainerLogs: async () => '',
        getEvents: async () => [],
        pullImage: async () => undefined,
        tagImage: async () => undefined,
        getLocalDigest: async () => null,
        composePull: async () => undefined,
        composeUp: async () => undefined,
    } as unknown as MockDocker;

}

function createMocks(): {roller: RollerPort; docker: DockerClient} {

    return {
        roller: createRoller(),
        docker: createDocker() as unknown as DockerClient,
    };

}

test('dispatchMethod status returns status', async (assert) => {

    const {roller, docker} = createMocks();
    const result = await dispatchMethod('status', {}, roller, docker);

    assert.equal(result, {paused: false, services: []});

});

test('dispatchMethod pause toggles paused', async (assert) => {

    const {roller, docker} = createMocks();

    await dispatchMethod('pause', {}, roller, docker);
    const result = await dispatchMethod('status', {}, roller, docker);

    assert.equal(result, {paused: true, services: []});

});

test('dispatchMethod dockerContainers returns empty list', async (assert) => {

    const {roller, docker} = createMocks();
    const result = await dispatchMethod('dockerContainers', {}, roller, docker);

    assert.equal(result, {containers: []});

});

test('readCookie extracts a named cookie value', (assert) => {

    assert.equal(readCookie('a=1; castellan_session=abc123; b=2', SESSION_COOKIE), 'abc123');

});

test('readCookie returns undefined when cookie or header is absent', (assert) => {

    assert.equal(readCookie(undefined, SESSION_COOKIE), undefined);
    assert.equal(readCookie('other=1', SESSION_COOKIE), undefined);

});

test('isAuthorized allows any request when no token is configured', (assert) => {

    assert.equal(isAuthorized(undefined, {}), true);
    assert.equal(isAuthorized('', {}), true);

});

test('isAuthorized accepts a matching Bearer token', (assert) => {

    assert.equal(isAuthorized('secret', {authorization: 'Bearer secret'}), true);
    assert.equal(isAuthorized('secret', {authorization: 'Bearer nope'}), false);

});

test('isAuthorized accepts a matching session cookie', (assert) => {

    assert.equal(isAuthorized('secret', {cookie: `${SESSION_COOKIE}=secret`}), true);
    assert.equal(isAuthorized('secret', {cookie: `${SESSION_COOKIE}=wrong`}), false);

});

test('isAuthorized rejects when neither Bearer nor cookie is present', (assert) => {

    assert.equal(isAuthorized('secret', {}), false);

});
