import {usePolling} from '../hooks/usePolling.js';
import {rpc} from '../api.js';

export function HistoryPanel(): JSX.Element {
    const {data} = usePolling(() => rpc('history'), 10000);
    const events = (data?.events ?? []).slice(0, 50);

    return (
        <section className="panel history-panel">
            <h2>History</h2>
            {events.length === 0 ? (
                <p className="empty">No events yet.</p>
            ) : (
                <ul className="history-list">
                    {events.map((event, index) => (
                        <li key={index} className={`history-item history-${event.type}`}>
                            <time>{new Date(event.at).toLocaleTimeString()}</time>
                            <span className="history-type">{event.type}</span>
                            <span>{event.service} — {event.message}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
