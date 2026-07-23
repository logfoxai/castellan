import type {ContainerInfo} from 'dockerode';
import {sleep} from './health.js';
import {HEALTH_POLL_INTERVAL_MS} from './label-discovery.js';
import type {ManagedService} from './types.js';

export class DeployHealthError extends Error {

    constructor(composeService: string) {

        super(`Health check failed for ${composeService}`);
        this.name = 'DeployHealthError';

}

}

export function containerReportsHealthy(
    container: Pick<ContainerInfo, 'State' | 'Status'> | null | undefined,
): boolean {

    if (!container || container.State !== 'running') {

        return false;

}

    const status = container.Status ?? '';

    if (status.includes('unhealthy')) {

        return false;

}

    if (status.includes('healthy')) {

        return true;

}

    if (status.includes('health:')) {

        return false;

}

    return true;

}

export type VerifyDeployHealthOptions = {
    service: ManagedService;
    composeService: string;
    healthTimeoutMs: number;
    findContainer: (composeService: string) => Promise<ContainerInfo | null>;
    beforeCheck?: () => void;
    checkAbort?: () => boolean;
    sleepFn?: (ms: number) => Promise<void>;
    pollIntervalMs?: number;
};

export async function snapshotComposeServiceHealth(
    _service: ManagedService,
    composeService: string,
    findContainer: (composeService: string) => Promise<ContainerInfo | null>,
): Promise<boolean> {

    const container = await findContainer(composeService);

    return containerReportsHealthy(container);

}

export async function verifyDeployHealth(options: VerifyDeployHealthOptions): Promise<void> {

    const sleepMs = options.sleepFn ?? sleep;
    const pollIntervalMs = options.pollIntervalMs ?? HEALTH_POLL_INTERVAL_MS;
    const deadline = Date.now() + options.healthTimeoutMs;

    while (Date.now() < deadline) {

        if (options.checkAbort?.()) {

            throw new DeployHealthError(options.composeService);

}

        options.beforeCheck?.();

        const container = await options.findContainer(options.composeService);

        if (containerReportsHealthy(container)) {

            return;

}

        await sleepMs(pollIntervalMs);

}

    options.beforeCheck?.();
    throw new DeployHealthError(options.composeService);

}
