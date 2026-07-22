import {useState} from 'react';
import {usePolling} from '../hooks/usePolling.js';
import {rpc} from '../api.js';
import type {ContainerStat} from '../api.js';
import {parseUsagePercent} from '../parseUsagePercent.js';
import {UsageRing} from './UsageRing.js';

export function DockerPanel(): JSX.Element {
    const {data: containerData} = usePolling(() => rpc('dockerContainers'), 10000);
    const {data: statsData} = usePolling(() => rpc('dockerStatsAll'), 10000);
    const [selected, setSelected] = useState<string | null>(null);

    const containers = containerData?.containers ?? [];
    const statsByName = new Map<string, ContainerStat>(
        (statsData?.stats ?? []).map((stat) => [stat.name, stat]),
    );

    return (
        <section className="panel docker-panel">
            <h2>Containers</h2>
            {containers.length === 0 ? (
                <p className="empty">No containers found.</p>
            ) : (
                <div className="docker-table">
                    <div className="docker-head">
                        <span>Name</span>
                        <span className="num">CPU</span>
                        <span className="num">Memory</span>
                        <span className="num">Disk</span>
                    </div>
                    {containers.map((container) => {
                        const stat = statsByName.get(container.name);
                        const cpuPercent = parseUsagePercent(stat?.cpu);
                        const memPercent = parseUsagePercent(stat?.memPerc);

                        return (
                            <div key={container.id} className="docker-row">
                                <button
                                    className="docker-name"
                                    title={container.name}
                                    onClick={() => setSelected(container.id)}
                                >
                                    <span className="docker-name-main">{container.displayName}</span>
                                    <span className={`docker-state state state-${container.state}`}>
                                        {container.state}
                                    </span>
                                    <span className="docker-image">{container.image}</span>
                                </button>
                                <span className="num docker-metric">
                                    <i className="mlabel">CPU</i>
                                    <UsageRing percent={cpuPercent} tone="cpu" />
                                    <span className="docker-metric-value">{stat?.cpu ?? '—'}</span>
                                </span>
                                <span className="num docker-metric">
                                    <i className="mlabel">Mem</i>
                                    <UsageRing percent={memPercent} tone="memory" />
                                    <span className="docker-metric-value">
                                        {stat ? stat.mem : '—'}
                                        {stat && stat.memPerc !== '—' ? <em>{stat.memPerc}</em> : null}
                                    </span>
                                </span>
                                <span className="num">
                                    <i className="mlabel">Disk</i>
                                    {container.disk}
                                </span>
                            </div>
                        );
                    })}
                </div>
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
