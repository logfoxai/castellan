import type {ContainerInfo} from 'dockerode';
import {sleep, waitForHttpHealth} from './health.js';
import type {ManagedService} from './types.js';

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

export function resolveHealthUrl(healthUrl: string, composeService: string): string {

    return healthUrl.replace(/\{\{service\}\}/g, composeService);

}

export type VerifyDeployHealthOptions = {
    service: ManagedService;
    composeService: string;
    healthTimeoutMs: number;
    findContainer: (composeService: string) => Promise<ContainerInfo | null>;
    beforeCheck?: () => void;
    checkAbort?: () => boolean;
    sleepFn?: (ms: number) => Promise<void>;
};

async function probeHttpHealth(
    service: ManagedService,
    composeService: string,
    remainingMs: number,
    checkAbort?: () => boolean,
): Promise<boolean> {

    if (!service.healthUrl || remainingMs <= 0) {

        return false;

}

    return waitForHttpHealth({
        url: resolveHealthUrl(service.healthUrl, composeService),
        intervalMs: service.healthIntervalMs,
        retries: service.healthRetries,
        timeoutMs: remainingMs,
        checkAbort,
    });

}

export async function verifyDeployHealth(options: VerifyDeployHealthOptions): Promise<void> {

    const sleepMs = options.sleepFn ?? sleep;
    const deadline = Date.now() + options.healthTimeoutMs;

    while (Date.now() < deadline) {

        options.beforeCheck?.();

        const container = await options.findContainer(options.composeService);

        if (!containerReportsHealthy(container)) {

            await sleepMs(options.service.healthIntervalMs);
            continue;

}

        if (!options.service.healthUrl) {

            return;

}

        const httpHealthy = await probeHttpHealth(
            options.service,
            options.composeService,
            deadline - Date.now(),
            options.checkAbort,
        );

        if (httpHealthy) {

            return;

}

        await sleepMs(options.service.healthIntervalMs);

}

    options.beforeCheck?.();
    throw new Error(`Health check failed for ${options.composeService}`);

}
