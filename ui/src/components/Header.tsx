import {useState} from 'react';
import {getAuthToken, setAuthToken} from '../api.js';
import {useTheme} from '../hooks/useTheme.js';

function LogoIcon(): JSX.Element {
    return (
        <svg
            className="header-logo"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M4 20h16" />
            <path d="M6 20v-8H4V8h2V6h3V4h6v2h3v2h2v4h-2v8" />
            <path d="M10 20v-6h4v6" />
            <path d="M9 4h6" />
            <path d="M8 12h8" />
        </svg>
    );
}

export function Header(): JSX.Element {
    const [token, setToken] = useState(getAuthToken());
    const {theme, setTheme} = useTheme();

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
        const value = event.target.value;
        setToken(value);
        setAuthToken(value);
    };

    return (
        <header className="header">
            <div className="container header-content">
                <LogoIcon />
                <div className="header-brand">
                    <h1>Castellan</h1>
                    <p className="header-tagline">Deployment watchdog for docker-compose</p>
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
                    <input
                        type="password"
                        className="token-input"
                        placeholder="API token (optional)"
                        value={token}
                        onChange={handleChange}
                    />
                </div>
            </div>
        </header>
    );
}
