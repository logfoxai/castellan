import {readFile, writeFile, mkdir, rename} from 'fs/promises';
import {existsSync} from 'fs';
import path from 'path';
import type {DeploymentEvent, DeploymentOutcome, ServiceDeployment} from './types.js';

export type PersistedState = {
    version: number;
    deployments: Record<string, ServiceDeployment[]>;
    pollEnabled: Record<string, boolean>;
    events: {
        at: string;
        type: DeploymentEvent['type'];
        service: string;
        message: string;
    }[];
};

const CURRENT_VERSION = 3;
const MAX_EVENTS = 500;
const MAX_DEPLOYMENTS_PER_SERVICE = 100;

export class StateManager {

    private readonly filePath: string;
    private state: PersistedState;
    private dirty: boolean = false;
    private saveQueue: Promise<void> = Promise.resolve();

    constructor(filePath: string) {

        this.filePath = filePath;
        this.state = {
            version: CURRENT_VERSION,
            deployments: {},
            pollEnabled: {},
            events: [],
        };

}

    async load(): Promise<void> {

        if (!existsSync(this.filePath)) {

            return;

}

        try {

            const raw = await readFile(this.filePath, 'utf8');
            const parsed = JSON.parse(raw) as Partial<PersistedState> & {
                knownGood?: Record<string, string>;
                badDigests?: Record<string, string[]>;
            };
            const migrated = (parsed.version ?? 1) < CURRENT_VERSION;

            this.state = parsePersistedState(parsed);
            this.dirty = migrated;

} catch (err) {

            console.error(`Failed to load state from ${this.filePath}:`, err);
            this.state = emptyState();
            this.dirty = true;

}

}

    getServicePollEnabled(service: string, defaultEnabled = true): boolean {

        const value = this.state.pollEnabled[service];

        if (value === undefined) {

            return defaultEnabled;

}

        return value;

}

    setServicePollEnabled(service: string, enabled: boolean): void {

        this.state.pollEnabled[service] = enabled;
        this.dirty = true;

}

    save(): Promise<void> {

        const queued = this.saveQueue.then(() => this.write());

        this.saveQueue = queued.catch(() => undefined);

        return queued;

}

    private async write(): Promise<void> {

        const dir = path.dirname(this.filePath);

        await mkdir(dir, {recursive: true});

        while (this.dirty) {

            const data = JSON.stringify(this.state, null, 2);

            this.dirty = false;

            try {

                const temp = `${this.filePath}.tmp`;

                await writeFile(temp, data, 'utf8');
                await rename(temp, this.filePath);

} catch (err) {

                this.dirty = true;
                throw err;

}

}

}

    appendDeployment(
        service: string,
        entry: {digest: string; outcome: DeploymentOutcome; reject?: true; at?: Date},
    ): void {

        const record: ServiceDeployment = {
            digest: entry.digest,
            at: (entry.at ?? new Date()).toISOString(),
            outcome: entry.outcome,
            ...(entry.reject ? {reject: true} : {}),
        };

        const existing = this.state.deployments[service] ?? [];

        this.state.deployments[service] = [record, ...existing].slice(0, MAX_DEPLOYMENTS_PER_SERVICE);
        this.dirty = true;

}

    getDeployments(service: string): ServiceDeployment[] {

        return [...(this.state.deployments[service] ?? [])];

}

    hasDeploymentDigest(service: string, digest: string): boolean {

        return this.getDeployments(service).some((deployment) => deployment.digest === digest);

}

    getRejectedDigests(service: string): string[] {

        const rejected = new Set<string>();

        for (const deployment of this.getDeployments(service)) {

            if (deployment.reject) {

                rejected.add(deployment.digest);

}

}

        return [...rejected];

}

    isDigestRejected(service: string, digest: string): boolean {

        return this.getDeployments(service).some(
            (deployment) => deployment.digest === digest && deployment.reject,
        );

}

    setDigestRejected(service: string, digest: string, rejected: boolean): void {

        const deployments = this.state.deployments[service] ?? [];
        let updated = false;

        for (const deployment of deployments) {

            if (deployment.digest === digest) {

                if (rejected) {

                    deployment.reject = true;

} else {

                    delete deployment.reject;

}

                updated = true;

}

}

        if (!updated && rejected) {

            this.appendDeployment(service, {digest, outcome: 'success', reject: true});

            return;

}

        if (updated) {

            this.dirty = true;

}

}

    isSuccessfulDeployment(service: string, digest: string): boolean {

        return this.getDeployments(service).some(
            (deployment) => (
                deployment.digest === digest
                && deployment.outcome === 'success'
                && !deployment.reject
            ),
        );

}

    findRollbackDigest(service: string, currentDigest: string | null): string | null {

        if (!currentDigest) {

            return null;

}

        const deployments = this.getDeployments(service);
        const currentIndex = deployments.findIndex((deployment) => deployment.digest === currentDigest);

        if (currentIndex >= 0) {

            return deployments.slice(currentIndex + 1).find(
                (deployment) => deployment.outcome === 'success' && !deployment.reject,
            )?.digest ?? null;

}

        return deployments.find(
            (deployment) => (
                deployment.outcome === 'success'
                && !deployment.reject
                && deployment.digest !== currentDigest
            ),
        )?.digest ?? null;

}

    appendEvent(event: DeploymentEvent): void {

        this.state.events.unshift({
            at: event.at.toISOString(),
            type: event.type,
            service: event.service,
            message: event.message,
        });

        if (this.state.events.length > MAX_EVENTS) {

            this.state.events = this.state.events.slice(0, MAX_EVENTS);

}

        this.dirty = true;

}

    getEvents(): DeploymentEvent[] {

        return this.state.events.map((event) => ({
            at: new Date(event.at),
            type: event.type,
            service: event.service,
            message: event.message,
        }));

}

}

function emptyState(): PersistedState {

    return {
        version: CURRENT_VERSION,
        deployments: {},
        pollEnabled: {},
        events: [],
    };

}

function parsePersistedState(parsed: Partial<PersistedState> & {
    knownGood?: Record<string, string>;
    badDigests?: Record<string, string[]>;
}): PersistedState {

    if ((parsed.version ?? 1) < CURRENT_VERSION) {

        return migrateState(parsed);

}

    return {
        version: CURRENT_VERSION,
        deployments: parsed.deployments ?? {},
        pollEnabled: parsed.pollEnabled ?? {},
        events: parsed.events ?? [],
    };

}

function migrateState(parsed: Partial<PersistedState> & {
    knownGood?: Record<string, string>;
    badDigests?: Record<string, string[]>;
}): PersistedState {

    return {
        version: CURRENT_VERSION,
        deployments: parsed.deployments ?? {},
        pollEnabled: parsed.pollEnabled ?? {},
        events: parsed.events ?? [],
    };

}
