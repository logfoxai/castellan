import {test} from 'kizu';
import {dispatch} from './api.js';
import type {DockerClient} from './docker.js';
import type {DeploymentEvent} from './types.js';
import type {Roller, RollerStatus} from './roller.js';

type MockRoller = {
    [K in keyof Roller]: Roller[K];
};

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
        async rollback(): Promise<void> {

            return undefined;

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

function createMocks(): {roller: Roller; docker: DockerClient} {

    return {
        roller: createRoller() as unknown as Roller,
        docker: createDocker() as unknown as DockerClient,
    };

}

test('dispatch status returns status', async (assert) => {

    const {roller, docker} = createMocks();
    const result = await dispatch({method: 'status'}, roller, docker);

    assert.equal(result, {paused: false, services: []});

});

test('dispatch pause toggles paused', async (assert) => {

    const {roller, docker} = createMocks();

    await dispatch({method: 'pause'}, roller, docker);
    const result = await dispatch({method: 'status'}, roller, docker);

    assert.equal(result, {paused: true, services: []});

});

test('dispatch dockerContainers returns empty list', async (assert) => {

    const {roller, docker} = createMocks();
    const result = await dispatch({method: 'dockerContainers'}, roller, docker);

    assert.equal(result, {containers: []});

});
