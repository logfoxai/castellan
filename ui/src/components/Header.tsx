import {useState} from 'react';
import {getAuthToken, setAuthToken} from '../api.js';

export function Header(): JSX.Element {
    const [token, setToken] = useState(getAuthToken());

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
        const value = event.target.value;
        setToken(value);
        setAuthToken(value);
    };

    return (
        <header className="header">
            <div className="container header-content">
                <img src="/assets/castellan-logo.svg" alt="Castellan" className="header-logo" />
                <div className="header-brand">
                    <h1>Castellan</h1>
                    <p className="header-tagline">Deployment watchdog for docker-compose</p>
                </div>
                <input
                    type="password"
                    className="token-input"
                    placeholder="API token (optional)"
                    value={token}
                    onChange={handleChange}
                />
            </div>
        </header>
    );
}
