
interface QuickNavigationProps {
    onOpenDashboard: () => void;
    onOpenCalendar: () => void;
    onOpenLeave: () => void;
    onOpenProfile: () => void;
}

export default function QuickNavigation({
    onOpenDashboard,
    onOpenCalendar,
    onOpenLeave,
    onOpenProfile,
}: QuickNavigationProps) {
    return (
        <nav className="quick-navigation-bar">
            <button
                type="button"
                className="nav-item-btn"
                onClick={onOpenDashboard}
                title="Open Web Dashboard"
            >
                <div className="nav-icon-wrap">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" />
                        <rect x="14" y="3" width="7" height="7" />
                        <rect x="14" y="14" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" />
                    </svg>
                </div>
                <span className="nav-item-label">Dashboard</span>
            </button>

            <button
                type="button"
                className="nav-item-btn"
                onClick={onOpenCalendar}
                title="View Work Calendar & Holidays"
            >
                <div className="nav-icon-wrap">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                </div>
                <span className="nav-item-label">Calendar</span>
            </button>

            <button
                type="button"
                className="nav-item-btn"
                onClick={onOpenLeave}
                title="View Leave Balance"
            >
                <div className="nav-icon-wrap">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                </div>
                <span className="nav-item-label">Leave</span>
            </button>


            <button
                type="button"
                className="nav-item-btn"
                onClick={onOpenProfile}
                title="View Employee Profile"
            >
                <div className="nav-icon-wrap">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                    </svg>
                </div>
                <span className="nav-item-label">Profile</span>
            </button>
        </nav>
    );
}
