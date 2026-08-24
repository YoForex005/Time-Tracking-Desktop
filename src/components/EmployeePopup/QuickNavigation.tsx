
import { LayoutGrid, CalendarCheck, CalendarDays, CalendarRange, User } from 'lucide-react';

interface QuickNavigationProps {
    activeTab?: 'home' | 'attendance' | 'calendar' | 'leave' | 'profile';
    onOpenDashboard: () => void;
    onOpenAttendance: () => void;
    onOpenCalendar: () => void;
    onOpenLeave: () => void;
    onOpenProfile: () => void;
}

export default function QuickNavigation({
    activeTab = 'home',
    onOpenDashboard,
    onOpenAttendance,
    onOpenCalendar,
    onOpenLeave,
    onOpenProfile,
}: QuickNavigationProps) {
    return (
        <nav className="quick-navigation-bar">
            {/* 1. Home Dashboard */}
            <button
                type="button"
                className={`nav-item-btn ${activeTab === 'home' ? 'active' : ''}`}
                onClick={onOpenDashboard}
                title="Home Dashboard"
            >
                <div className="nav-icon-wrap">
                    <LayoutGrid size={15} strokeWidth={2.2} />
                </div>
                <span className="nav-item-label">Home</span>
            </button>

            {/* 2. Attendance Portal (/attendance) */}
            <button
                type="button"
                className={`nav-item-btn ${activeTab === 'attendance' ? 'active' : ''}`}
                onClick={onOpenAttendance}
                title="View Attendance Records & Monthly Timesheet"
            >
                <div className="nav-icon-wrap">
                    <CalendarCheck size={15} strokeWidth={2.2} />
                </div>
                <span className="nav-item-label">Attendance</span>
            </button>

            {/* 3. Work Calendar & Holidays (/holiday) */}
            <button
                type="button"
                className={`nav-item-btn ${activeTab === 'calendar' ? 'active' : ''}`}
                onClick={onOpenCalendar}
                title="View Company Work Calendar & Holidays"
            >
                <div className="nav-icon-wrap">
                    <CalendarDays size={15} strokeWidth={2.2} />
                </div>
                <span className="nav-item-label">Calendar</span>
            </button>

            {/* 4. Leave Management */}
            <button
                type="button"
                className={`nav-item-btn ${activeTab === 'leave' ? 'active' : ''}`}
                onClick={onOpenLeave}
                title="View Leave Balance & Apply Leave"
            >
                <div className="nav-icon-wrap">
                    <CalendarRange size={15} strokeWidth={2.2} />
                </div>
                <span className="nav-item-label">Leave</span>
            </button>

            {/* 5. Employee Profile */}
            <button
                type="button"
                className={`nav-item-btn ${activeTab === 'profile' ? 'active' : ''}`}
                onClick={onOpenProfile}
                title="View Employee Profile"
            >
                <div className="nav-icon-wrap">
                    <User size={15} strokeWidth={2.2} />
                </div>
                <span className="nav-item-label">Profile</span>
            </button>
        </nav>
    );
}


