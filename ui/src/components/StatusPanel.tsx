import {usePolling} from '../hooks/usePolling.js';
import {rpc} from '../api.js';

export function StatusPanel(): JSX.Element {
    const {data, error, loading} = usePolling(() => rpc('status'), 5000);

    if (loading && !data) return <section className="panel status-panel">Loading status...</section>;
    if (error) return <section className="panel panel-error status-panel">Error loading status: {error.message}</section>;

    return (
        <section className="panel status-panel">
            <div className="panel-head">
                <h2>Service Status</h2>
                <span className={`poll-state${data?.paused ? ' paused' : ''}`}>
                    {data?.paused ? 'Polling paused' : 'Polling active'}
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
                <button onClick={() => rpc('forceCheck')}>Force check</button>
                <button onClick={() => rpc('pause')}>Pause</button>
                <button onClick={() => rpc('resume')}>Resume</button>
            </div>
        </section>
    );
}
