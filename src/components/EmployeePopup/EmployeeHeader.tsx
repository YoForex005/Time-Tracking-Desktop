import { useState, useRef, useEffect } from 'react';
import { User, Calendar, ExternalLink, LogOut, ChevronDown } from 'lucide-react';
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
    designation = 'Software Developer',
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
                    <span className="online-indicator-dot" title="Desktop Agent Online" />
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
                    className={`menu-chevron-btn ${menuOpen ? 'rotate-180' : ''}`}
                    aria-label="Toggle profile menu"
                    onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(!menuOpen);
                    }}
                >
                    <ChevronDown size={15} strokeWidth={2.2} />
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
                        <User size={15} strokeWidth={2} />
                        <span>My Profile</span>
                    </button>
                    <button
                        className="dropdown-item"
                        onClick={() => {
                            setMenuOpen(false);
                            onOpenLeave();
                        }}
                    >
                        <Calendar size={15} strokeWidth={2} />
                        <span>Leave Balance</span>
                    </button>
                    <button
                        className="dropdown-item"
                        onClick={() => {
                            setMenuOpen(false);
                            window.electronAPI?.openDashboard?.();
                        }}
                    >
                        <ExternalLink size={15} strokeWidth={2} />
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
                        <LogOut size={15} strokeWidth={2} />
                        <span>{canLogout ? 'Logout' : 'Logout (Clock out first)'}</span>
                    </button>
                </div>
            )}
        </header>
    );
}

