import { useTimer, formatDuration } from '../hooks/useTimer';
import type { HistoryShift } from '../hooks/useTimer';

function StatusBadge({ status }: { status: string }) {
    const labels: Record<string, string> = { stopped: 'Not Clocked In', working: 'Working', on_break: 'On Break' };
    return (
        <span className={`status-badge ${status}`}>
            <span className="dot" />
            {labels[status] ?? status}
        </span>
    );
}

function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function calcNetDuration(shift: HistoryShift): number {
    const endMs = shift.endTime ? new Date(shift.endTime).getTime() : Date.now();
    const total = Math.floor((endMs - new Date(shift.startTime).getTime()) / 1000);
    const breakSecs = shift.breaks.reduce((acc, b) => {
        const breakEnd = b.endTime ? new Date(b.endTime).getTime() : Date.now();
        return acc + Math.floor((breakEnd - new Date(b.startTime).getTime()) / 1000);
    }, 0);
    return Math.max(0, total - breakSecs);
}

/** SVG donut chart: green = work, amber = break */
function DonutChart({ workedSecs, breakSecs }: { workedSecs: number; breakSecs: number }) {
    const total = workedSecs + breakSecs;
    const r = 52;
    const cx = 70, cy = 70;
    const circumference = 2 * Math.PI * r;

    if (total === 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <svg width="140" height="140" viewBox="0 0 140 140">
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="18" />
                    <text x={cx} y={cy - 6} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="11" fontWeight="500">No data</text>
                    <text x={cx} y={cy + 12} textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="10">Check in first</text>
                </svg>
            </div>
        );
    }

    const workRatio = workedSecs / total;
    const breakRatio = breakSecs / total;
    const workDash = workRatio * circumference;
    const breakDash = breakRatio * circumference;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <svg width="140" height="140" viewBox="0 0 140 140">
                {/* Background track */}
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="18" />
                {/* Work arc */}
                <circle
                    cx={cx} cy={cy} r={r} fill="none"
                    stroke="#22c55e" strokeWidth="18"
                    strokeDasharray={`${workDash} ${circumference}`}
                    strokeDashoffset={0}
                    transform={`rotate(-90 ${cx} ${cy})`}
                    strokeLinecap="butt"
                />
                {/* Break arc */}
                {breakDash > 0 && (
                    <circle
                        cx={cx} cy={cy} r={r} fill="none"
                        stroke="#f59e0b" strokeWidth="18"
                        strokeDasharray={`${breakDash} ${circumference}`}
                        strokeDashoffset={-workDash}
                        transform={`rotate(-90 ${cx} ${cy})`}
                        strokeLinecap="butt"
                    />
                )}
                {/* Center label */}
                <text x={cx} y={cy - 7} textAnchor="middle" fill="white" fontSize="15" fontWeight="700">
                    {Math.round(workRatio * 100)}%
                </text>
                <text x={cx} y={cy + 10} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="10">
                    work ratio
                </text>
            </svg>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#22c55e', display: 'inline-block' }} />
                    Work
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#f59e0b', display: 'inline-block' }} />
                    Break
                </span>
            </div>
        </div>
    );
}

interface DashboardProps {
    view: string;
}

export default function Dashboard({ view }: DashboardProps) {
    const {
        status, elapsedSecs, history, loading, actionLoading, error,
        handleStart, handleBreak, handleStop,
        todayWorked, todayBreakSecs, todayBreaksCount,
    } = useTimer();

    if (loading) {
        return (
            <div className="main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
            </div>
        );
    }

    return (
        <div className="main">
            {view === 'tracker' && (
                <>
                    <div className="page-header">
                        <h1>Time Tracker</h1>
                        <p>Track your working hours and breaks</p>
                    </div>

                    {/* Stats row + Chart */}
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                        {/* Stat cards (left column) */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div className="stats-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                {/* Today Worked */}
                                <div className="stat-card">
                                    <div className="stat-card__icon purple">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                                        </svg>
                                    </div>
                                    <div className="stat-card__label">Today Worked</div>
                                    <div className="stat-card__value">{formatDuration(todayWorked)}</div>
                                </div>
                                {/* Break Time */}
                                <div className="stat-card">
                                    <div className="stat-card__icon orange">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="8" y1="12" x2="16" y2="12" />
                                        </svg>
                                    </div>
                                    <div className="stat-card__label">Break Time</div>
                                    <div className="stat-card__value">{formatDuration(todayBreakSecs)}</div>
                                </div>
                                {/* Breaks Taken */}
                                <div className="stat-card">
                                    <div className="stat-card__icon green">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                                        </svg>
                                    </div>
                                    <div className="stat-card__label">Breaks Taken</div>
                                    <div className="stat-card__value">
                                        {todayBreaksCount}
                                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontWeight: 400, marginLeft: 4 }}>/ 10</span>
                                    </div>
                                </div>
                                {/* Remaining Breaks */}
                                <div className="stat-card">
                                    <div className="stat-card__icon" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                        </svg>
                                    </div>
                                    <div className="stat-card__label">Breaks Left</div>
                                    <div className="stat-card__value" style={{ color: todayBreaksCount >= 10 ? '#ef4444' : undefined }}>
                                        {Math.max(0, 10 - todayBreaksCount)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Donut pie chart (right) */}
                        <div className="stat-card" style={{ minWidth: 190, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 16px', gap: 8 }}>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Today's Ratio</div>
                            <DonutChart workedSecs={todayWorked} breakSecs={todayBreakSecs} />
                        </div>
                    </div>

                    {/* Timer Card */}
                    <div className="timer-card">
                        <StatusBadge status={status} />

                        <div className={`timer-display ${status}`} id="timer-display">
                            {formatDuration(elapsedSecs)}
                        </div>

                        <div className="timer-sub">
                            {status === 'stopped' && 'Click "Check In" to start your shift'}
                            {status === 'working' && 'Shift in progress — take a break or check out when done'}
                            {status === 'on_break' && 'Break in progress — resume when you\'re ready'}
                        </div>

                        {error && <div className="form-error" style={{ width: '100%', textAlign: 'center' }}>{error}</div>}

                        <div className="timer-actions">
                            <button
                                id="btn-check-in"
                                className="btn btn-success"
                                onClick={handleStart}
                                disabled={status !== 'stopped' || actionLoading}
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                                Check In
                            </button>

                            <button
                                id="btn-break"
                                className={`btn ${status === 'on_break' ? 'btn-primary' : 'btn-warning'}`}
                                onClick={handleBreak}
                                disabled={status === 'stopped' || actionLoading || (status !== 'on_break' && todayBreaksCount >= 10)}
                            >
                                {status === 'on_break' ? (
                                    <>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <polygon points="5 3 19 12 5 21 5 3" />
                                        </svg>
                                        Resume Work
                                    </>
                                ) : (
                                    <>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                                        </svg>
                                        Take Break {todayBreaksCount >= 10 ? '(Limit)' : ''}
                                    </>
                                )}
                            </button>

                            <button
                                id="btn-check-out"
                                className="btn btn-danger"
                                onClick={handleStop}
                                disabled={status === 'stopped' || actionLoading}
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                </svg>
                                Check Out
                            </button>
                        </div>
                    </div>
                </>
            )}

            {view === 'history' && (
                <>
                    <div className="page-header">
                        <h1>Shift History</h1>
                        <p>Your last 10 shifts and break records</p>
                    </div>
                    <div className="history-card">
                        <div className="history-card__header">
                            <span className="history-card__title">Recent Shifts</span>
                        </div>
                        {history.length === 0 ? (
                            <div className="empty-state">No shifts recorded yet. Check in to start tracking!</div>
                        ) : (
                            <table className="history-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Check In</th>
                                        <th>Check Out</th>
                                        <th>Breaks</th>
                                        <th>Net Worked</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map(shift => (
                                        <tr key={shift.id}>
                                            <td>{formatDate(shift.startTime)}</td>
                                            <td>{formatTime(shift.startTime)}</td>
                                            <td>{shift.endTime ? formatTime(shift.endTime) : '—'}</td>
                                            <td>{shift.breaks.length} break{shift.breaks.length !== 1 ? 's' : ''}</td>
                                            <td>{formatDuration(calcNetDuration(shift))}</td>
                                            <td>
                                                {shift.endTime
                                                    ? <span className="badge completed">Completed</span>
                                                    : <span className="badge ongoing">● Ongoing</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
