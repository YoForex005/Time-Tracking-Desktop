import React, { useState } from 'react';
import { login } from '../api';

interface LoginPageProps {
    onLogin: (user: { id: string; name: string; email: string }, token: string) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
    const [email, setEmail] = useState('alice@workfolio.com');
    const [password, setPassword] = useState('password123');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const data = await login(email, password);
            localStorage.setItem('wf_token', data.token);
            localStorage.setItem('wf_user', JSON.stringify(data.user));
            onLogin(data.user, data.token);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login__brand">
                    <div className="login__brand-icon">⏱</div>
                    <h1>Workfolio</h1>
                    <p>Employee Time Tracker — Sign in to continue</p>
                </div>

                {error && <div className="form-error">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Email Address</label>
                        <input
                            id="email"
                            type="email"
                            className="form-input"
                            placeholder="you@company.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            autoFocus
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input
                            id="password"
                            type="password"
                            className="form-input"
                            placeholder="••••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button type="submit" className="btn btn-primary login-submit" disabled={loading}>
                        {loading ? <span className="spinner" /> : null}
                        {loading ? 'Signing in…' : 'Sign In'}
                    </button>
                </form>

                <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    Demo: alice@workfolio.com / password123
                </p>
            </div>
        </div>
    );
}
