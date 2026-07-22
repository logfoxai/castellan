export type ManagedService = {
    name: string;
    registry: string;
    repository: string;
    tag: string;
    composeServices: string[];
    healthUrl?: string;
    healthIntervalMs: number;
    healthRetries: number;
};

export type PollConfig = {
    /** When false or intervalMs is 0, periodic polling is off; use API forceCheck for deploys. */
    enabled: boolean;
    intervalMs: number;
    jitterMs: number;
};

export type RollbackConfig = {
    healthTimeoutMs: number;
    maxAttempts: number;
};

export type ApiConfig = {
    enabled: boolean;
    dashboard: boolean;
    port: number;
    authToken?: string;
};

export type ComposeConfig = {
    file: string;
    project?: string;
    envFile?: string;
};

export type RegistryCredentials = {
    username: string;
    password: string;
};

export type Config = {
    managedServices: ManagedService[];
    compose: ComposeConfig;
    poll: PollConfig;
    rollback: RollbackConfig;
    api: ApiConfig;
    registries?: Record<string, RegistryCredentials>;
};

export type RegistryImage = {
    registry: string;
    repository: string;
    tag: string;
};

export type RegistryManifest = {
    digest: string;
    pushedAt: Date | null;
    manifest?: string;
    mediaType?: string;
};

export type ServiceState =
    | 'idle'
    | 'checking'
    | 'updating'
    | 'verifying'
    | 'stable'
    | 'rollback'
    | 'failed';

export type ServiceRuntime = {
    name: string;
    registry: string;
    repository: string;
    tag: string;
    state: ServiceState;
    currentDigest: string | null;
    desiredDigest: string | null;
    badDigests: string[];
    lastCheckAt: Date | null;
    lastError: string | null;
};

export type DeploymentEvent = {
    at: Date;
    type: 'check' | 'deploy' | 'rollback' | 'failure';
    service: string;
    message: string;
};
