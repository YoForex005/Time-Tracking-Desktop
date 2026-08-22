import { useState, useRef, useEffect } from 'react';
import { API_BASE } from '../../config';

interface EmployeeHeaderProps {
    userName: string;
    avatarUrl?: string | null;
    designation?: string;
    teamName?: string;
    role?: string;
    onOpenProfile: () => void;
    onOpenLeave: () => void;
    onLogout: () => void;
    canLogout: boolean;
}

export const getFullAvatarUrl = (avatarUrl?: string | null) => {
    if (!avatarUrl) return '';
    if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) return avatarUrl;
    const base = API_BASE.replace(/\/api$/, '');
    if (API_BASE.includes('localhost') || API_BASE.includes('127.0.0.1')) {
        return `${base}/public${avatarUrl.replace(/^\/public/, '')}`;
    }
    return `${base}${avatarUrl.startsWith('/') ? '' : '/'}${avatarUrl}`;
};

export default function EmployeeHeader({
    userName,
    avatarUrl,
    designation = 'Employee',
    teamName = 'YoForex Team',
    role = 'Employee',
    onOpenProfile,
    onOpenLeave,
    onLogout,
    canLogout,
}: EmployeeHeaderProps) {
    const [imgError, setImgError] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setImgError(false);
    }, [avatarUrl]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setMenuOpen(false);
            }
        };
        if (menuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [menuOpen]);

    const hour = new Date().getHours();
    let greeting = 'Good morning';
    if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
    else if (hour >= 17) greeting = 'Good evening';

    const fullAvatar = getFullAvatarUrl(avatarUrl);

    return (
        <header className="control-header">
            <div className="employee-id-card" onClick={() => setMenuOpen(!menuOpen)} role="button" tabIndex={0}>
                <div className="avatar-wrapper">
                    {fullAvatar && !imgError ? (
                        <img
                            src={fullAvatar}
                            alt={userName}
                            onError={() => setImgError(true)}
                            className="employee-avatar-img"
                        />
                    ) : (
                        <div className="employee-avatar-fallback">
                            {userName ? userName.charAt(0).toUpperCase() : 'U'}
                        </div>
                    )}
                    <span className="online-indicator-dot" title="Desktop Agent Connected" />
                </div>

                <div className="employee-meta">
                    <div className="employee-greeting-row">
                        <span className="greeting-text">{greeting},</span>{' '}
                        <strong className="employee-name">{userName}</strong>
                    </div>
                    <div className="employee-sub-meta">
                        <span className="designation-text">{designation}</span>
                        <span className="meta-bullet">•</span>
                        <span className="department-text">{teamName}</span>
                    </div>
                </div>

                <button 
                    type="button" 
                    className="menu-chevron-btn" 
                    aria-label="Toggle profile menu"
                    onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(!menuOpen);
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </button>
            </div>

            {/* Profile Dropdown Menu */}
            {menuOpen && (
                <div className="profile-dropdown-menu" ref={menuRef}>
                    <div className="dropdown-user-header">
                        <div className="dropdown-user-name">{userName}</div>
                        <div className="dropdown-user-role">{role} • {teamName}</div>
                    </div>
                    <div className="dropdown-divider" />
                    <button
                        className="dropdown-item"
                        onClick={() => {
                            setMenuOpen(false);
                            onOpenProfile();
                        }}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                        </svg>
                        <span>My Profile</span>
                    </button>
                    <button
                        className="dropdown-item"
                        onClick={() => {
                            setMenuOpen(false);
                            onOpenLeave();
                        }}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        <span>Leave Balance</span>
                    </button>
                    <button
                        className="dropdown-item"
                        onClick={() => {
                            setMenuOpen(false);
                            window.electronAPI?.openDashboard?.();
                        }}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="7" height="7" />
                            <rect x="14" y="3" width="7" height="7" />
                            <rect x="14" y="14" width="7" height="7" />
                            <rect x="3" y="14" width="7" height="7" />
                        </svg>
                        <span>Open Web Dashboard</span>
                    </button>
                    <div className="dropdown-divider" />
                    <button
                        className={`dropdown-item text-danger ${!canLogout ? 'disabled' : ''}`}
                        disabled={!canLogout}
                        title={!canLogout ? 'Please clock out before logging out' : 'Sign out'}
                        onClick={() => {
                            setMenuOpen(false);
                            onLogout();
                        }}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        <span>{canLogout ? 'Logout' : 'Logout (Clock out first)'}</span>
                    </button>
                </div>
            )}
        </header>
    );
}
