import {useTheme} from '../hooks/useTheme.js';

export function Header(): JSX.Element {
    const {theme, setTheme} = useTheme();

    return (
        <header className="header">
            <div className="container header-content">
                <img src="/assets/castellan-logo-light.png" alt="Castellan" className="header-logo logo-light" />
                <img src="/assets/castellan-logo-dark.png" alt="" aria-hidden="true" className="header-logo logo-dark" />
                <div className="header-brand">
                    <h1>Castellan</h1>
                    <p className="header-tagline">Drop-in Watchtower replacement for docker-compose</p>
                </div>
                <div className="header-controls">
                    <select
                        className="theme-select"
                        value={theme}
                        onChange={(event) => setTheme(event.target.value as 'light' | 'dark' | 'system')}
                    >
                        <option value="system">System</option>
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                    </select>
                </div>
            </div>
        </header>
    );
}
