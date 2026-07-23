import {useEffect, useRef, useState} from 'react';
import {usePolling} from '../hooks/usePolling.js';
import {rpc} from '../api.js';
import type {ServiceStatus} from '../api.js';
import {formatDigestShort, formatServiceImageRef, serviceVersionNote} from '../serviceDisplay.js';

export function StatusPanel(): JSX.Element {
    const {data, error, loading, refresh} = usePolling(() => rpc('status'), 5000);
    const {data: discoverData, refresh: refreshDiscover} = usePolling(() => rpc('discoverServices'), 10000);

    if (loading && !data) return <section className="panel status-panel">Loading status...</section>;
    if (error) return <section className="panel panel-error status-panel">Error loading status: {error.message}</section>;

    const paused = data?.paused ?? false;

    const act = async (method: 'forceCheck' | 'pause' | 'resume'): Promise<void> => {
        await rpc(method);
        refresh();
    };

    const refreshAll = (): void => {
        refresh();
        refreshDiscover();
    };

    const discoverable = discoverData?.services ?? [];

    return (
        <section className="panel status-panel">
            <div className="panel-head">
                <h2>Service Status</h2>
                <span className={`poll-state${paused ? ' paused' : ''}`}>
                    {paused ? 'Polling paused' : 'Polling active'}
                </span>
            </div>
            <div className="status-grid">
                {(data?.services ?? []).map((service) => (
                    <ServiceCard key={service.name} service={service} onMutate={refreshAll} />
                ))}
            </div>
            {discoverable.length > 0 ? (
                <div className="discover-services">
                    <h3>Available to enable</h3>
                    <p className="actions-hint">
                        These compose services have autoupdate labels but are not managed yet.
                    </p>
                    <ul>
                        {discoverable.map((service) => (
                            <li key={service.name} className="discover-service-row">
                                <code>{service.name}</code>
                                <span>{service.registry}/{service.repository}:{service.tag}</span>
                                <button
                                    onClick={async () => {
                                        await rpc('setPollEnabled', {service: service.name, enabled: true});
                                        refreshAll();
                                    }}
                                >
                                    Enable polling
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
            <div className="actions">
                <button
                    title="Check registries for poll-enabled services right now."
                    onClick={() => act('forceCheck')}
                >
                    Check now
                </button>
                {paused ? (
                    <button
                        title="Resume automatic polling for poll-enabled services."
                        onClick={() => act('resume')}
                    >
                        Resume polling
                    </button>
                ) : (
                    <button
                        title="Pause automatic polling for all services until you resume."
                        onClick={() => act('pause')}
                    >
                        Pause polling
                    </button>
                )}
            </div>
            <p className="actions-hint">
                Each service can be poll-enabled or disabled individually. Manual deploy disables polling
                for that service until you re-enable it.
            </p>
        </section>
    );
}

function ServiceCard({
    service,
    onMutate,
}: {
    service: ServiceStatus;
    onMutate: () => void;
}): JSX.Element {
    const [pollBusy, setPollBusy] = useState(false);
    const inSync = Boolean(
        service.currentDigest
        && service.desiredDigest
        && service.currentDigest === service.desiredDigest,
    );
    const fullImage = `${service.registry}/${formatServiceImageRef(service)}`;

    const togglePoll = async (): Promise<void> => {
        setPollBusy(true);

        try {
            await rpc('setPollEnabled', {service: service.name, enabled: !service.pollEnabled});
            onMutate();
        } finally {
            setPollBusy(false);
        }
    };

    return (
        <div className={`status-card status-${service.state}${service.pollEnabled ? '' : ' poll-disabled'}`}>
            <div className="status-card-header">
                <strong>{service.name}</strong>
                <span className="status-badge">{service.state}</span>
                <span className={`poll-badge${service.pollEnabled ? ' poll-on' : ' poll-off'}`}>
                    {service.pollEnabled ? 'Polling on' : 'Polling off'}
                </span>
            </div>
            <div className="status-version">
                <code className="status-image-ref">{formatServiceImageRef(service)}</code>
                <span className="status-version-note">{serviceVersionNote(service)}</span>
            </div>
            <div className="status-meta">
                <span>
                    Last check: {service.lastCheckAt ? new Date(service.lastCheckAt).toLocaleTimeString() : 'never'}
                </span>
                {service.lastError ? <span className="status-error">{service.lastError}</span> : null}
            </div>
            <div className="status-card-actions">
                <button disabled={pollBusy} onClick={togglePoll}>
                    {service.pollEnabled ? 'Disable polling' : 'Enable polling'}
                </button>
            </div>
            <details className="status-details">
                <summary>{inSync ? 'Image details' : 'Image details · digest changed'}</summary>
                <dl>
                    <div>
                        <dt>Watched tag</dt>
                        <dd><code>{service.tag}</code></dd>
                    </div>
                    <div>
                        <dt>Full image</dt>
                        <dd><code>{fullImage}</code></dd>
                    </div>
                    <div>
                        <dt>Running digest</dt>
                        <dd><code>{service.currentDigest ?? 'unknown'}</code></dd>
                    </div>
                    <div>
                        <dt>Registry digest</dt>
                        <dd><code>{service.desiredDigest ?? 'unknown'}</code></dd>
                    </div>
                    {!inSync && service.currentDigest && service.desiredDigest ? (
                        <div>
                            <dt>Change</dt>
                            <dd>
                                <code>{formatDigestShort(service.currentDigest)}</code>
                                {' → '}
                                <code>{formatDigestShort(service.desiredDigest)}</code>
                            </dd>
                        </div>
                    ) : null}
                </dl>
                <ServiceDeployments service={service} onMutate={onMutate} />
            </details>
        </div>
    );
}

function ServiceDeployments({
    service,
    onMutate,
}: {
    service: ServiceStatus;
    onMutate: () => void;
}): JSX.Element {
    const {data} = usePolling(() => rpc('deployments', {service: service.name}), 10000);
    const [busyDigest, setBusyDigest] = useState<string | null>(null);
    const [confirmDigest, setConfirmDigest] = useState<string | null>(null);
    const deployments = data?.deployments ?? [];

    const deploy = async (digest: string): Promise<void> => {
        setBusyDigest(digest);

        try {
            await rpc('deploy', {service: service.name, digest});
            onMutate();
        } finally {
            setBusyDigest(null);
        }
    };

    const reject = async (digest: string): Promise<void> => {
        setBusyDigest(digest);

        try {
            await rpc('reject', {service: service.name, digest});
            onMutate();
        } finally {
            setBusyDigest(null);
        }
    };

    if (deployments.length === 0) {
        return <p className="deployments-empty">No deployments recorded yet.</p>;
    }

    return (
        <div className="deployments-list">
            <h3>Past deployments</h3>
            {confirmDigest ? (
                <DeployConfirmDialog
                    digest={confirmDigest}
                    serviceName={service.name}
                    busy={busyDigest === confirmDigest}
                    onCancel={() => setConfirmDigest(null)}
                    onConfirm={async () => {
                        const digest = confirmDigest;

                        setConfirmDigest(null);
                        await deploy(digest);
                    }}
                />
            ) : null}
            <ul>
                {deployments.map((deployment) => {
                    const isCurrent = deployment.digest === service.currentDigest;
                    const flags = [
                        isCurrent ? 'current' : null,
                        deployment.outcome === 'failed' ? 'failed' : null,
                        deployment.reject ? 'rejected' : null,
                    ].filter(Boolean);

                    return (
                        <li key={`${deployment.at}-${deployment.digest}`} className="deployment-row">
                            <div className="deployment-main">
                                <code>{formatDigestShort(deployment.digest)}</code>
                                <time>{new Date(deployment.at).toLocaleString()}</time>
                                {flags.length > 0 ? (
                                    <span className="deployment-flags">{flags.join(' · ')}</span>
                                ) : null}
                            </div>
                            <div className="deployment-actions">
                                {!isCurrent ? (
                                    <button
                                        disabled={busyDigest === deployment.digest}
                                        onClick={() => setConfirmDigest(deployment.digest)}
                                    >
                                        Deploy
                                    </button>
                                ) : null}
                                {!deployment.reject ? (
                                    <button
                                        disabled={busyDigest === deployment.digest}
                                        onClick={() => reject(deployment.digest)}
                                    >
                                        Reject
                                    </button>
                                ) : null}
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function DeployConfirmDialog({
    digest,
    serviceName,
    busy,
    onCancel,
    onConfirm,
}: {
    digest: string;
    serviceName: string;
    busy: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}): JSX.Element {
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        dialogRef.current?.showModal();
    }, []);

    return (
        <dialog
            ref={dialogRef}
            className="confirm-dialog"
            onCancel={onCancel}
            onClose={onCancel}
        >
            <form method="dialog" className="confirm-dialog-body">
                <h4>Deploy this version?</h4>
                <p>
                    You are about to deploy <code>{formatDigestShort(digest)}</code> for{' '}
                    <strong>{serviceName}</strong>.
                </p>
                <p className="confirm-dialog-warning">
                    This pauses automatic updates for this service until you re-enable polling.
                </p>
                <div className="confirm-dialog-actions">
                    <button type="button" disabled={busy} onClick={onCancel}>
                        Cancel
                    </button>
                    <button type="button" disabled={busy} className="confirm-dialog-primary" onClick={onConfirm}>
                        {busy ? 'Deploying…' : 'Deploy'}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
