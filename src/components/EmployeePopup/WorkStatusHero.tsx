import { Building2, Home, LogIn, AlertCircle, Sparkles } from 'lucide-react';
import { formatDuration } from '../../hooks/useTimer';

interface WorkStatusHeroProps {
    status: 'stopped' | 'working' | 'on_break';
    liveTimerSecs: number;
    todayWorkedSecs?: number;
    shiftStartTime?: string | null;
    isOvertimeActive: boolean;
    workLocation?: string;
    suspiciousActivityActive?: boolean;
    suspiciousActivitySecs?: number;
    error?: string | null;
    hasCompletedTodayShift?: boolean;
}

export default function WorkStatusHero({
    status,
    liveTimerSecs,
    shiftStartTime,
    isOvertimeActive,
    workLocation = 'office',
    suspiciousActivityActive,
    suspiciousActivitySecs = 0,
    error,
    hasCompletedTodayShift = false,
}: WorkStatusHeroProps) {
    const formattedTime = formatDuration(liveTimerSecs);

    let statusPillClass = 'status-pill-stopped';
    let statusLabel = 'READY TO START';
    const locationName = workLocation === 'wfh' ? 'WFH' : 'Office';

    if (status === 'working') {
        if (isOvertimeActive) {
            statusPillClass = 'status-pill-overtime';
            statusLabel = 'OVERTIME';
        } else {
            statusPillClass = 'status-pill-working';
            statusLabel = `WORKING • ${locationName.toUpperCase()}`;
        }
    } else if (status === 'on_break') {
        statusPillClass = 'status-pill-break';
        statusLabel = 'ON BREAK';
    } else if (hasCompletedTodayShift) {
        statusPillClass = 'status-pill-completed';
        statusLabel = 'CLOCKED OUT';
    }

    // Format clock-in start time & date
    let formattedStartTime = '--:--';
    let formattedDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    if (shiftStartTime) {
        try {
            const startDate = new Date(shiftStartTime);
            if (!isNaN(startDate.getTime())) {
                let hours = startDate.getHours();
                const minutes = startDate.getMinutes();
                const ampm = hours >= 12 ? 'PM' : 'AM';
                hours = hours % 12 || 12;
                formattedStartTime = `${hours}:${String(minutes).padStart(2, '0')} ${ampm}`;
                formattedDate = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            }
        } catch {
            // Keep default
        }
    }

    return (
        <section className="work-status-hero-card">
            {/* Top Reference Header: Started at XX:XX | Status | Date */}
            <div className="hero-top-info-row">
                <div className="hero-start-time">
                    <span className="info-muted">Started at</span>
                    <strong className="info-bold font-mono">{formattedStartTime}</strong>
                </div>

                <div className="status-pill-container">
                    <div className={`status-pill ${statusPillClass}`}>
                        <span className="status-indicator-dot" />
                        <span className="status-text">{statusLabel}</span>
                    </div>
                </div>

                <div className="hero-date-text font-mono">
                    {formattedDate}
                </div>
            </div>

            {/* Main Timer Display (Deep Navy with 'h' suffix) */}
            <div className="timer-hero-display">
                <div className="timer-digits-wrapper">
                    <span className={`timer-digits ${status === 'working' ? 'working-digits' : status === 'on_break' ? 'break-digits' : 'stopped-digits'}`}>
                        {formattedTime}
                    </span>
                    <span className="timer-unit-h">h</span>
                </div>
            </div>

            {/* Location & Metadata Badges */}
            <div className="hero-metadata-row">
                {status !== 'stopped' && workLocation && (
                    <div className="location-pill">
                        {workLocation === 'wfh' ? (
                            <>
                                <Home size={12} strokeWidth={2.2} />
                                <span>Work From Home</span>
                            </>
                        ) : (
                            <>
                                <Building2 size={12} strokeWidth={2.2} />
                                <span>Main Office</span>
                            </>
                        )}
                    </div>
                )}

                {status !== 'stopped' && shiftStartTime && (
                    <div className="clockin-pill">
                        <LogIn size={12} strokeWidth={2.2} />
                        <span>Started {formattedStartTime}</span>
                    </div>
                )}

                {isOvertimeActive && (
                    <div className="overtime-pill">
                        <Sparkles size={12} strokeWidth={2.2} />
                        <span>Overtime Active</span>
                    </div>
                )}

                {/* Suspicious Activity Warning */}
                {status !== 'stopped' && suspiciousActivityActive && (
                    <div className="warning-pill suspicious-pill">
                        <AlertCircle size={12} strokeWidth={2.2} />
                        <span>Suspicious: {formatDuration(suspiciousActivitySecs)}</span>
                    </div>
                )}
            </div>

            {error && <div className="hero-inline-error">{error}</div>}
        </section>
    );
}


