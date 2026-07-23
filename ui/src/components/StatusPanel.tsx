import {useEffect, useRef, useState} from 'react';
import {usePolling} from '../hooks/usePolling.js';
import {rpc} from '../api.js';
import type {ServiceStatus} from '../api.js';
import {formatDigestShort, formatServiceImageRef, serviceVersionNote} from '../serviceDisplay.js';

export function StatusPanel(): JSX.Element {
    const {data, error, loading, refresh} = usePolling(() => rpc('status'), 5000);

    if (loading && !data) return <section className="panel status-panel">Loading status...</section>;
    if (error) return <section className="panel panel-error status-panel">Error loading status: {error.message}</section>;

    const paused = data?.paused ?? false;

    const act = async (method: 'forceCheck' | 'pause' | 'resume'): Promise<void> => {
        await rpc(method);
        refresh();
    };

    return (
        <section className="panel status-panel">
            <div className="panel-head">
                <h2>Service Status</h2>
                <span className={`auto-state${paused ? ' paused' : ''}`}>
                    {paused ? 'Updates paused' : 'Watching registries'}
                </span>
            </div>
            <div className="status-grid">
                {(data?.services ?? []).map((service) => (
                    <ServiceCard key={service.name} service={service} onMutate={refresh} />
                ))}
            </div>
            <div className="actions">
                <button
                    title="Check registries for auto-update services right now."
                    onClick={() => act('forceCheck')}
                >
                    Check now
                </button>
                {paused ? (
                    <button
                        title="Resume automatic updates for all services."
                        onClick={() => act('resume')}
                    >
                        Resume all
                    </button>
                ) : (
                    <button
                        title="Pause automatic updates for all services until you resume."
                        onClick={() => act('pause')}
                    >
                        Pause all
                    </button>
                )}
            </div>
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
    const [detailOpen, setDetailOpen] = useState(false);

    return (
        <>
            <div className={`status-card status-${service.state}${service.pollEnabled ? '' : ' auto-disabled'}`}>
                <div className="status-card-header">
                    <strong>{service.name}</strong>
                    <span className="status-badge">{service.state}</span>
                    <span className={`auto-badge${service.pollEnabled ? ' auto-on' : ' auto-off'}`}>
                        {service.pollEnabled ? 'Auto' : 'Manual'}
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
                    <button onClick={() => setDetailOpen(true)}>Manage</button>
                </div>
            </div>
            {detailOpen ? (
                <ServiceDetailDialog
                    service={service}
                    onClose={() => setDetailOpen(false)}
                    onMutate={onMutate}
                />
            ) : null}
        </>
    );
}

function ServiceDetailDialog({
    service,
    onClose,
    onMutate,
}: {
    service: ServiceStatus;
    onClose: () => void;
    onMutate: () => void;
}): JSX.Element {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [pollBusy, setPollBusy] = useState(false);
    const inSync = Boolean(
        service.currentDigest
        && service.desiredDigest
        && service.currentDigest === service.desiredDigest,
    );
    const fullImage = `${service.registry}/${formatServiceImageRef(service)}`;

    useEffect(() => {
        dialogRef.current?.showModal();
    }, []);

    const toggleAuto = async (): Promise<void> => {
        setPollBusy(true);

        try {
            await rpc('setPollEnabled', {service: service.name, enabled: !service.pollEnabled});
            onMutate();
        } finally {
            setPollBusy(false);
        }
    };

    return (
        <dialog
            ref={dialogRef}
            className="service-detail-dialog"
            onCancel={onClose}
            onClose={onClose}
        >
            <form method="dialog" className="service-detail-body">
                <div className="service-detail-head">
                    <div>
                        <h3>{service.name}</h3>
                        <p className="service-detail-subtitle">
                            <code>{formatServiceImageRef(service)}</code>
                            {' · '}
                            <span className={`auto-badge${service.pollEnabled ? ' auto-on' : ' auto-off'}`}>
                                {service.pollEnabled ? 'Auto' : 'Manual'}
                            </span>
                        </p>
                    </div>
                    <button type="button" className="dialog-close" aria-label="Close" onClick={onClose}>
                        ×
                    </button>
                </div>
                <div className="service-detail-section">
                    <div className="service-detail-toolbar">
                        <button type="button" disabled={pollBusy} onClick={toggleAuto}>
                            {service.pollEnabled ? 'Switch to manual' : 'Enable auto updates'}
                        </button>
                    </div>
                    <dl className="service-detail-dl">
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
                </div>
                <ServiceDeployments service={service} onMutate={onMutate} />
            </form>
        </dialog>
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
                                        type="button"
                                        disabled={busyDigest === deployment.digest}
                                        onClick={() => setConfirmDigest(deployment.digest)}
                                    >
                                        Deploy
                                    </button>
                                ) : null}
                                {!deployment.reject ? (
                                    <button
                                        type="button"
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
                    Manual deploy switches this service to manual mode until you re-enable auto updates.
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
