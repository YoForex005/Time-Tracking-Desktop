import { Coffee } from 'lucide-react';
import { calculateExpectedClockOut, formatDuration, formatHumanDuration } from '../../hooks/useTimer';

interface WorkdayInsightsProps {
    status: 'stopped' | 'working' | 'on_break';
    shiftStartTime?: string | null;
    todayWorkedSecs: number;
    todayBreakSecs?: number;
    expectedWorkSecs: number;
    expectedBreakSecs: number;
}

export default function WorkdayInsights({
    status,
    shiftStartTime,
    todayWorkedSecs,
    todayBreakSecs = 0,
    expectedWorkSecs = 8 * 3600,
    expectedBreakSecs = 3600,
}: WorkdayInsightsProps) {
    const { clockOutTime } = calculateExpectedClockOut(
        shiftStartTime,
        expectedWorkSecs,
        expectedBreakSecs
    );

    const formattedWorkedTime = formatDuration(todayWorkedSecs);
    const targetBreakHuman = formatHumanDuration(expectedBreakSecs);
    const breakUsedHuman = formatHumanDuration(todayBreakSecs);
    const breakRemainingSecs = Math.max(0, expectedBreakSecs - todayBreakSecs);
    const breakRemainingHuman = formatHumanDuration(breakRemainingSecs);

    let formattedClockIn = '--:--';
    if (shiftStartTime) {
        try {
            const startDate = new Date(shiftStartTime);
            if (!isNaN(startDate.getTime())) {
                let hours = startDate.getHours();
                const minutes = startDate.getMinutes();
                const ampm = hours >= 12 ? 'PM' : 'AM';
                hours = hours % 12 || 12;
                formattedClockIn = `${hours}:${String(minutes).padStart(2, '0')} ${ampm}`;
            }
        } catch {
            // fallback
        }
    }

    return (
        <div className="today-sessions-container">
            {/* Section Header: Today & Total time */}
            <div className="today-section-header-row">
                <span className="section-title-today">Today</span>
                <div className="total-time-header">
                    <span className="info-muted">Total time </span>
                    <strong className="total-time-val font-mono">{formattedWorkedTime} h</strong>
                </div>
            </div>

            {/* Session Card 1: Clock In -> Expected Out | Duration */}
            <div className="today-session-card current-session-card">
                <div className="session-times-col">
                    <div className="time-block">
                        <div className="time-block-label">Clock in</div>
                        <div className="time-block-val font-mono">{formattedClockIn}</div>
                    </div>

                    <div className="session-arrow-separator">→</div>

                    <div className="time-block">
                        <div className="time-block-label highlight-label">
                            {status === 'stopped' ? 'Clock out' : 'Expected out'}
                        </div>
                        <div className="time-block-val highlight-val font-mono">
                            {status === 'stopped' ? '17:04' : clockOutTime}
                        </div>
                    </div>
                </div>

                <div className="session-duration-col">
                    <div className="time-block-label">Session</div>
                    <div className="session-duration-val font-mono">{formattedWorkedTime} h</div>
                </div>
            </div>

            {/* Session Card 2: Break Session / Allowance */}
            <div className="today-session-card break-session-card">
                <div className="break-info-flex">
                    <div className="break-mini-icon">
                        <Coffee size={13} strokeWidth={2.2} />
                    </div>
                    <div>
                        <div className="time-block-label">Break used</div>
                        <div className="break-used-val font-mono">
                            {todayBreakSecs > 0 ? `${breakUsedHuman} / ${targetBreakHuman}` : `0m / ${targetBreakHuman}`}
                        </div>
                    </div>
                </div>

                <div className="break-badge-col">
                    <span className="break-remaining-pill">
                        {breakRemainingSecs > 0 ? `${breakRemainingHuman} left` : 'Break limit met'}
                    </span>
                </div>
            </div>
        </div>
    );
}

