import { Clock, Coffee, Sparkles } from 'lucide-react';
import { formatHumanDuration } from '../../hooks/useTimer';

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
    expectedBreakSecs,
}: TodaySummaryCardsProps) {
    const targetWork = expectedWorkSecs > 0 ? expectedWorkSecs : 8 * 3600;
    const targetBreak = expectedBreakSecs > 0 ? expectedBreakSecs : 3600;

    // Human readable text
    const humanWorked = formatHumanDuration(todayWorkedSecs, { showZeroHours: true });
    const targetWorkHuman = formatHumanDuration(targetWork);

    const humanBreak = formatHumanDuration(todayBreakSecs);
    const targetBreakHuman = formatHumanDuration(targetBreak);

    const remainingBreakSecs = Math.max(0, targetBreak - todayBreakSecs);
    const remainingBreakHuman = formatHumanDuration(remainingBreakSecs);

    const humanOvertime = formatHumanDuration(overtimeSecs, { showZeroHours: true });

    // Progress percentages
    const workPercent = Math.min(100, Math.round((todayWorkedSecs / targetWork) * 100));
    const breakPercent = Math.min(100, Math.round((todayBreakSecs / targetBreak) * 100));

    return (
        <div className="today-summary-section">
            <div className="summary-section-header">
                <span className="summary-title">TODAY'S SUMMARY</span>
                {workPercent >= 100 && (
                    <span className="target-reached-pill">Goal Met</span>
                )}
            </div>

            <div className="summary-grid-cards">
                {/* Worked Column */}
                <div className="summary-metric-card work-card">
                    <div className="metric-header">
                        <span className="metric-label">WORKED</span>
                        <Clock size={13} strokeWidth={2.2} className="metric-icon text-brand" />
                    </div>
                    <div className="metric-value">{humanWorked}</div>
                    <div className="metric-footer">Target {targetWorkHuman}</div>
                    <div className="metric-progress-track">
                        <div className="metric-progress-fill bg-blue" style={{ width: `${workPercent}%` }} />
                    </div>
                </div>

                {/* Break Column */}
                <div className="summary-metric-card break-card">
                    <div className="metric-header">
                        <span className="metric-label">BREAK</span>
                        <Coffee size={13} strokeWidth={2.2} className="metric-icon text-amber" />
                    </div>
                    <div className="metric-value">
                        {todayBreakSecs > 0 ? `${humanBreak} / ${targetBreakHuman}` : `0m / ${targetBreakHuman}`}
                    </div>
                    <div className="metric-footer">
                        {remainingBreakSecs > 0 ? `${remainingBreakHuman} left` : 'Break limit reached'}
                    </div>
                    <div className="metric-progress-track">
                        <div className="metric-progress-fill bg-amber" style={{ width: `${breakPercent}%` }} />
                    </div>
                </div>

                {/* Overtime Column */}
                <div className="summary-metric-card overtime-card">
                    <div className="metric-header">
                        <span className="metric-label">OVERTIME</span>
                        <Sparkles size={13} strokeWidth={2.2} className="metric-icon text-purple" />
                    </div>
                    <div className="metric-value">{humanOvertime}</div>
                    <div className="metric-footer">
                        {overtimeSecs > 0 ? 'Approved' : 'None today'}
                    </div>
                    <div className="metric-progress-track">
                        <div
                            className="metric-progress-fill bg-purple"
                            style={{ width: overtimeSecs > 0 ? '100%' : '0%' }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

