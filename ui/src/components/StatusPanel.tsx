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
                    <ServiceCard key={service.name} service={service} />
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

function ServiceCard({service}: { service: ServiceStatus }): JSX.Element {
    const inSync = Boolean(
        service.currentDigest
        && service.desiredDigest
        && service.currentDigest === service.desiredDigest,
    );
    const fullImage = `${service.registry}/${formatServiceImageRef(service)}`;

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
            </details>
        </div>
    );
}
