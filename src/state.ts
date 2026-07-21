import {readFile, writeFile, mkdir, rename} from 'fs/promises';
import {existsSync} from 'fs';
import path from 'path';
import type {DeploymentEvent} from './types.js';

export type PersistedState = {
    version: number;
    knownGood: Record<string, string>;
    badDigests: Record<string, string[]>;
    events: {
        at: string;
        type: DeploymentEvent['type'];
        service: string;
        message: string;
    }[];
};

const CURRENT_VERSION = 1;
const MAX_EVENTS = 500;

export class StateManager {

    private readonly filePath: string;
    private state: PersistedState;
    private dirty: boolean = false;
    private saveQueue: Promise<void> = Promise.resolve();

    constructor(filePath: string) {

        this.filePath = filePath;
        this.state = {
            version: CURRENT_VERSION,
            knownGood: {},
            badDigests: {},
            events: [],
        };

}

    async load(): Promise<void> {

        if (!existsSync(this.filePath)) {

            return;

}

        try {

            const raw = await readFile(this.filePath, 'utf8');
            const parsed = JSON.parse(raw) as PersistedState;

            this.state = {
                version: parsed.version ?? CURRENT_VERSION,
                knownGood: parsed.knownGood ?? {},
                badDigests: parsed.badDigests ?? {},
                events: parsed.events ?? [],
            };

} catch (err) {

            console.error(`Failed to load state from ${this.filePath}:`, err);
            this.state = {
                version: CURRENT_VERSION,
                knownGood: {},
                badDigests: {},
                events: [],
            };
            this.dirty = true;

}

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

    setKnownGood(service: string, digest: string): void {

        this.state.knownGood[service] = digest;
        this.dirty = true;

}

    getKnownGood(service: string): string | null {

        return this.state.knownGood[service] ?? null;

}

    getBadDigests(service: string): string[] {

        return this.state.badDigests[service] ?? [];

}

    addBadDigest(service: string, digest: string): void {

        const existing = this.state.badDigests[service] ?? [];

        if (!existing.includes(digest)) {

            this.state.badDigests[service] = [...existing, digest];
            this.dirty = true;

}

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
