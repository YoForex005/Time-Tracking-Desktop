/**
 * src/pages/Dashboard.tsx
 * ──────────────────────────────────────────────────────────
 * Minimalist Yo HRMX Employee Time Tracker
 * Matches the reference layout (Image 1):
 *   - Top Greeting Header (Good evening, Raj Halder + Avatar)
 *   - YO HRMX Branding
 *   - Central Hero Work Card (Pulsing clock icon, Live bold timer, Location pill, 3 action cards)
 *   - Bottom Utility Cards (View Dashboard, Logout)
 */

import { useState } from 'react';
import {
    Building2,
    ChevronRight,
    Clock,
    Coffee,
    Home,
    LayoutGrid,
    Lock,
    LogOut,
    Play,
    SlidersHorizontal,
} from 'lucide-react';

import { useTimer, formatDuration } from '../hooks/useTimer';
import { useAppTracker } from '../hooks/useAppTracker';
import { getFullAvatarUrl } from '../components/EmployeePopup/EmployeeHeader';
import { WEB_APP_URL } from '../config';

// Modals
import ClockInModal from '../components/EmployeePopup/ClockInModal';
import CheckoutWarningModal from '../components/EmployeePopup/CheckoutWarningModal';
import ManageBreaksModal from '../components/EmployeePopup/ManageBreaksModal';
import ProfileDrawer from '../components/EmployeePopup/ProfileDrawer';
import LeaveSummaryModal from '../components/EmployeePopup/LeaveSummaryModal';
import CalendarModal from '../components/EmployeePopup/CalendarModal';

const OFFICE_WORK_TARGET_SECS = 8 * 60 * 60;
const OFFICE_BREAK_TARGET_SECS = 30 * 60;

interface DashboardProps {
    view: string;
    onLogout: () => void;
    userName?: string;
    avatarUrl?: string | null;
    email?: string;
    role?: string;
    designation?: string;
    teamName?: string;
    idleThresholdSecs?: number;
}

export default function Dashboard({
    view: _view,
    onLogout,
    userName = 'Employee',
    avatarUrl,
    email = 'employee@yoforex.net',
    role = 'Employee',
    designation = 'Employee',
    teamName = 'YoForex Team',
    idleThresholdSecs = 60,
}: DashboardProps) {
    const {
        status,
        loading,
        actionLoading,
        handleStart,
        handleBreak,
        handleStop,
        todayWorked,
        todayBreakSecs,
        activeBreakStartTime,
        todayBreaksCount,
        maxBreaks,
        expectedWorkSecs,
        expectedBreakSecs,
        isOvertimeActive,
        overtimeSecs,
        workLocation,
        breaks,
    } = useTimer();

    // Modals state
    const [showLocationModal, setShowLocationModal] = useState(false);
    const [showManageBreaksModal, setShowManageBreaksModal] = useState(false);
    const [showProfileDrawer, setShowProfileDrawer] = useState(false);
    const [showLeaveModal, setShowLeaveModal] = useState(false);
    const [showCalendarModal, setShowCalendarModal] = useState(false);
    const [showWarning, setShowWarning] = useState(false);
    const [remainingSecs, setRemainingSecs] = useState(0);
    const [proceedingStop, setProceedingStop] = useState(false);

    // Background app tracking sync
    useAppTracker();

    const liveTimerSecs = isOvertimeActive ? overtimeSecs : todayWorked;
    const formattedTimer = formatDuration(liveTimerSecs);

    const effectiveOfficeWorkTargetSecs = expectedWorkSecs > 0 ? expectedWorkSecs : OFFICE_WORK_TARGET_SECS;
    const effectiveOfficeBreakTargetSecs = expectedBreakSecs > 0 ? expectedBreakSecs : OFFICE_BREAK_TARGET_SECS;
    const breakLimitReached = status !== 'on_break' && todayBreaksCount >= maxBreaks;

    const currentBreakSecs =
        status === 'on_break' && activeBreakStartTime
            ? Math.max(0, Math.floor((Date.now() - new Date(activeBreakStartTime).getTime()) / 1000))
            : 0;

    const openWebPage = (path: string) => {
        const api = (window as any).electronAPI;
        if (api?.openExternalPage) {
            api.openExternalPage(path);
        } else if (api?.openDashboard) {
            api.openDashboard();
        } else {
            const targetUrl = `${WEB_APP_URL}${path.startsWith('/') ? '' : '/'}${path}`;
            window.open(targetUrl, '_blank');
        }
    };

    const handleClockInClick = () => {
        setShowLocationModal(true);
    };

    const handleLocationSelect = async (location: 'office' | 'wfh') => {
        setShowLocationModal(false);
        await handleStart(location);
    };

    const handleCheckoutClick = () => {
        const workShortfall = Math.max(0, effectiveOfficeWorkTargetSecs - todayWorked);
        if (workShortfall > 0) {
            setRemainingSecs(workShortfall);
            setShowWarning(true);
        } else {
            handleStop();
        }
    };

    const confirmStop = async () => {
        setProceedingStop(true);
        setShowWarning(false);
        await handleStop();
        setProceedingStop(false);
    };

    // Greeting Calculation
    const hour = new Date().getHours();
    let greeting = 'Good morning';
    if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
    else if (hour >= 17) greeting = 'Good evening';

    const fullAvatar = getFullAvatarUrl(avatarUrl);

    if (loading) {
        return (
            <div className="tracker-view-wrapper" style={{ justifyContent: 'center', alignItems: 'center' }}>
                <div className="spinner" />
            </div>
        );
    }

    return (
        <div className="tracker-view-wrapper">
            <div>
                {/* ═════════════════════════════════════════════════════════════════ */}
                {/* 1. TOP GREETING & AVATAR ROW */}
                {/* ═════════════════════════════════════════════════════════════════ */}
                <div className="tracker-top-greeting-row">
                    <div>
                        <div className="tracker-greeting-title">
                            {greeting},{' '}
                            <span className="tracker-greeting-name">{userName}</span>
                        </div>
                        <div className="tracker-greeting-sub">
                            Have a productive day ahead!
                        </div>
                    </div>

                    {/* Avatar with Online Dot */}
                    <div
                        onClick={() => setShowProfileDrawer(true)}
                        className="tracker-avatar-wrap"
                        title="Click to view profile"
                    >
                        {fullAvatar ? (
                            <img src={fullAvatar} alt={userName} className="tracker-avatar-img" />
                        ) : (
                            <div className="tracker-avatar-fallback">
                                {userName.charAt(0).toUpperCase()}
                            </div>
                        )}
                        <span className="tracker-online-dot" />
                    </div>
                </div>

                {/* ═════════════════════════════════════════════════════════════════ */}
                {/* 2. CENTRAL HERO WORK CARD */}
                {/* ═════════════════════════════════════════════════════════════════ */}
                <div className="tracker-main-card">
                    {/* Glowing Circular Icon */}
                    <div className={`tracker-clock-icon-wrap ${
                        status === 'working'
                            ? 'tracker-clock-icon-working'
                            : status === 'on_break'
                            ? 'tracker-clock-icon-break'
                            : 'tracker-clock-icon-stopped'
                    }`}>
                        {status === 'on_break' ? (
                            <Coffee size={24} />
                        ) : (
                            <Clock size={24} />
                        )}
                    </div>

                    {/* Status Pill Badge */}
                    {status === 'working' ? (
                        <div className="tracker-status-pill tracker-pill-working">
                            <span className="online-indicator-dot" style={{ position: 'static', width: '6px', height: '6px' }} />
                            <span>{isOvertimeActive ? 'OVERTIME ACTIVE' : 'WORKING'}</span>
                        </div>
                    ) : status === 'on_break' ? (
                        <div className="tracker-status-pill tracker-pill-break">
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b' }} />
                            <span>ON BREAK</span>
                        </div>
                    ) : (
                        <div className="tracker-status-pill tracker-pill-stopped">
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#94a3b8' }} />
                            <span>READY TO START</span>
                        </div>
                    )}

                    {/* Bold Digital Live Timer */}
                    <div className="tracker-live-digits">
                        {formattedTimer}
                    </div>

                    {/* Subtitle Message */}
                    <div className="tracker-shift-msg">
                        {status === 'working'
                            ? 'Shift in progress. Stay productive!'
                            : status === 'on_break'
                            ? 'On rest break. Recharge yourself!'
                            : 'Shift not started. Ready to begin workday.'}
                    </div>

                    {/* Location Badge */}
                    {status !== 'stopped' && (
                        <div className="tracker-location-pill">
                            {workLocation === 'wfh' ? (
                                <>
                                    <Home size={13} />
                                    <span>Work From Home</span>
                                </>
                            ) : (
                                <>
                                    <Building2 size={13} />
                                    <span>Office Location</span>
                                </>
                            )}
                        </div>
                    )}

                    {/* ── 3 Action Cards (Working & Break States) ── */}
                    {status === 'working' && (
                        <div className="tracker-actions-grid">
                            {/* Card 1: Manage Breaks */}
                            <button
                                type="button"
                                onClick={() => setShowManageBreaksModal(true)}
                                className="tracker-action-card card-manage"
                            >
                                <div className="tracker-card-icon-wrap">
                                    <SlidersHorizontal size={16} />
                                </div>
                                <span className="tracker-card-title">Manage Breaks</span>
                                <span className="tracker-card-desc">View & claim</span>
                            </button>

                            {/* Card 2: Take Break */}
                            <button
                                type="button"
                                onClick={() => handleBreak()}
                                disabled={actionLoading || breakLimitReached}
                                className="tracker-action-card card-break"
                            >
                                <div className="tracker-card-icon-wrap">
                                    <Coffee size={16} />
                                </div>
                                <span className="tracker-card-title">
                                    {breakLimitReached ? 'Max Breaks' : 'Take Break'}
                                </span>
                                <span className="tracker-card-desc">Start rest break</span>
                            </button>

                            {/* Card 3: Clock Out */}
                            <button
                                type="button"
                                onClick={handleCheckoutClick}
                                disabled={actionLoading || proceedingStop}
                                className="tracker-action-card card-clockout"
                            >
                                <div className="tracker-card-icon-wrap">
                                    <LogOut size={16} />
                                </div>
                                <span className="tracker-card-title">Clock Out</span>
                                <span className="tracker-card-desc">End your shift</span>
                            </button>
                        </div>
                    )}

                    {status === 'on_break' && (
                        <div className="tracker-actions-grid">
                            {/* Card 1: Manage Breaks */}
                            <button
                                type="button"
                                onClick={() => setShowManageBreaksModal(true)}
                                className="tracker-action-card card-manage"
                            >
                                <div className="tracker-card-icon-wrap">
                                    <SlidersHorizontal size={16} />
                                </div>
                                <span className="tracker-card-title">Manage Breaks</span>
                                <span className="tracker-card-desc">View & claim</span>
                            </button>

                            {/* Card 2: Resume Work */}
                            <button
                                type="button"
                                onClick={() => handleBreak()}
                                disabled={actionLoading}
                                className="tracker-action-card card-resume"
                            >
                                <div className="tracker-card-icon-wrap">
                                    <Play size={16} fill="currentColor" />
                                </div>
                                <span className="tracker-card-title">Resume Work</span>
                                <span className="tracker-card-desc">Continue shift</span>
                            </button>

                            {/* Card 3: Clock Out */}
                            <button
                                type="button"
                                onClick={handleCheckoutClick}
                                disabled={actionLoading || proceedingStop}
                                className="tracker-action-card card-clockout"
                            >
                                <div className="tracker-card-icon-wrap">
                                    <LogOut size={16} />
                                </div>
                                <span className="tracker-card-title">Clock Out</span>
                                <span className="tracker-card-desc">End your shift</span>
                            </button>
                        </div>
                    )}

                    {status === 'stopped' && (
                        <div style={{ width: '100%', marginTop: '8px' }}>
                            <button
                                type="button"
                                onClick={handleClockInClick}
                                disabled={actionLoading}
                                className="tracker-clockin-full-btn"
                            >
                                <Play size={16} fill="currentColor" />
                                <span>Clock In Workday</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* ═════════════════════════════════════════════════════════════════ */}
                {/* 4. BOTTOM UTILITY CARDS ROW */}
                {/* ═════════════════════════════════════════════════════════════════ */}
                <div className="tracker-bottom-grid">
                    {/* View Dashboard Card */}
                    <button
                        type="button"
                        onClick={() => openWebPage('/dashboard')}
                        className="tracker-nav-card"
                    >
                        <div className="tracker-nav-left">
                            <div className="tracker-nav-icon icon-emerald-soft">
                                <LayoutGrid size={16} />
                            </div>
                            <div>
                                <div className="tracker-nav-title">View Dashboard</div>
                                <div className="tracker-nav-desc">Summary & stats</div>
                            </div>
                        </div>
                        <ChevronRight size={15} color="#94a3b8" />
                    </button>

                    {/* Logout Card */}
                    <button
                        type="button"
                        onClick={onLogout}
                        disabled={status !== 'stopped'}
                        className="tracker-nav-card"
                        title={status !== 'stopped' ? 'Please clock out before logging out' : 'Sign out of your account'}
                    >
                        <div className="tracker-nav-left">
                            <div className="tracker-nav-icon icon-slate-soft">
                                <LogOut size={16} />
                            </div>
                            <div>
                                <div className="tracker-nav-title">Logout</div>
                                <div className="tracker-nav-desc">
                                    {status === 'stopped' ? 'Sign out' : 'Clock out first'}
                                </div>
                            </div>
                        </div>
                        {status !== 'stopped' ? (
                            <Lock size={14} color="#cbd5e1" />
                        ) : (
                            <ChevronRight size={15} color="#94a3b8" />
                        )}
                    </button>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* MODALS */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <ClockInModal
                isOpen={showLocationModal}
                onSelect={handleLocationSelect}
                onCancel={() => setShowLocationModal(false)}
            />

            <CheckoutWarningModal
                isOpen={showWarning}
                remainingSecs={remainingSecs}
                onProceed={confirmStop}
                onCancel={() => setShowWarning(false)}
            />

            <ManageBreaksModal
                isOpen={showManageBreaksModal}
                breaks={breaks}
                onClose={() => setShowManageBreaksModal(false)}
                currentBreakSecs={currentBreakSecs}
                totalBreakSecs={todayBreakSecs}
                expectedBreakSecs={effectiveOfficeBreakTargetSecs}
                status={status}
            />

            <ProfileDrawer
                isOpen={showProfileDrawer}
                onClose={() => setShowProfileDrawer(false)}
                userName={userName}
                avatarUrl={avatarUrl}
                email={email}
                teamName={teamName}
                designation={role || designation || 'Employee'}
                role={role || designation || 'Employee'}
                idleThresholdSecs={idleThresholdSecs}
                expectedWorkSecs={effectiveOfficeWorkTargetSecs}
                onOpenLeave={() => setShowLeaveModal(true)}
                onOpenCalendar={() => setShowCalendarModal(true)}
            />

            <LeaveSummaryModal
                isOpen={showLeaveModal}
                onClose={() => setShowLeaveModal(false)}
            />

            <CalendarModal
                isOpen={showCalendarModal}
                onClose={() => setShowCalendarModal(false)}
                onOpenWebCalendar={() => openWebPage('/holiday')}
            />
        </div>
    );
}
