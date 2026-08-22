import { useState, useEffect, useCallback } from 'react';
import { formatDuration } from '../../hooks/useTimer';
import { submitBreakOverride, getMyBreakOverrideRequests } from '../../api';

interface BreakItem {
    id: string;
    startTime: string;
    endTime: string | null;
}

interface OverrideReq {
    id: string;
    breakId: string;
    reason: string;
    note: string | null;
    status: 'pending' | 'approved' | 'rejected';
    requestedAt: string;
    reviewNote: string | null;
}

interface ManageBreaksModalProps {
    isOpen: boolean;
    breaks: BreakItem[];
    onClose: () => void;
    currentBreakSecs?: number;
    totalBreakSecs?: number;
    expectedBreakSecs?: number;
    status: 'stopped' | 'working' | 'on_break';
}

export default function ManageBreaksModal({
    isOpen,
    breaks,
    onClose,
    currentBreakSecs = 0,
    totalBreakSecs = 0,
    expectedBreakSecs = 1800,
    status,
}: ManageBreaksModalProps) {
    const [overrideRequests, setOverrideRequests] = useState<OverrideReq[]>([]);
    const [loading, setLoading] = useState(true);
    const [claimingBreakId, setClaimingBreakId] = useState<string | null>(null);
    const [claimReason, setClaimReason] = useState<string>('meeting');
    const [claimNote, setClaimNote] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

    const loadRequests = useCallback(async () => {
        try {
            setLoading(true);
            const data = await getMyBreakOverrideRequests();
            if (data?.requests) {
                setOverrideRequests(data.requests as OverrideReq[]);
            }
        } catch (err) {
            console.error('[ManageBreaksModal] Failed to load override requests:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            loadRequests();
        }
    }, [isOpen, loadRequests]);

    if (!isOpen) return null;

    const handleSubmitClaim = async (breakId: string) => {
        try {
            setSubmitting(true);
            setSubmitError(null);
            const res = await submitBreakOverride(breakId, claimReason, claimNote);
            if (res?.isAutoApproved || res?.overrideRequest?.status === 'approved') {
                setSubmitSuccess('Break claim auto-approved and credited to work time!');
            } else {
                setSubmitSuccess('Break claim submitted for review!');
            }
            setClaimingBreakId(null);
            setClaimNote('');
            await loadRequests();
            setTimeout(() => setSubmitSuccess(null), 3500);
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : 'Failed to submit claim');
        } finally {
            setSubmitting(false);
        }
    };

    const completedBreaks = breaks.filter(b => b.endTime);
    const availableBreakSecs = Math.max(0, expectedBreakSecs - totalBreakSecs);

    return (
        <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(6px)', zIndex: 1100 }}>
            <div className="modal breaks-modal-container">
                {/* Header */}
                <div className="modal-header-row">
                    <div className="modal-title-wrap">
                        <h2 className="modal-heading">Break Management</h2>
                        <span className="modal-subheading">Track sessions & claim work credits</span>
                    </div>
                    <button className="modal-close-btn" onClick={onClose}>✕</button>
                </div>

                {/* Status Cards */}
                <div className="break-stats-grid">
                    {status === 'on_break' && (
                        <div className="break-stat-card active-break">
                            <span className="stat-label">Current Break</span>
                            <strong className="stat-val text-amber">{formatDuration(currentBreakSecs)}</strong>
                        </div>
                    )}
                    <div className="break-stat-card">
                        <span className="stat-label">Total Break Taken</span>
                        <strong className="stat-val">{formatDuration(totalBreakSecs)}</strong>
                    </div>
                    <div className="break-stat-card">
                        <span className="stat-label">Available Break Quota</span>
                        <strong className="stat-val text-emerald">{formatDuration(availableBreakSecs)}</strong>
                    </div>
                </div>

                {submitSuccess && (
                    <div className="break-alert-success">
                        ✓ {submitSuccess}
                    </div>
                )}

                {submitError && (
                    <div className="break-alert-error">
                        ⚠️ {submitError}
                    </div>
                )}

                {/* History Section */}
                <div className="break-history-header">
                    <span>TODAY'S BREAK SESSIONS</span>
                </div>

                <div className="break-history-list">
                    {loading ? (
                        <div className="break-empty-msg">Loading break history...</div>
                    ) : completedBreaks.length === 0 ? (
                        <div className="break-empty-box">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="empty-icon">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            <p className="empty-title">No completed breaks today</p>
                            <p className="empty-desc">Breaks taken during your shift will appear here.</p>
                        </div>
                    ) : (
                        completedBreaks.map((b, idx) => {
                            const sTime = new Date(b.startTime);
                            const eTime = b.endTime ? new Date(b.endTime) : new Date();
                            const durSecs = Math.max(0, Math.floor((eTime.getTime() - sTime.getTime()) / 1000));
                            const req = overrideRequests.find(r => r.breakId === b.id);
                            const isClaimingThis = claimingBreakId === b.id;

                            return (
                                <div key={b.id || idx} className="break-session-row">
                                    <div className="break-row-top">
                                        <div className="break-info">
                                            <div className="break-idx-title">
                                                <span>Break #{idx + 1}</span>
                                                <span className="break-dur-pill">{formatDuration(durSecs)}</span>
                                            </div>
                                            <div className="break-time-range">
                                                {sTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} → {eTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>

                                        <div className="break-action-slot">
                                            {req ? (
                                                req.status === 'approved' ? (
                                                    <span className="badge-claim-status approved">✓ Approved</span>
                                                ) : req.status === 'pending' ? (
                                                    <span className="badge-claim-status pending">⏳ In Review</span>
                                                ) : (
                                                    <span className="badge-claim-status rejected">✕ Rejected</span>
                                                )
                                            ) : (
                                                <button
                                                    className={`btn-claim-break ${isClaimingThis ? 'active' : ''}`}
                                                    onClick={() => {
                                                        setClaimingBreakId(isClaimingThis ? null : b.id);
                                                        setSubmitError(null);
                                                    }}
                                                >
                                                    {isClaimingThis ? 'Cancel' : 'Claim Credit'}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Inline Claim Form */}
                                    {isClaimingThis && (
                                        <div className="claim-form-panel">
                                            <label className="form-field-label">Reason for Work Credit:</label>
                                            <select
                                                value={claimReason}
                                                onChange={e => setClaimReason(e.target.value)}
                                                className="claim-select-input"
                                            >
                                                <option value="meeting">Meeting during break</option>
                                                <option value="client_call">Client Call</option>
                                                <option value="urgent_issue">Urgent Issue / Task</option>
                                                <option value="manager_request">Manager Request</option>
                                                <option value="other">Other Work Reason</option>
                                            </select>

                                            <textarea
                                                placeholder="Optional note / explanation for review..."
                                                value={claimNote}
                                                onChange={e => setClaimNote(e.target.value)}
                                                rows={2}
                                                className="claim-textarea-input"
                                            />

                                            <div className="claim-btn-row">
                                                <button
                                                    className="btn-cancel-claim"
                                                    onClick={() => setClaimingBreakId(null)}
                                                    disabled={submitting}
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    className="btn-submit-claim"
                                                    onClick={() => handleSubmitClaim(b.id)}
                                                    disabled={submitting}
                                                >
                                                    {submitting ? 'Submitting...' : 'Submit Claim'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="modal-footer-row">
                    <button
                        className="btn-modal-link"
                        onClick={() => {
                            onClose();
                            window.electronAPI?.openDashboard?.();
                        }}
                    >
                        Open Web Attendance ↗
                    </button>
                    <button className="btn-modal-close" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
