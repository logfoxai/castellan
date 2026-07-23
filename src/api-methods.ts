export type ApiMethod =
    | 'status'
    | 'forceCheck'
    | 'pause'
    | 'resume'
    | 'rollback'
    | 'history'
    | 'dockerContainers'
    | 'dockerImages'
    | 'dockerNetworks'
    | 'dockerVolumes'
    | 'dockerLogs'
    | 'dockerStats'
    | 'dockerStatsAll'
    | 'dockerInfo'
    | 'dockerEvents';

const API_METHODS = new Set<ApiMethod>([
    'status',
    'forceCheck',
    'pause',
    'resume',
    'rollback',
    'history',
    'dockerContainers',
    'dockerImages',
    'dockerNetworks',
    'dockerVolumes',
    'dockerLogs',
    'dockerStats',
    'dockerStatsAll',
    'dockerInfo',
    'dockerEvents',
]);

export function isApiMethod(value: string): value is ApiMethod {

    return API_METHODS.has(value as ApiMethod);

}

export function isDockerMethod(method: ApiMethod): boolean {

    return method.startsWith('docker');

}
