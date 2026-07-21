export type HealthOptions = {
    url: string;
    intervalMs: number;
    retries: number;
    timeoutMs: number;
    checkAbort?: () => boolean;
};

export async function waitForHttpHealth(options: HealthOptions): Promise<boolean> {

    const deadline = Date.now() + options.timeoutMs;
    let attempts = 0;

    while (Date.now() < deadline && attempts < options.retries) {

        attempts += 1;

        if (options.checkAbort?.()) {

            return false;

}

        try {

            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), options.intervalMs);
            const response = await fetch(options.url, {signal: controller.signal});

            clearTimeout(id);

            if (response.ok) {

                return true;

}

} catch {
            // ignore and retry
        }

        await sleep(options.intervalMs);

}

    return false;

}

export async function waitForContainerHealth(
    containerId: string,
    isHealthy: (id: string) => Promise<boolean>,
    options: { intervalMs: number; retries: number; timeoutMs: number },
): Promise<boolean> {

    const deadline = Date.now() + options.timeoutMs;
    let attempts = 0;

    while (Date.now() < deadline && attempts < options.retries) {

        attempts += 1;

        if (await isHealthy(containerId)) {

            return true;

}

        await sleep(options.intervalMs);

}

    return false;

}

export function sleep(ms: number): Promise<void> {

    return new Promise((resolve) => setTimeout(resolve, ms));

}
