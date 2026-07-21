import {useState} from 'react';
import {usePolling} from '../hooks/usePolling.js';
import {rpc} from '../api.js';

export function DockerPanel(): JSX.Element {
    const {data} = usePolling(() => rpc('dockerContainers'), 10000);
    const [selected, setSelected] = useState<string | null>(null);
    const containers = (data?.containers ?? []) as {Id: string; Names?: string[]; State: string}[];

    return (
        <section className="panel docker-panel">
            <h2>Containers</h2>
            {containers.length === 0 ? (
                <p className="empty">No containers found.</p>
            ) : (
                <ul className="docker-list">
                    {containers.map((container) => (
                        <li key={container.Id} className="docker-item">
                            <button onClick={() => setSelected(container.Id)}>
                                {container.Names?.[0]?.replace(/^\//, '') ?? container.Id.slice(0, 12)}
                            </button>
                            <span className={`state state-${container.State}`}>{container.State}</span>
                        </li>
                    ))}
                </ul>
            )}
            {selected && <LogViewer containerId={selected} />}
        </section>
    );
}

function LogViewer({containerId}: { containerId: string }): JSX.Element {
    const {data, loading} = usePolling(() => rpc('dockerLogs', {containerId, tail: 100}), 5000);

    return (
        <div className="log-viewer">
            <h3>Logs: {containerId.slice(0, 12)}</h3>
            {loading && !data ? 'Loading...' : null}
            <pre>{(data?.logs ?? '').trim()}</pre>
        </div>
    );
}
