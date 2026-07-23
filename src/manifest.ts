type ManifestPlatform = {
    architecture: string;
    os: string;
};

type ManifestListEntry = {
    digest: string;
    platform?: ManifestPlatform;
};

type ManifestList = {
    schemaVersion?: number;
    mediaType?: string;
    manifests?: ManifestListEntry[];
};

export function resolveManifestList(manifest: string, platform: string = getDefaultPlatform()): string {

    const parsed = JSON.parse(manifest) as ManifestList;
    const manifests = parsed.manifests ?? [];

    if (manifests.length === 0) {

        throw new Error('Manifest list is empty');

}

    const [osName, architecture] = platform.split('/');
    const match = manifests.find((entry) =>
        entry.platform?.os === osName && entry.platform?.architecture === architecture,
    );

    if (!match) {

        throw new Error(`No manifest for platform ${platform} in manifest list`);

}

    return match.digest;

}

function getDefaultPlatform(): string {

    const arch = process.arch === 'x64' ? 'amd64' : process.arch;

    return `linux/${arch}`;

}

type VerboseManifestEntry = {
    Descriptor?: {
        digest?: string;
        platform?: ManifestPlatform;
    };
    Digest?: string;
};

export function parseManifestInspectStdout(stdout: string, platform: string = getDefaultPlatform()): string {

    const parsed: unknown = JSON.parse(stdout);

    if (Array.isArray(parsed)) {

        return digestFromVerboseEntries(parsed as VerboseManifestEntry[], platform);

}

    if (typeof parsed === 'object' && parsed !== null) {

        const object = parsed as VerboseManifestEntry & ManifestList;

        if (Array.isArray(object.manifests)) {

            return resolveManifestList(stdout, platform);

}

        const singleDigest = object.Descriptor?.digest ?? object.Digest;

        if (singleDigest) {

            return singleDigest;

}

}

    throw new Error('Unexpected docker manifest inspect output');

}

function digestFromVerboseEntries(entries: VerboseManifestEntry[], platform: string): string {

    const [osName, architecture] = platform.split('/');
    const match = entries.find((entry) =>
        entry.Descriptor?.platform?.os === osName
        && entry.Descriptor?.platform?.architecture === architecture,
    ) ?? entries.find((entry) => entry.Descriptor?.digest);

    const digest = match?.Descriptor?.digest;

    if (!digest) {

        throw new Error('No digest found in docker manifest inspect output');

}

    return digest;

}
