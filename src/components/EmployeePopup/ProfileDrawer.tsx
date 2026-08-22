import { getFullAvatarUrl } from './EmployeeHeader';

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
}: ProfileDrawerProps) {
    if (!isOpen) return null;

    const fullAvatar = getFullAvatarUrl(avatarUrl);

    return (
        <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(6px)', zIndex: 1100 }}>
            <div className="modal profile-modal-container">
                {/* Header */}
                <div className="modal-header-row">
                    <div className="modal-title-wrap">
                        <h2 className="modal-heading">Employee Profile</h2>
                        <span className="modal-subheading">Personal & Employment Details</span>
                    </div>
                    <button className="modal-close-btn" onClick={onClose}>✕</button>
                </div>

                <div className="profile-modal-body">
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

                {/* Footer */}
                <div className="modal-footer-row">
                    <button
                        className="btn-modal-link"
                        onClick={() => {
                            onClose();
                            window.electronAPI?.openDashboard?.();
                        }}
                    >
                        View Full Web Profile ↗
                    </button>
                    <button className="btn-modal-close" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
