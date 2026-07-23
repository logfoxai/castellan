import type {DeploymentEvent, ManagedService, ServiceDeployment, ServiceRuntime} from './types.js';

export type RollerStatus = {
    paused: boolean;
    services: ServiceRuntime[];
};

export type RollerPort = {
    getStatus(): RollerStatus;
    getEvents(): DeploymentEvent[];
    getDeployments(serviceName: string): ServiceDeployment[];
    discoverServices(): Promise<ManagedService[]>;
    pause(): void;
    resume(): void;
    forceCheck(): Promise<void>;
    deploy(serviceName: string, digest: string): Promise<boolean>;
    reject(serviceName: string, digest: string): Promise<boolean>;
    setPollEnabled(serviceName: string, enabled: boolean): Promise<boolean>;
    start(): void;
    stop(): void;
};
