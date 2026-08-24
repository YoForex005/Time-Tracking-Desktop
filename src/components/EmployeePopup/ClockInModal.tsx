
import { MapPin, Building2, Home } from 'lucide-react';

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
                    <MapPin size={24} strokeWidth={2.2} />
                </div>

                <h2 className="modal-heading-center">Where are you working today?</h2>
                <p className="modal-subheading-center">Select your work location before starting your shift</p>

                <div className="location-options-grid">
                    <button
                        className="location-card-btn office-opt"
                        onClick={() => onSelect('office')}
                    >
                        <div className="location-card-icon">
                            <Building2 size={28} strokeWidth={2} />
                        </div>
                        <div className="location-card-title">In Office</div>
                        <div className="location-card-desc">Working from company premises</div>
                    </button>

                    <button
                        className="location-card-btn wfh-opt"
                        onClick={() => onSelect('wfh')}
                    >
                        <div className="location-card-icon">
                            <Home size={28} strokeWidth={2} />
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

