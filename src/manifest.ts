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

const MANIFEST_LIST_TYPES = new Set([
    'application/vnd.docker.distribution.manifest.list.v2+json',
    'application/vnd.oci.image.index.v1+json',
]);

export function isManifestList(mediaType: string | undefined, manifest: string): boolean {

    if (mediaType && MANIFEST_LIST_TYPES.has(mediaType)) {

        return true;

}

    try {

        const parsed = JSON.parse(manifest) as ManifestList;

        return Array.isArray(parsed.manifests);

} catch {

        return false;

}

}

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
