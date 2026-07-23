import type {ServiceStatus} from './api.js';

export function formatServiceImageRef(service: ServiceStatus): string {

    return `${service.repository}:${service.tag}`;

}

export function formatDigestShort(digest: string | null): string {

    if (!digest) {

        return 'unknown';

}

    const value = digest.startsWith('sha256:') ? digest.slice(7) : digest;

    return value.slice(0, 12);

}

export function serviceVersionNote(service: ServiceStatus): string {

    if (!service.currentDigest || !service.desiredDigest) {

        return 'checking registry';

}

    if (service.currentDigest === service.desiredDigest) {

        return 'up to date';

}

    if (service.state === 'updating' || service.state === 'verifying') {

        return 'deploying new build';

}

    return 'update available';

}
