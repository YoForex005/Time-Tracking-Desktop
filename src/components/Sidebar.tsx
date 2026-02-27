import { useState, useEffect } from 'react';

interface SidebarProps {
    user: { name: string; email: string };
    activeView: string;
    onViewChange: (view: string) => void;
    onLogout: () => void;
    theme: 'light' | 'dark';
    onToggleTheme: () => void;
    shiftActive: boolean; // true when a shift is in progress (working or on_break)
}

function initial(name: string) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

const ClockIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
);

const ListIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
);

const SunIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
);

const MoonIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
);

const LogoutIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
);

export default function Sidebar({ user, activeView, onViewChange, onLogout, theme, onToggleTheme, shiftActive }: SidebarProps) {
    const [showLogoutWarning, setShowLogoutWarning] = useState(false);

    // Auto-dismiss warning when shift ends (e.g. user checks out)
    useEffect(() => {
        if (!shiftActive) setShowLogoutWarning(false);
    }, [shiftActive]);

    const handleLogoutClick = () => {
        if (shiftActive) {
            // Shift in progress — show warning instead of logging out
            setShowLogoutWarning(true);
        } else {
            onLogout();
        }
    };

    const navItems = [
        { id: 'tracker', label: 'Time Tracker', icon: <ClockIcon /> },
        { id: 'history', label: 'History',      icon: <ListIcon /> },
    ];

    return (
        <div className="sidebar">
            {/* User info */}
            <div className="sidebar__user">
                <div className="sidebar__avatar">{initial(user.name)}</div>
                <div className="sidebar__name">{user.name}</div>
                <div className="sidebar__email">{user.email}</div>
            </div>

            {/* Nav */}
            {navItems.map(item => (
                <button
                    key={item.id}
                    id={`nav-${item.id}`}
                    className={`sidebar__nav-item${activeView === item.id ? ' active' : ''}`}
                    onClick={() => onViewChange(item.id)}
                >
                    {item.icon}
                    {item.label}
                </button>
            ))}

            {/* Logout-blocked warning — shown when user tries to logout during active shift */}
            {showLogoutWarning && (
                <div style={{
                    margin: '8px 12px',
                    padding: '10px 12px',
                    background: 'var(--danger-bg, #fee2e2)',
                    border: '1px solid var(--danger, #ef4444)',
                    borderRadius: 10,
                    fontSize: 12,
                    color: 'var(--danger-text, #b91c1c)',
                    lineHeight: 1.6,
                    position: 'relative',
                }}>
                    <button
                        onClick={() => setShowLogoutWarning(false)}
                        style={{
                            position: 'absolute', top: 6, right: 8,
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: 14, color: 'inherit', lineHeight: 1,
                        }}
                        aria-label="Dismiss"
                    >✕</button>
                    <strong>Shift in progress</strong><br />
                    Please <strong>Check Out</strong> first to logout.
                </div>
            )}

            {/* Bottom section: theme toggle + logout */}
            <div className="sidebar__bottom">
                <button className="sidebar__theme-btn" onClick={onToggleTheme} title="Toggle theme">
                    {theme === 'light' ? <MoonIcon /> : <SunIcon />}
                    {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
                </button>
                <button
                    id="btn-logout"
                    className="sidebar__logout"
                    onClick={handleLogoutClick}
                    title={shiftActive ? 'Complete or check out your shift before logging out' : 'Logout'}
                    style={shiftActive ? { opacity: 0.65, cursor: 'not-allowed' } : undefined}
                >
                    <LogoutIcon />
                    Logout
                </button>
            </div>
        </div>
    );
}
