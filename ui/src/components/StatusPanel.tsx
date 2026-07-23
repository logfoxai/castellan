import {useState} from 'react';
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
                <span className={`poll-state${paused ? ' paused' : ''}`}>
                    {paused ? 'Polling paused' : 'Polling active'}
                </span>
            </div>
            <div className="status-grid">
                {(data?.services ?? []).map((service) => (
                    <ServiceCard key={service.name} service={service} onMutate={refresh} />
                ))}
            </div>
            <div className="actions">
                <button
                    title="Check all registries for new image versions right now, instead of waiting for the next scheduled poll."
                    onClick={() => act('forceCheck')}
                >
                    Check now
                </button>
                {paused ? (
                    <button
                        title="Resume automatic polling. Castellan will check registries on the configured interval and apply updates again."
                        onClick={() => act('resume')}
                    >
                        Resume polling
                    </button>
                ) : (
                    <button
                        title="Pause automatic polling. Castellan stops checking for and applying updates until you resume."
                        onClick={() => act('pause')}
                    >
                        Pause polling
                    </button>
                )}
            </div>
            <p className="actions-hint">
                Castellan polls your registries automatically. <strong>Check now</strong> forces an immediate check;
                pausing stops automatic updates until you resume.
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
    const inSync = Boolean(
        service.currentDigest
        && service.desiredDigest
        && service.currentDigest === service.desiredDigest,
    );
    const fullImage = `${service.registry}/${formatServiceImageRef(service)}`;

    const mutate = async (call: Promise<unknown>): Promise<void> => {
        await call;
        onMutate();
    };

    return (
        <div className={`status-card status-${service.state}`}>
            <div className="status-card-header">
                <strong>{service.name}</strong>
                <span className="status-badge">{service.state}</span>
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
                <button
                    title="Roll back to the previous successful deployment."
                    onClick={() => mutate(rpc('rollback', {service: service.name}))}
                >
                    Roll back
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
    const deployments = data?.deployments ?? [];

    const act = async (digest: string, method: 'deploy' | 'reject'): Promise<void> => {
        setBusyDigest(digest);

        try {
            await rpc(method, {service: service.name, digest});
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
                                        onClick={() => act(deployment.digest, 'deploy')}
                                    >
                                        Deploy
                                    </button>
                                ) : null}
                                {!deployment.reject ? (
                                    <button
                                        disabled={busyDigest === deployment.digest}
                                        onClick={() => act(deployment.digest, 'reject')}
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
