export type ContainerStat = {
    name: string;
    cpu: string;
    mem: string;
    memPerc: string;
};

/**
 * Parse the output of `docker stats --no-stream --format '{{json .}}'`.
 * Each line is a JSON object with pre-formatted display strings.
 */
export function parseStatsOutput(stdout: string): ContainerStat[] {

    if (!stdout.trim()) {

        return [];

}

    return stdout
        .trim()
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {

            const row = JSON.parse(line) as {
                Name?: string;
                CPUPerc?: string;
                MemUsage?: string;
                MemPerc?: string;
            };

            return {
                name: (row.Name ?? '').replace(/^\//, ''),
                cpu: row.CPUPerc?.trim() || '—',
                mem: row.MemUsage?.split('/')[0]?.trim() || '—',
                memPerc: row.MemPerc?.trim() || '—',
            };

        });

}

/**
 * Human-readable byte size, e.g. 1536 -> "1.5 KB".
 */
export function formatBytes(bytes: number): string {

    if (!Number.isFinite(bytes) || bytes <= 0) {

        return '0 B';

}

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / (1024 ** exponent);
    const rounded = value >= 10 || exponent === 0 ? Math.round(value) : Math.round(value * 10) / 10;

    return `${rounded} ${units[exponent]}`;

}
