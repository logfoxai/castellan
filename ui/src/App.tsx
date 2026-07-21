import {Header} from './components/Header.js';
import {StatusPanel} from './components/StatusPanel.js';
import {DockerPanel} from './components/DockerPanel.js';
import {HistoryPanel} from './components/HistoryPanel.js';

export function App(): JSX.Element {
    return (
        <div className="app">
            <Header />
            <main className="container">
                <StatusPanel />
                <HistoryPanel />
                <DockerPanel />
            </main>
        </div>
    );
}
