import type {DeploymentEvent, ServiceRuntime} from './types.js';

export type RollerStatus = {
    paused: boolean;
    services: ServiceRuntime[];
};

/** Application port for registry polling and compose rollouts (HTTP API depends on this). */
export type RollerPort = {
    getStatus(): RollerStatus;
    getEvents(): DeploymentEvent[];
    pause(): void;
    resume(): void;
    forceCheck(): Promise<void>;
    rollback(serviceName: string): Promise<boolean>;
    start(): void;
    stop(): void;
};
