import { formatDuration } from '../../hooks/useTimer';

interface WorkStatusHeroProps {
    status: 'stopped' | 'working' | 'on_break';
    liveTimerSecs: number;
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
    isOvertimeActive,
    workLocation,
    suspiciousActivityActive,
    suspiciousActivitySecs = 0,
    error,
    hasCompletedTodayShift = false,
}: WorkStatusHeroProps) {
    const formattedTime = formatDuration(liveTimerSecs);

    let statusPillClass = 'status-pill-stopped';
    let statusLabel = 'READY TO START';
    let statusDotColor = 'var(--text-muted)';
    let subTitle = 'Your workday has not started yet.';

    if (status === 'working') {
        if (isOvertimeActive) {
            statusPillClass = 'status-pill-overtime';
            statusLabel = 'OVERTIME IN PROGRESS';
            statusDotColor = '#ec4899';
            subTitle = 'Extra working hours logged';
        } else {
            statusPillClass = 'status-pill-working';
            statusLabel = 'WORKING';
            statusDotColor = 'var(--emerald, #10b981)';
            subTitle = "Today's active session";
        }
    } else if (status === 'on_break') {
        statusPillClass = 'status-pill-break';
        statusLabel = 'ON BREAK';
        statusDotColor = 'var(--amber, #f59e0b)';
        subTitle = 'Break time in progress. Take a rest!';
    } else if (hasCompletedTodayShift) {
        statusPillClass = 'status-pill-completed';
        statusLabel = 'CLOCKED OUT';
        statusDotColor = 'var(--emerald, #10b981)';
        subTitle = 'Shift completed. Good work today!';
    }

    return (
        <section className="work-status-hero-card">
            {/* Status Indicator Pill */}
            <div className="status-pill-container">
                <div className={`status-pill ${statusPillClass}`}>
                    <span className="status-indicator-dot" style={{ backgroundColor: statusDotColor }} />
                    <span className="status-text">{statusLabel}</span>
                </div>
            </div>

            {/* Main Timer Display */}
            <div className="timer-hero-display">
                <div className={`timer-digits ${status === 'working' ? 'working-digits' : status === 'on_break' ? 'break-digits' : 'stopped-digits'}`}>
                    {formattedTime}
                </div>
                <div className="timer-subtitle">{subTitle}</div>
            </div>

            {/* Location & Metadata Badges */}
            <div className="hero-metadata-row">
                {status !== 'stopped' && workLocation && (
                    <div className="location-pill">
                        {workLocation === 'wfh' ? (
                            <>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                    <polyline points="9 22 9 12 15 12 15 22" />
                                </svg>
                                <span>Work From Home</span>
                            </>
                        ) : (
                            <>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                                    <line x1="9" y1="22" x2="9" y2="22.01" />
                                    <line x1="15" y1="22" x2="15" y2="22.01" />
                                    <line x1="9" y1="6" x2="9" y2="6.01" />
                                    <line x1="15" y1="6" x2="15" y2="6.01" />
                                    <line x1="9" y1="10" x2="9" y2="10.01" />
                                    <line x1="15" y1="10" x2="15" y2="10.01" />
                                    <line x1="9" y1="14" x2="9" y2="14.01" />
                                    <line x1="15" y1="14" x2="15" y2="14.01" />
                                    <line x1="9" y1="18" x2="9" y2="18.01" />
                                    <line x1="15" y1="18" x2="15" y2="18.01" />
                                </svg>
                                <span>Office Location</span>
                            </>
                        )}
                    </div>
                )}

                {/* Suspicious Activity Warning */}
                {status !== 'stopped' && suspiciousActivityActive && (
                    <div className="warning-pill suspicious-pill">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        <span>Suspicious: {formatDuration(suspiciousActivitySecs)}</span>
                    </div>
                )}
            </div>

            {error && <div className="hero-inline-error">{error}</div>}
        </section>
    );
}
