import {useState} from 'react';
import {getAuthToken, setAuthToken} from '../api.js';
import {useTheme} from '../hooks/useTheme.js';

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
