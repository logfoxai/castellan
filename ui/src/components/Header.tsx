import {useTheme} from '../hooks/useTheme.js';

export function Header(): JSX.Element {
    const {theme, setTheme} = useTheme();

    return (
        <header className="header">
            <div className="container header-content">
                <div className="header-lockup" aria-label="Castellan">
                    <span className="header-mark" aria-hidden="true">
                        <img src="/assets/castellan-logo-light.png" alt="" className="header-logo logo-light" />
                        <img src="/assets/castellan-logo-dark.png" alt="" className="header-logo logo-dark" />
                    </span>
                    <h1 className="header-wordmark">Castellan</h1>
                </div>
                <div className="header-controls">
                    <select
                        className="theme-select"
                        value={theme}
                        aria-label="Color theme"
                        title="Color theme"
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
