import { useState, useEffect } from 'react';
import './index.css';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import Titlebar from './components/Titlebar';
import Sidebar from './components/Sidebar';

interface User { id: string; name: string; email: string; }

function getInitialTheme(): 'light' | 'dark' {
    const saved = localStorage.getItem('wf_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    // Respect OS preference on first launch
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function App() {
    const savedUser  = localStorage.getItem('wf_user');
    const savedToken = localStorage.getItem('wf_token');

    const [user,       setUser]   = useState<User | null>(savedUser ? JSON.parse(savedUser) : null);
    const [token,      setToken]  = useState<string | null>(savedToken);
    const [activeView, setView]   = useState('tracker');
    const [theme,      setTheme]  = useState<'light' | 'dark'>(getInitialTheme);

    // Apply theme to <html data-theme="..."> whenever it changes
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('wf_theme', theme);
    }, [theme]);

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

    const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

    const handleLogin = (u: User, t: string) => { setUser(u); setToken(t); };
    const handleLogout = () => {
        localStorage.removeItem('wf_token');
        localStorage.removeItem('wf_user');
        setUser(null);
        setToken(null);
    };

    if (!user || !token) {
        return (
            <>
                <Titlebar userName="Guest" theme={theme} onToggleTheme={toggleTheme} />
                <LoginPage onLogin={handleLogin} />
            </>
        );
    }

    return (
        <>
            <Titlebar userName={user.name} theme={theme} onToggleTheme={toggleTheme} />
            <div className="layout">
                <Sidebar
                    user={user}
                    activeView={activeView}
                    onViewChange={setView}
                    onLogout={handleLogout}
                    theme={theme}
                    onToggleTheme={toggleTheme}
                />
                <Dashboard view={activeView} />
            </div>
        </>
    );
}

export default App;
