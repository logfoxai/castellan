import type {DeploymentEvent, ServiceDeployment, ServiceRuntime} from './types.js';

export type RollerStatus = {
    paused: boolean;
    services: ServiceRuntime[];
};
export type RollerPort = {
    getStatus(): RollerStatus;
    getEvents(): DeploymentEvent[];
    getDeployments(serviceName: string): ServiceDeployment[];
    pause(): void;
    resume(): void;
    forceCheck(): Promise<void>;
    rollback(serviceName: string): Promise<boolean>;
    deploy(serviceName: string, digest: string): Promise<boolean>;
    reject(serviceName: string, digest: string): Promise<boolean>;
    start(): void;
    stop(): void;
};
