import {test} from 'kizu';
import type {ContainerInfo} from 'dockerode';
import {
    containerReportsHealthy,
    verifyDeployHealth,
} from './service-health.js';
import type {ManagedService} from './types.js';

const baseService: ManagedService = {
    name: 'api',
    registry: 'ghcr.io',
    repository: 'myorg/api',
    tag: 'staging',
};

function runningContainer(status: string): ContainerInfo {

    return {
        Id: 'abc',
        State: 'running',
        Status: status,
    } as ContainerInfo;

}

test('containerReportsHealthy interprets docker health status', (assert) => {

    assert.equal(containerReportsHealthy(runningContainer('Up 2 minutes')), true);
    assert.equal(containerReportsHealthy(runningContainer('Up 2 minutes (healthy)')), true);
    assert.equal(containerReportsHealthy(runningContainer('Up 2 minutes (unhealthy)')), false);
    assert.equal(containerReportsHealthy(runningContainer('Up 2 minutes (health: starting)')), false);
    assert.equal(containerReportsHealthy(null), false);

});

test('verifyDeployHealth waits for docker health before succeeding', async (assert) => {

    let calls = 0;

    await verifyDeployHealth({
        service: baseService,
        composeService: 'api-1',
        healthTimeoutMs: 500,
        findContainer: async () => {

            calls += 1;

            if (calls < 3) {

                return runningContainer('Up 1 minute (health: starting)');

}

            return runningContainer('Up 1 minute (healthy)');

},
        sleepFn: async () => undefined,
    });

    assert.equal(calls >= 3, true);

});

test('verifyDeployHealth fails when the container never becomes healthy', async (assert) => {

    let error: Error | undefined;

    try {

        await verifyDeployHealth({
            service: baseService,
            composeService: 'worker',
            healthTimeoutMs: 50,
            findContainer: async () => runningContainer('Up 1 minute (health: starting)'),
            sleepFn: async () => undefined,
        });

} catch (err) {

        error = err as Error;

}

    assert.equal(error?.message, 'Health check failed for worker');

});
