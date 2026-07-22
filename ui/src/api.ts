export type ServiceStatus = {
    name: string;
    registry: string;
    repository: string;
    tag: string;
    state: 'idle' | 'checking' | 'updating' | 'verifying' | 'stable' | 'rollback' | 'failed';
    currentDigest: string | null;
    desiredDigest: string | null;
    lastCheckAt: string | null;
    lastError: string | null;
};

export type DeploymentEvent = {
    at: string;
    type: 'check' | 'deploy' | 'rollback' | 'failure';
    service: string;
    message: string;
};

export type ContainerRow = {
    id: string;
    name: string;
    displayName: string;
    image: string;
    state: string;
    status: string;
    disk: string;
};

export type ContainerStat = {
    name: string;
    cpu: string;
    mem: string;
    memPerc: string;
};

export type API = {
    status(): { services: ServiceStatus[]; paused: boolean };
    forceCheck(): { ok: boolean };
    pause(): { paused: boolean };
    resume(): { paused: boolean };
    rollback(input: { service: string }): { ok: boolean };
    history(): { events: DeploymentEvent[] };
    dockerContainers(): { containers: ContainerRow[] };
    dockerStatsAll(): { stats: ContainerStat[] };
    dockerImages(): { images: unknown[] };
    dockerNetworks(): { networks: unknown[] };
    dockerVolumes(): { volumes: unknown[] };
    dockerLogs(input: { containerId: string; tail?: number }): { logs: string };
    dockerStats(input: { containerId: string }): { stats: unknown };
    dockerInfo(): { info: unknown };
    dockerEvents(input: { since?: number }): { events: unknown[] };
};

export async function rpc<T extends keyof API>(
    method: T,
    ...args: Parameters<API[T]>
): Promise<ReturnType<API[T]>> {

    // Auth is handled by the same-origin session cookie the server sets when it
    // serves the dashboard; fetch includes it automatically for same-origin
    // requests. No token is entered or stored in the browser.
    const response = await fetch('/v1', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({method, args}),
    });

    if (!response.ok) {

        throw new Error(`RPC ${method} failed: ${response.status}`);

}

    return response.json() as ReturnType<API[T]>;

}
