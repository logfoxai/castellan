import Docker, {ContainerInfo, ImageInfo, NetworkInspectInfo, VolumeInspectInfo} from 'dockerode';
import {execFile} from 'child_process';
import {promisify} from 'util';
import type {ComposeConfig} from './types.js';
import {parseStatsOutput, type ContainerStat} from './stats.js';

const execFileAsync = promisify(execFile);

/**
 * dockerode's ContainerInfo type omits the size fields, which the daemon only
 * returns when listing with `size: true`. Model the real response shape.
 */
export type ContainerInfoWithSize = ContainerInfo & {
    SizeRw?: number;
    SizeRootFs?: number;
};

export class DockerClient {

    private readonly docker: Docker;

    constructor(socketPath: string = '/var/run/docker.sock') {

        this.docker = new Docker({socketPath});

}

    async listContainers(): Promise<ContainerInfoWithSize[]> {

        return this.docker.listContainers({all: true, size: true});

}

    async getAllStats(): Promise<ContainerStat[]> {

        try {

            const {stdout} = await execFileAsync('docker', [
                'stats',
                '--no-stream',
                '--format', '{{json .}}',
            ], {timeout: 30_000});

            return parseStatsOutput(stdout);

} catch (err) {

            console.error('Failed to collect container stats:', err instanceof Error ? err.message : err);
            return [];

}

}

    async listImages(): Promise<ImageInfo[]> {

        return this.docker.listImages();

}

    async listNetworks(): Promise<NetworkInspectInfo[]> {

        return this.docker.listNetworks();

}

    async listVolumes(): Promise<VolumeInspectInfo[]> {

        const result = await this.docker.listVolumes();

        return result.Volumes ?? [];

}

    async getInfo(): Promise<unknown> {

        return this.docker.info();

}

    async getContainerStats(containerId: string): Promise<unknown> {

        const container = this.docker.getContainer(containerId);
        const stats = await container.stats({stream: false});

        return stats;

}

    async getContainerLogs(containerId: string, tail: number): Promise<string> {

        const container = this.docker.getContainer(containerId);
        const stream = await container.logs({
            tail,
            stdout: true,
            stderr: true,
            timestamps: false,
        });

        return stream.toString();

}

    async getEvents(sinceSeconds: number): Promise<unknown[]> {

        const since = Math.floor(Date.now() / 1000) - sinceSeconds;
        const until = Math.floor(Date.now() / 1000);
        const {stdout} = await execFileAsync('docker', [
            'events',
            '--since', String(since),
            '--until', String(until),
            '--format', '{{json .}}',
        ]);

        if (!stdout.trim()) {

            return [];

}

        return stdout
            .trim()
            .split('\n')
            .filter((line: string) => line.trim())
            .map((line: string) => JSON.parse(line) as unknown);

}

    async pullImage(image: string): Promise<void> {

        const stream = await this.docker.pull(image);

        await new Promise<void>((resolve, reject) => {

            this.docker.modem.followProgress(stream, (err: Error | null) => {

                if (err) {

                    reject(err);

                    return;

}

                resolve();

});

});

}

    async tagImage(source: string, target: string): Promise<void> {

        const image = this.docker.getImage(source);
        const {repo, tag} = parseImageRef(target);

        await image.tag({repo, tag});

}

    async getLocalDigest(registry: string, repository: string, tag: string): Promise<string | null> {

        const hosts = [registry, normalizeRegistryHost(registry)];
        const uniqueHosts = [...new Set(hosts)];

        for (const host of uniqueHosts) {

            const digest = await this.tryGetLocalDigest(host, repository, tag);

            if (digest) {

                return digest;

}

}

        return null;

}

    private async tryGetLocalDigest(registry: string, repository: string, tag: string): Promise<string | null> {

        const image = this.docker.getImage(`${registry}/${repository}:${tag}`);

        try {

            const info = await image.inspect();
            const digests = info.RepoDigests ?? [];

            if (digests.length === 1) {

                return digests[0].split('@')[1] ?? null;

}

            const prefix = `${registry}/${repository}@`;
            const digest = digests.find((repoDigest) => repoDigest.startsWith(prefix))?.split('@')[1];

            return digest ?? null;

} catch {

            return null;

}

}


    async composePull(
        service: string,
        compose: ComposeConfig,
    ): Promise<void> {

        await this.runCompose(compose, 'pull', service);

}

    async composeUp(
        service: string,
        compose: ComposeConfig,
    ): Promise<void> {

        await this.runCompose(compose, 'up', '-d', service);

}

    private async runCompose(
        compose: ComposeConfig,
        ...args: string[]
    ): Promise<void> {

        const commandArgs = ['compose', '-f', compose.file];

        if (compose.project) {

            commandArgs.push('-p', compose.project);

}

        if (compose.envFile) {

            commandArgs.push('--env-file', compose.envFile);

}

        commandArgs.push(...args);

        const {stdout, stderr} = await execFileAsync('docker', commandArgs, {timeout: 600_000});

        if (stderr && stderr.trim()) {

            console.error(stderr.trim());

}

        if (stdout && stdout.trim()) {

            console.log(stdout.trim());

}

}

}

function parseImageRef(ref: string): {repo: string; tag: string} {

    const lastColon = ref.lastIndexOf(':');

    if (lastColon === -1 || ref.lastIndexOf('/') > lastColon) {

        throw new Error(`Image ref must include a tag: ${ref}`);

}

    return {
        repo: ref.slice(0, lastColon),
        tag: ref.slice(lastColon + 1),
    };

}

function normalizeRegistryHost(registry: string): string {

    if (registry === 'docker.io' || registry === 'registry.hub.docker.com') {

        return 'registry-1.docker.io';

}

    return registry;

}
