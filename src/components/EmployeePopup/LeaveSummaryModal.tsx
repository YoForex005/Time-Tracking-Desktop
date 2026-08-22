import { useState, useEffect } from 'react';
import { getLeaveBalance, type LeaveBalanceInfo } from '../../api';

interface LeaveSummaryModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function LeaveSummaryModal({ isOpen, onClose }: LeaveSummaryModalProps) {
    const [balance, setBalance] = useState<LeaveBalanceInfo | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        let isMounted = true;
        setLoading(true);
        setError(null);

        getLeaveBalance()
            .then(data => {
                if (isMounted) setBalance(data);
            })
            .catch(err => {
                if (isMounted) setError(err.message || 'Failed to load leave balance');
            })
            .finally(() => {
                if (isMounted) setLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(6px)', zIndex: 1100 }}>
            <div className="modal leave-modal-container">
                {/* Header */}
                <div className="modal-header-row">
                    <div className="modal-title-wrap">
                        <h2 className="modal-heading">Leave Balance & Quota</h2>
                        <span className="modal-subheading">Yearly & Monthly Allocation</span>
                    </div>
                    <button className="modal-close-btn" onClick={onClose}>✕</button>
                </div>

                <div className="leave-modal-body">
                    {loading ? (
                        <div className="modal-loading-state">
                            <div className="spinner" />
                            <span>Calculating leave balances...</span>
                        </div>
                    ) : error ? (
                        <div className="modal-error-box">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            <span>{error}</span>
                        </div>
                    ) : balance ? (
                        <>
                            {/* Key Highlight Metric */}
                            <div className="leave-hero-metric-card">
                                <div className="leave-hero-content">
                                    <div className="leave-hero-label">Available Balance</div>
                                    <div className="leave-hero-num">{balance.availableBalance} <span className="unit">Days</span></div>
                                    <div className="leave-hero-sub">Annual balance: {balance.yearlyBalance} days remaining</div>
                                </div>
                                <div className="leave-hero-icon-box">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                        <line x1="16" y1="2" x2="16" y2="6" />
                                        <line x1="8" y1="2" x2="8" y2="6" />
                                        <line x1="3" y1="10" x2="21" y2="10" />
                                    </svg>
                                </div>
                            </div>

                            {/* Breakdown Grid */}
                            <div className="leave-grid-breakdown">
                                <div className="leave-grid-item">
                                    <span className="leave-grid-label">Monthly Quota</span>
                                    <strong className="leave-grid-val">{balance.monthlyQuota} Day</strong>
                                </div>
                                <div className="leave-grid-item">
                                    <span className="leave-grid-label">Taken This Month</span>
                                    <strong className="leave-grid-val">{balance.monthlyLeavesTaken} Days</strong>
                                </div>
                                <div className="leave-grid-item">
                                    <span className="leave-grid-label">Earned Leaves</span>
                                    <strong className="leave-grid-val">{balance.earnedLeaves} Days</strong>
                                </div>
                                <div className="leave-grid-item">
                                    <span className="leave-grid-label">Total Leaves Taken</span>
                                    <strong className="leave-grid-val">{balance.leavesTaken} Days</strong>
                                </div>
                            </div>
                        </>
                    ) : null}
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
                        Apply for Leave in Web Portal ↗
                    </button>
                    <button className="btn-modal-close" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
