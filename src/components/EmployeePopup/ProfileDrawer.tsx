import { useState, useEffect } from 'react';
import { getFullAvatarUrl } from './EmployeeHeader';
import { getLeaveBalance, type LeaveBalanceInfo } from '../../api';
import { API_BASE } from '../../config';

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
    userName: initialUserName,
    avatarUrl: initialAvatarUrl,
    email: initialEmail = 'employee@yoforex.net',
    teamName: initialTeamName = 'Operations Team',
    designation: initialDesignation = 'Employee',
    role: initialRole = 'Employee',
    idleThresholdSecs: initialIdleThresholdSecs = 60,
    expectedWorkSecs = 28800,
    onOpenLeave,
    onOpenCalendar,
}: ProfileDrawerProps) {
    const [leaveInfo, setLeaveInfo] = useState<LeaveBalanceInfo | null>(null);
    const [dynamicProfile, setDynamicProfile] = useState<{
        userName: string;
        avatarUrl?: string | null;
        email: string;
        teamName: string;
        role: string;
        designation: string;
        idleThresholdSecs: number;
    }>({
        userName: initialUserName,
        avatarUrl: initialAvatarUrl,
        email: initialEmail,
        teamName: initialTeamName,
        role: initialRole,
        designation: initialDesignation,
        idleThresholdSecs: initialIdleThresholdSecs,
    });

    useEffect(() => {
        if (!isOpen) return;

        // Sync fresh leave balance
        getLeaveBalance()
            .then(data => setLeaveInfo(data))
            .catch(() => {});

        // Fetch fresh dynamic profile from /auth/me
        const token = localStorage.getItem('wf_token');
        if (token) {
            fetch(`${API_BASE}/auth/me`, {
                headers: { Authorization: `Bearer ${token}` }
            })
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                    if (data?.user) {
                        const u = data.user;
                        const effRole = u.role || u.roleName || u.designation || 'Employee';
                        setDynamicProfile({
                            userName: u.name || initialUserName,
                            avatarUrl: u.avatarUrl ?? initialAvatarUrl,
                            email: u.email || initialEmail,
                            teamName: u.teamName || initialTeamName,
                            role: effRole,
                            designation: effRole,
                            idleThresholdSecs: u.idleThresholdSecs ?? initialIdleThresholdSecs,
                        });
                    }
                })
                .catch(() => {});
        }
    }, [isOpen, initialUserName, initialAvatarUrl, initialEmail, initialTeamName, initialRole, initialDesignation, initialIdleThresholdSecs]);

    const [uploadingAvatar, setUploadingAvatar] = useState(false);

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const token = localStorage.getItem('wf_token');
        if (!token) return;

        try {
            setUploadingAvatar(true);
            const formData = new FormData();
            formData.append('avatar', file);

            const res = await fetch(`${API_BASE}/auth/avatar`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                body: formData,
            });

            if (res.ok) {
                const data = await res.json();
                if (data.avatarUrl) {
                    setDynamicProfile(prev => ({
                        ...prev,
                        avatarUrl: data.avatarUrl,
                    }));
                    const saved = localStorage.getItem('wf_user');
                    if (saved) {
                        try {
                            const parsed = JSON.parse(saved);
                            parsed.avatarUrl = data.avatarUrl;
                            localStorage.setItem('wf_user', JSON.stringify(parsed));
                        } catch {}
                    }
                }
            }
        } catch (err) {
            console.error('Failed to upload avatar in Desktop', err);
        } finally {
            setUploadingAvatar(false);
        }
    };

    if (!isOpen) return null;

    const userName = dynamicProfile.userName || initialUserName;
    const avatarUrl = dynamicProfile.avatarUrl ?? initialAvatarUrl;
    const email = dynamicProfile.email || initialEmail;
    const teamName = dynamicProfile.teamName || initialTeamName;
    const role = dynamicProfile.role || initialRole;
    const designation = dynamicProfile.designation || initialDesignation;
    const idleThresholdSecs = dynamicProfile.idleThresholdSecs || initialIdleThresholdSecs;
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
                        <label
                            className="profile-avatar-large"
                            style={{ position: 'relative', cursor: 'pointer', display: 'inline-block' }}
                            title="Click to upload/change profile picture"
                        >
                            <input
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                disabled={uploadingAvatar}
                                onChange={handleAvatarUpload}
                            />
                            {fullAvatar ? (
                                <img src={fullAvatar} alt={userName} className="profile-img-lg" style={{ width: '64px', height: '64px', borderRadius: '16px', objectFit: 'cover' }} />
                            ) : (
                                <div className="profile-placeholder-lg">{userName.charAt(0).toUpperCase()}</div>
                            )}
                            <div
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    background: 'rgba(0,0,0,0.45)',
                                    borderRadius: '16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    opacity: uploadingAvatar ? 1 : 0,
                                    transition: 'opacity 0.2s ease',
                                }}
                                className="avatar-hover-overlay"
                            >
                                <span style={{ color: '#fff', fontSize: '10px', fontWeight: 700 }}>
                                    {uploadingAvatar ? '...' : 'Change'}
                                </span>
                            </div>
                        </label>
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
                                <div style={{ color: '#16a34a', fontWeight: 800, fontSize: '12px' }}>
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
                                <div style={{ color: '#2563eb', fontWeight: 800, fontSize: '12px' }}>
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
