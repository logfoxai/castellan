/**
 * Docker Compose names containers `{project}_{service}_{replica}` — e.g.
 * `api_api-1_1` is project "api", service "api-1", instance 1.
 */
export function formatContainerDisplayName(rawName: string): string {

    const withoutReplica = rawName.replace(/_\d+$/, '');
    const separator = withoutReplica.indexOf('_');

    if (separator === -1) {

        return rawName;

}

    const service = withoutReplica.slice(separator + 1);

    return service || rawName;

}
