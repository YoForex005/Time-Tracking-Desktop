import { formatDuration } from '../../hooks/useTimer';

interface CheckoutWarningModalProps {
    isOpen: boolean;
    remainingSecs: number;
    onProceed: () => void;
    onCancel: () => void;
}

export default function CheckoutWarningModal({
    isOpen,
    remainingSecs,
    onProceed,
    onCancel,
}: CheckoutWarningModalProps) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(6px)', zIndex: 1100 }}>
            <div className="modal warning-modal-container">
                <div className="modal-icon-badge warning-badge">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                </div>

                <h2 className="modal-heading-center">Shift Target Not Met</h2>
                <p className="modal-subheading-center">You still have remaining work hours to complete your shift target</p>

                <div className="time-shortfall-card">
                    <div className="time-shortfall-digits">{formatDuration(remainingSecs)}</div>
                    <div className="time-shortfall-label">Remaining Required Work Time</div>
                </div>

                <div className="modal-dual-action-row">
                    <button className="btn-modal-secondary" onClick={onCancel}>
                        Keep Working
                    </button>
                    <button className="btn-modal-danger" onClick={onProceed}>
                        Clock Out Anyway
                    </button>
                </div>
            </div>
        </div>
    );
}
