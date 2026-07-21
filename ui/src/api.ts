export type ServiceStatus = {
    name: string;
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

export type API = {
    status(): { services: ServiceStatus[]; paused: boolean };
    forceCheck(): { ok: boolean };
    pause(): { paused: boolean };
    resume(): { paused: boolean };
    rollback(input: { service: string }): { ok: boolean };
    history(): { events: DeploymentEvent[] };
    dockerContainers(): { containers: unknown[] };
    dockerImages(): { images: unknown[] };
    dockerNetworks(): { networks: unknown[] };
    dockerVolumes(): { volumes: unknown[] };
    dockerLogs(input: { containerId: string; tail?: number }): { logs: string };
    dockerStats(input: { containerId: string }): { stats: unknown };
    dockerInfo(): { info: unknown };
    dockerEvents(input: { since?: number }): { events: unknown[] };
};

let authToken = '';

export function setAuthToken(token: string): void {

    authToken = token;

}

export function getAuthToken(): string {

    return authToken;

}

export async function rpc<T extends keyof API>(
    method: T,
    ...args: Parameters<API[T]>
): Promise<ReturnType<API[T]>> {

    const headers: Record<string, string> = {'Content-Type': 'application/json'};

    if (authToken) {

        headers.Authorization = `Bearer ${authToken}`;

}

    const response = await fetch('/v1', {
        method: 'POST',
        headers,
        body: JSON.stringify({method, args}),
    });

    if (!response.ok) {

        throw new Error(`RPC ${method} failed: ${response.status}`);

}

    return response.json() as ReturnType<API[T]>;

}
