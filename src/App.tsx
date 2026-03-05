import { useState, useEffect } from 'react';
import './index.css';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import Titlebar from './components/Titlebar';

interface User {
    id: string;
    name: string;
    email: string;
}

function getSavedUser(): User | null {
    const raw = localStorage.getItem('wf_user');
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as Partial<User>;
        if (
            typeof parsed.id === 'string' &&
            typeof parsed.name === 'string' &&
            typeof parsed.email === 'string'
        ) {
            return { id: parsed.id, name: parsed.name, email: parsed.email };
        }
        return null;
    } catch {
        return null;
    }
}

function App() {
    const savedToken = localStorage.getItem('wf_token');

    const [user, setUser] = useState<User | null>(getSavedUser());
    const [token, setToken] = useState<string | null>(savedToken);

    // Keep Electron tracker auth token in sync with login/logout state.
    useEffect(() => {
        const api = (window as unknown as {
            electronAPI?: {
                setTrackerAuthToken?: (t: string) => void;
                clearTrackerAuthToken?: () => void;
            };
        }).electronAPI;

        if (!api) return;

        if (token && api.setTrackerAuthToken) {
            api.setTrackerAuthToken(token);
            return;
        }

        if (!token && api.clearTrackerAuthToken) {
            api.clearTrackerAuthToken();
        }
    }, [token]);

    // Auto-logout on token expiry. api.ts fires 'wf:session-expired' on 401.
    useEffect(() => {
        const onExpired = () => {
            setUser(null);
            setToken(null);
        };
        window.addEventListener('wf:session-expired', onExpired);
        return () => window.removeEventListener('wf:session-expired', onExpired);
    }, []);

    const handleLogin = (u: User, t: string) => {
        setUser(u);
        setToken(t);
    };

    const handleLogout = () => {
        localStorage.removeItem('wf_token');
        localStorage.removeItem('wf_user');
        setUser(null);
        setToken(null);
    };

    if (!user || !token) {
        return (
            <>
                <Titlebar userName="Guest" />
                <LoginPage onLogin={handleLogin} />
            </>
        );
    }

    return (
        <>
            <Titlebar userName={user.name} />
            <Dashboard view="tracker" onLogout={handleLogout} />
        </>
    );
}

export default App;