
interface ClockInModalProps {
    isOpen: boolean;
    onSelect: (location: 'wfh' | 'office') => void;
    onCancel: () => void;
}

export default function ClockInModal({ isOpen, onSelect, onCancel }: ClockInModalProps) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(6px)', zIndex: 1100 }}>
            <div className="modal location-modal-container">
                <div className="modal-icon-badge">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                        <circle cx="12" cy="10" r="3" />
                    </svg>
                </div>

                <h2 className="modal-heading-center">Where are you working today?</h2>
                <p className="modal-subheading-center">Select your work location before starting your shift</p>

                <div className="location-options-grid">
                    <button
                        className="location-card-btn office-opt"
                        onClick={() => onSelect('office')}
                    >
                        <div className="location-card-icon">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                                <line x1="9" y1="22" x2="9" y2="22.01" />
                                <line x1="15" y1="22" x2="15" y2="22.01" />
                                <line x1="9" y1="6" x2="9" y2="6.01" />
                                <line x1="15" y1="6" x2="15" y2="6.01" />
                                <line x1="9" y1="10" x2="9" y2="10.01" />
                                <line x1="15" y1="10" x2="15" y2="10.01" />
                                <line x1="9" y1="14" x2="9" y2="14.01" />
                                <line x1="15" y1="14" x2="15" y2="14.01" />
                                <line x1="9" y1="18" x2="9" y2="18.01" />
                                <line x1="15" y1="18" x2="15" y2="18.01" />
                            </svg>
                        </div>
                        <div className="location-card-title">In Office</div>
                        <div className="location-card-desc">Working from company premises</div>
                    </button>

                    <button
                        className="location-card-btn wfh-opt"
                        onClick={() => onSelect('wfh')}
                    >
                        <div className="location-card-icon">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                <polyline points="9 22 9 12 15 12 15 22" />
                            </svg>
                        </div>
                        <div className="location-card-title">Work From Home</div>
                        <div className="location-card-desc">Remote working session</div>
                    </button>
                </div>

                <button className="btn-modal-cancel" onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </div>
    );
}
