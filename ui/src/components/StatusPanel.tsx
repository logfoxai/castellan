import {usePolling} from '../hooks/usePolling.js';
import {rpc} from '../api.js';

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
                    <div key={service.name} className={`status-card status-${service.state}`}>
                        <div className="status-card-header">
                            <strong>{service.name}</strong>
                            <span className="status-badge">{service.state}</span>
                        </div>
                        <div className="status-meta">
                            <span>
                                Current: <code>{service.currentDigest ? service.currentDigest.slice(0, 19) : 'unknown'}</code>
                            </span>
                            <span>
                                Desired: <code>{service.desiredDigest ? service.desiredDigest.slice(0, 19) : 'unknown'}</code>
                            </span>
                            <span>
                                Last check: {service.lastCheckAt ? new Date(service.lastCheckAt).toLocaleTimeString() : 'never'}
                            </span>
                            {service.lastError ? <span style={{color: 'var(--error)'}}>{service.lastError}</span> : null}
                        </div>
                    </div>
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
