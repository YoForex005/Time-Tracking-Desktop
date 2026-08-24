import { AlertTriangle } from 'lucide-react';
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
                    <AlertTriangle size={24} strokeWidth={2.2} />
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
