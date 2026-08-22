
interface ActionButtonsProps {
    status: 'stopped' | 'working' | 'on_break';
    actionLoading: boolean;
    breakLimitReached: boolean;
    proceedingStop: boolean;
    onClockIn: () => void;
    onTakeBreak: () => void;
    onResumeBreak: () => void;
    onClockOut: () => void;
    onManageBreaks: () => void;
    hasCompletedTodayShift?: boolean;
}

export default function ActionButtons({
    status,
    actionLoading,
    breakLimitReached,
    proceedingStop,
    onClockIn,
    onTakeBreak,
    onResumeBreak,
    onClockOut,
    onManageBreaks,
    hasCompletedTodayShift = false,
}: ActionButtonsProps) {
    if (status === 'stopped') {
        return (
            <div className="action-control-group stopped-actions">
                <button
                    className="btn-primary-action clock-in-btn"
                    onClick={onClockIn}
                    disabled={actionLoading}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    <span>{hasCompletedTodayShift ? 'Clock In Again' : 'Clock In Workday'}</span>
                </button>
            </div>
        );
    }

    if (status === 'on_break') {
        return (
            <div className="action-control-group on-break-actions">
                <button
                    className="btn-primary-action resume-btn"
                    onClick={onResumeBreak}
                    disabled={actionLoading}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    <span>Resume Work</span>
                </button>

                <button
                    className="btn-secondary-action manage-breaks-btn"
                    onClick={onManageBreaks}
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                    </svg>
                    <span>Manage Breaks</span>
                </button>
            </div>
        );
    }

    // WORKING state
    return (
        <div className="action-control-group working-actions">
            <div className="primary-action-row">
                <button
                    className="btn-action take-break-btn"
                    onClick={onTakeBreak}
                    disabled={actionLoading || breakLimitReached}
                    title={breakLimitReached ? 'Maximum daily break count reached' : 'Take a short break'}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                        <line x1="6" y1="1" x2="6" y2="4" />
                        <line x1="10" y1="1" x2="10" y2="4" />
                        <line x1="14" y1="1" x2="14" y2="4" />
                    </svg>
                    <span>{breakLimitReached ? 'Max Breaks' : 'Take Break'}</span>
                </button>

                <button
                    className="btn-action clock-out-btn"
                    onClick={onClockOut}
                    disabled={actionLoading || proceedingStop}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    <span>Clock Out</span>
                </button>
            </div>

            <button
                className="btn-tertiary-manage-breaks"
                onClick={onManageBreaks}
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                </svg>
                <span>View & Claim Break Credits</span>
            </button>
        </div>
    );
}
