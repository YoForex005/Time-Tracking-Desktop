/**
 * Dashboard.tsx — Main Application Dashboard
 * -----------------------------------------------
 * Renders two views controlled by the `view` prop:
 *   'tracker'  — Live timer, stat cards, and the Work/Break/Idle pie chart
 *   'history'  — Table of the user's last 10 shifts
 *
 * The DonutChart component accepts three segments:
 *   - Work  (green  #22c55e)
 *   - Break (amber  #f59e0b)
 *   - Idle  (slate  #6366f1)
 */

import { useTimer, formatDuration } from '../hooks/useTimer';
import type { HistoryShift } from '../hooks/useTimer';
import { useAppTracker } from '../hooks/useAppTracker';

// ── Sub-components ────────────────────────────────────────────────────────────

/** Displays the current shift status as a coloured badge */
function StatusBadge({ status }: { status: string }) {
    const labels: Record<string, string> = {
        stopped: 'Not Clocked In',
        working: 'Working',
        on_break: 'On Break',
    };
    return (
        <span className={`status-badge ${status}`}>
            <span className="dot" />
            {labels[status] ?? status}
        </span>
    );
}

/** Format an ISO timestamp as a short time string (e.g. "09:30 AM") */
function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Format an ISO timestamp as a short date string (e.g. "Feb 25") */
function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Calculate net worked seconds for a shift (total elapsed minus all break time) */
function calcNetDuration(shift: HistoryShift): number {
    const endMs = shift.endTime ? new Date(shift.endTime).getTime() : Date.now();
    const total = Math.floor((endMs - new Date(shift.startTime).getTime()) / 1000);
    const breakSecs = shift.breaks.reduce((acc, b) => {
        const breakEnd = b.endTime ? new Date(b.endTime).getTime() : Date.now();
        return acc + Math.floor((breakEnd - new Date(b.startTime).getTime()) / 1000);
    }, 0);
    return Math.max(0, total - breakSecs);
}

// ── DonutChart ────────────────────────────────────────────────────────────────

interface DonutChartProps {
    workedSecs: number; // green arc
    breakSecs: number;  // amber arc
    idleSecs: number;   // indigo arc
}

/**
 * SVG donut (pie) chart with three segments:
 *   Green  = productive work time
 *   Amber  = break time
 *   Indigo = idle time (no mouse/keyboard activity for >1 min during a shift)
 */
function DonutChart({ workedSecs, breakSecs, idleSecs }: DonutChartProps) {
    const total = workedSecs + breakSecs + idleSecs;
    const r = 52;
    const cx = 70, cy = 70;
    const circumference = 2 * Math.PI * r;

    // Empty state — no shift data yet
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

    // Calculate each segment's arc length as a fraction of the full circumference
    const workDash = (workedSecs / total) * circumference;
    const breakDash = (breakSecs / total) * circumference;
    const idleDash = (idleSecs / total) * circumference;

    // Each arc starts where the previous one ended (using strokeDashoffset)
    const workOffset = 0;
    const breakOffset = -workDash;
    const idleOffset = -(workDash + breakDash);

    const workPct = Math.round((workedSecs / total) * 100);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <svg width="140" height="140" viewBox="0 0 140 140">
                {/* Background track */}
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="18" />

                {/* Work arc — green */}
                <circle
                    cx={cx} cy={cy} r={r} fill="none"
                    stroke="#22c55e" strokeWidth="18"
                    strokeDasharray={`${workDash} ${circumference}`}
                    strokeDashoffset={workOffset}
                    transform={`rotate(-90 ${cx} ${cy})`}
                    strokeLinecap="butt"
                />

                {/* Break arc — amber */}
                {breakDash > 0 && (
                    <circle
                        cx={cx} cy={cy} r={r} fill="none"
                        stroke="#f59e0b" strokeWidth="18"
                        strokeDasharray={`${breakDash} ${circumference}`}
                        strokeDashoffset={breakOffset}
                        transform={`rotate(-90 ${cx} ${cy})`}
                        strokeLinecap="butt"
                    />
                )}

                {/* Idle arc — indigo */}
                {idleDash > 0 && (
                    <circle
                        cx={cx} cy={cy} r={r} fill="none"
                        stroke="#6366f1" strokeWidth="18"
                        strokeDasharray={`${idleDash} ${circumference}`}
                        strokeDashoffset={idleOffset}
                        transform={`rotate(-90 ${cx} ${cy})`}
                        strokeLinecap="butt"
                    />
                )}

                {/* Center label: work percentage */}
                <text x={cx} y={cy - 7} textAnchor="middle" fill="white" fontSize="15" fontWeight="700">
                    {workPct}%
                </text>
                <text x={cx} y={cy + 10} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="10">
                    work ratio
                </text>
            </svg>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'rgba(255,255,255,0.65)', flexWrap: 'wrap', justifyContent: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#22c55e', display: 'inline-block' }} />
                    Work
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#f59e0b', display: 'inline-block' }} />
                    Break
                </span>
                {idleSecs > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: '#6366f1', display: 'inline-block' }} />
                        Idle
                    </span>
                )}
            </div>
        </div>
    );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

interface DashboardProps {
    view: string;
}

export default function Dashboard({ view }: DashboardProps) {
    const {
        status, elapsedSecs, history, loading, actionLoading, error,
        handleStart, handleBreak, handleStop,
        todayWorked, todayBreakSecs, todayBreaksCount, todayIdleSecs,
    } = useTimer();

    // Initialize background app tracking sync
    useAppTracker();

    if (loading) {
        return (
            <div className="main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
            </div>
        );
    }

    return (
        <div className="main">

            {/* ── TRACKER VIEW ─────────────────────────────────────────────── */}
            {view === 'tracker' && (
                <>
                    <div className="page-header">
                        <h1>Time Tracker</h1>
                        <p>Track your working hours, breaks, and idle time</p>
                    </div>

                    {/* Stats row + Pie Chart */}
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

                        {/* Left: Stat Cards (2×3 grid) */}
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

                                {/* Idle Time — new stat card */}
                                <div className="stat-card">
                                    <div className="stat-card__icon" style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            {/* Moon / sleep icon representing idle */}
                                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                                        </svg>
                                    </div>
                                    <div className="stat-card__label">Idle Time</div>
                                    <div className="stat-card__value" style={{ color: todayIdleSecs > 0 ? '#818cf8' : undefined }}>
                                        {formatDuration(todayIdleSecs)}
                                    </div>
                                </div>

                            </div>
                        </div>

                        {/* Right: Donut Pie Chart (now includes idle segment) */}
                        <div
                            className="stat-card"
                            style={{ minWidth: 190, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 16px', gap: 8 }}
                        >
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                                Today's Ratio
                            </div>
                            <DonutChart
                                workedSecs={todayWorked}
                                breakSecs={todayBreakSecs}
                                idleSecs={todayIdleSecs}
                            />
                        </div>
                    </div>

                    {/* Timer Control Card */}
                    <div className="timer-card">
                        <StatusBadge status={status} />

                        <div className={`timer-display ${status}`} id="timer-display">
                            {formatDuration(elapsedSecs)}
                        </div>

                        <div className="timer-sub">
                            {status === 'stopped' && 'Click "Check In" to start your shift'}
                            {status === 'working' && 'Shift in progress — take a break or check out when done'}
                            {status === 'on_break' && "Break in progress — resume when you're ready"}
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

            {/* ── HISTORY VIEW ─────────────────────────────────────────────── */}
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
