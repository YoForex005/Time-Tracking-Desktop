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
        <div className="modal-overlay" style={{ background: 'rgba(255, 255, 255, 0.2)', backdropFilter: 'blur(8px)' }}>
            <div className="modal" style={{ background: 'rgba(255, 255, 255, 0.95)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 24px 64px -12px rgba(0,0,0,0.15)' }}>
                {/* Clock icon */}
                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: '28px',
                        background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
                        boxShadow: '0 8px 16px -4px rgba(251, 191, 36, 0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto',
                        fontSize: 26,
                    }}>
                        ⏱️
                    </div>
                </div>

                <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', textAlign: 'center', margin: '0 0 6px', letterSpacing: '-0.5px' }}>
                    Not enough work hours
                </h2>
                <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', margin: '0 0 20px', fontWeight: 500 }}>
                    You still need to work for
                </p>

                {/* Big remaining time display */}
                <div style={{
                    background: 'rgba(248, 250, 252, 0.5)',
                    border: '1px solid rgba(226, 232, 240, 0.8)',
                    borderRadius: 16,
                    padding: '20px 24px',
                    textAlign: 'center',
                    marginBottom: 24,
                }}>
                    <div style={{ fontSize: 40, fontWeight: 800, color: '#ef4444', letterSpacing: '-2px', fontVariantNumeric: 'tabular-nums', textShadow: '0 4px 16px rgba(239, 68, 68, 0.2)' }}>
                        {formatDuration(remainingSecs)}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
                        remaining today
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                    <button className="btn btn-ghost" onClick={onCancel} style={{ flex: 1, padding: '12px', background: '#f1f5f9', color: '#475569', border: 'none' }}>
                        Keep Working
                    </button>
                    <button className="btn btn-danger" onClick={onProceed} style={{ flex: 1, padding: '12px' }}>
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
        status, loading, actionLoading, error,
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
                <div className="spinner" />
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: 16, paddingTop: 8 }}>
                        <div style={{
                            fontSize: 18,
                            fontWeight: 800,
                            letterSpacing: '0.15em',
                            color: 'var(--text-secondary)',
                            textTransform: 'uppercase'
                        }}>
                            Yo HRMX
                        </div>
                    </div>

                    {/* Timer Control Card */}
                    <div className="timer-card">
                        {status === 'working' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
                                <img src="/cctv.gif" alt="CCTV" style={{ width: 50, height:50}} />
                                <span style={{ fontSize: 11, color: 'rgba(239, 68, 68, 0.85)', fontWeight: 600, letterSpacing: '0.02em', textShadow: '0 2px 4px rgba(239, 68, 68, 0.15)' }}>
                                    Your screen is under observation..
                                </span>
                            </div>
                        ) : (
                            <StatusBadge status={status} />
                        )}

                        <div className={`timer-display ${status}`} id="timer-display">
                            {formatDuration(todayWorked)}
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
                                style={{ whiteSpace: 'nowrap' }}
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                Check In
                            </button>

                            <button
                                id="btn-break"
                                className={`btn ${status === 'on_break' ? 'btn-primary' : 'btn-warning'}`}
                                onClick={handleBreak}
                                disabled={status === 'stopped' || actionLoading || (status !== 'on_break' && todayBreaksCount >= 10)}
                                style={{ whiteSpace: 'nowrap' }}
                            >
                                {status === 'on_break' ? (
                                    <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>Resume</>
                                ) : (
                                    <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>Break{todayBreaksCount >= 10 ? ' (Max)' : ''}</>
                                )}
                            </button>

                            <button
                                id="btn-check-out"
                                className="btn btn-danger"
                                onClick={handleCheckoutClick}
                                disabled={status === 'stopped' || actionLoading || proceedingStop}
                                style={{ whiteSpace: 'nowrap' }}
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /></svg>
                                Check Out
                            </button>
                        </div>
                    </div>

                    {/* View Dashboard & Logout (Beneath the timer) */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 16 }}>
                        <button
                            className="btn"
                            onClick={() => window.open('http://localhost:3000/dashboard', '_blank')}
                            style={{ flex: 1, padding: '10px', fontSize: 13, background: 'transparent', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                        >
                            View Dashboard
                        </button>
                        <button
                            className="btn btn-ghost"
                            onClick={onLogout}
                            disabled={status !== 'stopped'}
                            title={status !== 'stopped' ? 'Please check out before logging out' : 'Logout'}
                            style={{ flex: 1, padding: '10px', fontSize: 13, color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                        >
                            Logout
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
