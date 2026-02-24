interface SidebarProps {
    user: { name: string; email: string };
    activeView: string;
    onViewChange: (view: string) => void;
    onLogout: () => void;
}

function initial(name: string) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function Sidebar({ user, activeView, onViewChange, onLogout }: SidebarProps) {
    const navItems = [
        {
            id: 'tracker',
            label: 'Time Tracker',
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
            ),
        },
        {
            id: 'history',
            label: 'History',
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                </svg>
            ),
        },
    ];

    return (
        <div className="sidebar">
            <div className="sidebar__user">
                <div className="sidebar__avatar">{initial(user.name)}</div>
                <div className="sidebar__name">{user.name}</div>
                <div className="sidebar__email">{user.email}</div>
            </div>

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

            <button className="sidebar__logout" onClick={onLogout}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Logout
            </button>
        </div>
    );
}
