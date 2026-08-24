import { useState, useEffect } from 'react';
import { CalendarDays, Palmtree } from 'lucide-react';
import { getFullAvatarUrl } from './EmployeeHeader';
import { getLeaveBalance, type LeaveBalanceInfo } from '../../api';

interface ProfileDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    userName: string;
    avatarUrl?: string | null;
    email?: string;
    teamName?: string;
    designation?: string;
    role?: string;
    idleThresholdSecs?: number;
    expectedWorkSecs?: number;
    onOpenLeave?: () => void;
    onOpenCalendar?: () => void;
}

export default function ProfileDrawer({
    isOpen,
    onClose,
    userName,
    avatarUrl,
    email = 'raj@yoforex.net',
    teamName = 'Engineering',
    designation = 'Software Developer',
    role = 'Employee',
    idleThresholdSecs = 60,
    expectedWorkSecs = 28800,
    onOpenLeave,
    onOpenCalendar,
}: ProfileDrawerProps) {
    const [leaveInfo, setLeaveInfo] = useState<LeaveBalanceInfo | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        getLeaveBalance()
            .then(data => setLeaveInfo(data))
            .catch(() => {});
    }, [isOpen]);

    if (!isOpen) return null;

    const fullAvatar = getFullAvatarUrl(avatarUrl);

    return (
        <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(6px)', zIndex: 1100 }}>
            <div className="modal profile-modal-container" style={{ maxWidth: '440px' }}>
                {/* Header */}
                <div className="modal-header-row">
                    <div className="modal-title-wrap">
                        <h2 className="modal-heading">Employee Profile</h2>
                        <span className="modal-subheading">Personal details & HR services</span>
                    </div>
                    <button className="modal-close-btn" onClick={onClose}>✕</button>
                </div>

                <div className="profile-modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
                    {/* Identity Hero */}
                    <div className="profile-identity-card">
                        <div className="profile-avatar-large">
                            {fullAvatar ? (
                                <img src={fullAvatar} alt={userName} className="profile-img-lg" />
                            ) : (
                                <div className="profile-placeholder-lg">{userName.charAt(0).toUpperCase()}</div>
                            )}
                        </div>
                        <div className="profile-identity-info">
                            <h3 className="profile-fullname">{userName}</h3>
                            <div className="profile-badge-role">{designation}</div>
                            <div className="profile-email-sub">{email}</div>
                        </div>
                    </div>

                    {/* ── QUICK HR SERVICES (LEAVES & CALENDAR) ── */}
                    <div className="profile-section-card">
                        <div className="profile-section-title">QUICK HR SERVICES</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                            {/* Leave Quota Button */}
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    onOpenLeave?.();
                                }}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'flex-start',
                                    padding: '10px 12px',
                                    borderRadius: '12px',
                                    background: '#f0fdf4',
                                    border: '1px solid #bbf7d0',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                }}
                                className="profile-service-btn"
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#16a34a', fontWeight: 800, fontSize: '12px' }}>
                                    <Palmtree size={15} />
                                    <span>Leaves & Quota</span>
                                </div>
                                <div style={{ fontSize: '10.5px', color: '#15803d', fontWeight: 600, marginTop: '3px' }}>
                                    {leaveInfo ? `${leaveInfo.availableBalance} Days Available` : '1.0 Day / Month'}
                                </div>
                            </button>

                            {/* Calendar Button */}
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    onOpenCalendar?.();
                                }}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'flex-start',
                                    padding: '10px 12px',
                                    borderRadius: '12px',
                                    background: '#eff6ff',
                                    border: '1px solid #bfdbfe',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                }}
                                className="profile-service-btn"
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2563eb', fontWeight: 800, fontSize: '12px' }}>
                                    <CalendarDays size={15} />
                                    <span>Holiday Calendar</span>
                                </div>
                                <div style={{ fontSize: '10.5px', color: '#1d4ed8', fontWeight: 600, marginTop: '3px' }}>
                                    View 2026 Holidays
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Employment Info */}
                    <div className="profile-section-card">
                        <div className="profile-section-title">EMPLOYMENT DETAILS</div>
                        <div className="profile-info-grid">
                            <div className="info-item">
                                <span className="info-label">Department / Team</span>
                                <strong className="info-value">{teamName}</strong>
                            </div>
                            <div className="info-item">
                                <span className="info-label">Role Access</span>
                                <strong className="info-value">{role}</strong>
                            </div>
                            <div className="info-item">
                                <span className="info-label">Standard Shift</span>
                                <strong className="info-value">{Math.round(expectedWorkSecs / 3600)} Hours / Day</strong>
                            </div>
                            <div className="info-item">
                                <span className="info-label">Idle Threshold</span>
                                <strong className="info-value">{idleThresholdSecs} seconds</strong>
                            </div>
                        </div>
                    </div>

                    {/* Permissions / Policy overview */}
                    <div className="profile-section-card">
                        <div className="profile-section-title">ROLE CAPABILITIES & PERMISSIONS</div>
                        <div className="permissions-badge-list">
                            <div className="perm-pill enabled">
                                <span className="perm-dot" /> Time Tracking & Clock In/Out
                            </div>
                            <div className="perm-pill enabled">
                                <span className="perm-dot" /> Break Management & Claims
                            </div>
                            <div className="perm-pill enabled">
                                <span className="perm-dot" /> Leave Requests & Balance
                            </div>
                            <div className="perm-pill enabled">
                                <span className="perm-dot" /> Personal Activity Insights
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
