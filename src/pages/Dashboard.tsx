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

import { useState } from 'react';
import { useTimer, formatDuration } from '../hooks/useTimer';
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

// ── CheckoutWarningModal ──────────────────────────────────────────────────

function CheckoutWarningModal({
    remainingSecs, onProceed, onCancel
}: {
    remainingSecs: number;
    onProceed: () => void;
    onCancel: () => void;
}) {
    return (
        <div className="modal-overlay">
            <div className="modal">
                {/* Clock icon */}
                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: '50%',
                        background: '#fff7ed',
                        border: '2px solid #fed7aa',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto',
                        fontSize: 26,
                    }}>
                        ⏱️
                    </div>
                </div>

                <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', textAlign: 'center', margin: '0 0 6px' }}>
                    Not enough work hours yet
                </h2>
                <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', margin: '0 0 20px' }}>
                    You still need to work for
                </p>

                {/* Big remaining time display */}
                <div style={{
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: 14,
                    padding: '16px 24px',
                    textAlign: 'center',
                    marginBottom: 20,
                }}>
                    <div style={{ fontSize: 36, fontWeight: 800, color: '#ef4444', letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums' }}>
                        {formatDuration(remainingSecs)}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        remaining today
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="modal__btn modal__btn--secondary" onClick={onCancel}>
                        Keep Working
                    </button>
                    <button className="modal__btn modal__btn--danger" onClick={onProceed}>
                        Check Out Anyway
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

interface DashboardProps {
    view: string;
    onLogout: () => void;
}

export default function Dashboard({ view, onLogout }: DashboardProps) {
    const {
        status, elapsedSecs, loading, actionLoading, error,
        handleStart, handleBreak, handleStop,
        todayWorked, todayBreakSecs: _todayBreakSecs, todayBreaksCount, todayIdleSecs,
        expectedWorkSecs, expectedActiveSecs, maxBreaks: _maxBreaks,
    } = useTimer();

    // Checkout warning modal
    const [showWarning, setShowWarning] = useState(false);
    const [remainingSecs, setRemainingSecs] = useState(0);
    const [proceedingStop, setProceedingStop] = useState(false);

    /** Called when user clicks "Check Out" button */
    const handleCheckoutClick = () => {
        const activeSecs = Math.max(0, todayWorked - todayIdleSecs);
        const workShortfall = Math.max(0, expectedWorkSecs - todayWorked);
        const activeShortfall = Math.max(0, expectedActiveSecs - activeSecs);
        const maxShortfall = Math.max(workShortfall, activeShortfall);

        if (maxShortfall > 0) {
            setRemainingSecs(maxShortfall);
            setShowWarning(true);
        } else {
            handleStop(); // All criteria met — proceed immediately
        }
    };

    const confirmStop = async () => {
        setProceedingStop(true);
        setShowWarning(false);
        await handleStop();
        setProceedingStop(false);
    };

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
            {/* Checkout warning modal */}
            {showWarning && (
                <CheckoutWarningModal
                    remainingSecs={remainingSecs}
                    onProceed={confirmStop}
                    onCancel={() => setShowWarning(false)}
                />
            )}

            {/* ── TRACKER VIEW ─────────────────────────────────────────────── */}
            {view === 'tracker' && (
                <>
                    {/* Yo HRMX Branding Header */}
                    <div style={{ textAlign: 'center', paddingBottom: 8, paddingTop: 4 }}>
                        <div style={{
                            fontSize: 22,
                            fontWeight: 800,
                            letterSpacing: '0.12em',
                            background: 'linear-gradient(135deg, var(--accent) 0%, #818cf8 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                        }}>
                            Yo HRMX
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
                                onClick={handleCheckoutClick}
                                disabled={status === 'stopped' || actionLoading || proceedingStop}
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                </svg>
                                Check Out
                            </button>
                        </div>
                    </div>

                    {/* Logout */}
                    <div style={{ textAlign: 'center', marginTop: -8 }}>
                        <button
                            id="btn-logout"
                            className="btn btn-ghost"
                            onClick={onLogout}
                            style={{ fontSize: 12, padding: '7px 20px', color: 'var(--text-muted)' }}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                <polyline points="16 17 21 12 16 7" />
                                <line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                            Logout
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
