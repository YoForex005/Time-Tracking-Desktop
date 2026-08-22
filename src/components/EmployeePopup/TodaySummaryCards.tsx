import { formatDuration } from '../../hooks/useTimer';

interface TodaySummaryCardsProps {
    todayWorkedSecs: number;
    todayBreakSecs: number;
    overtimeSecs: number;
    expectedWorkSecs: number;
    expectedBreakSecs: number;
    todayBreaksCount: number;
    maxBreaks: number;
}

export default function TodaySummaryCards({
    todayWorkedSecs,
    todayBreakSecs,
    overtimeSecs,
    expectedWorkSecs,
    todayBreaksCount,
    maxBreaks,
}: TodaySummaryCardsProps) {
    const formattedWorked = formatDuration(todayWorkedSecs);
    const formattedBreak = formatDuration(todayBreakSecs);
    const formattedOvertime = formatDuration(overtimeSecs);

    const formattedTargetWork = formatDuration(expectedWorkSecs || 8 * 3600);


    return (
        <div className="today-summary-section">
            <div className="summary-section-header">
                <span className="summary-title">TODAY'S SUMMARY</span>
            </div>

            <div className="summary-grid-cards">
                {/* Worked Column */}
                <div className="summary-metric-card work-card">
                    <div className="metric-header">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="metric-icon">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                        </svg>
                        <span className="metric-label">Worked</span>
                    </div>
                    <div className="metric-value">{formattedWorked}</div>
                    <div className="metric-footer">Target: {formattedTargetWork}</div>
                </div>

                {/* Break Column */}
                <div className="summary-metric-card break-card">
                    <div className="metric-header">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="metric-icon">
                            <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                            <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                            <line x1="6" y1="1" x2="6" y2="4" />
                            <line x1="10" y1="1" x2="10" y2="4" />
                            <line x1="14" y1="1" x2="14" y2="4" />
                        </svg>
                        <span className="metric-label">Break</span>
                    </div>
                    <div className="metric-value">{formattedBreak}</div>
                    <div className="metric-footer">
                        {todayBreaksCount} of {maxBreaks} used
                    </div>
                </div>

                {/* Overtime Column */}
                <div className="summary-metric-card overtime-card">
                    <div className="metric-header">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="metric-icon">
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                        <span className="metric-label">Overtime</span>
                    </div>
                    <div className="metric-value">{formattedOvertime}</div>
                    <div className="metric-footer">{overtimeSecs > 0 ? 'Approved' : '0m logged'}</div>
                </div>
            </div>
        </div>
    );
}
