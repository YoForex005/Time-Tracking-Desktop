import { Coffee, LogOut, Play, SlidersHorizontal } from 'lucide-react';

interface ActionButtonsProps {
    status: 'stopped' | 'working' | 'on_break';
    actionLoading: boolean;
    breakLimitReached: boolean;
    proceedingStop: boolean;
    remainingBreakSecs?: number;
    onClockIn: () => void;
    onTakeBreak: () => void;
    onResumeBreak: () => void;
    onClockOut: () => void;
    onManageBreaks: () => void;
    hasCompletedTodayShift?: boolean;
}

export default function ActionButtons({
    status,
    actionLoading,
    breakLimitReached,
    proceedingStop,
    onClockIn,
    onTakeBreak,
    onResumeBreak,
    onClockOut,
    onManageBreaks,
    hasCompletedTodayShift = false,
}: ActionButtonsProps) {
    if (status === 'stopped') {
        return (
            <div className="action-control-group stopped-actions">
                <button
                    className="btn-primary-action clock-in-btn"
                    onClick={onClockIn}
                    disabled={actionLoading}
                >
                    <Play size={16} strokeWidth={2.5} fill="currentColor" />
                    <span>{hasCompletedTodayShift ? 'Clock In Again' : 'Clock In Workday'}</span>
                </button>
            </div>
        );
    }

    if (status === 'on_break') {
        return (
            <div className="action-control-group on-break-actions">
                <div className="flex-buttons-group">
                    <button
                        className="btn-action btn-emerald-primary"
                        onClick={onResumeBreak}
                        disabled={actionLoading}
                    >
                        <Play size={15} strokeWidth={2.5} fill="currentColor" />
                        <span>Resume Work</span>
                    </button>

                    <button
                        className="btn-action btn-purple-outline"
                        onClick={onClockOut}
                        disabled={actionLoading || proceedingStop}
                    >
                        <LogOut size={14} strokeWidth={2.2} />
                        <span>Clock Out</span>
                    </button>
                </div>

                <div className="tertiary-action-row">
                    <button
                        type="button"
                        className="btn-tertiary-manage-breaks"
                        onClick={onManageBreaks}
                    >
                        <SlidersHorizontal size={12} strokeWidth={2} />
                        <span>View & Claim Break Credits</span>
                    </button>
                </div>
            </div>
        );
    }

    // WORKING state: Full-width 50/50 Take a Break + Clock Out
    return (
        <div className="action-control-group working-actions">
            <div className="flex-buttons-group">
                <button
                    className="btn-action btn-orange-primary"
                    onClick={onTakeBreak}
                    disabled={actionLoading || breakLimitReached}
                    title={breakLimitReached ? 'Maximum daily break count reached' : 'Take a rest break'}
                >
                    <Coffee size={15} strokeWidth={2.2} />
                    <span>{breakLimitReached ? 'Max Breaks' : 'Take a Break'}</span>
                </button>

                <button
                    className="btn-action btn-outline-action"
                    onClick={onClockOut}
                    disabled={actionLoading || proceedingStop}
                >
                    <LogOut size={14} strokeWidth={2.2} />
                    <span>Clock Out</span>
                </button>
            </div>

            <div className="tertiary-action-row">
                <button
                    type="button"
                    className="btn-tertiary-manage-breaks"
                    onClick={onManageBreaks}
                >
                    <SlidersHorizontal size={12} strokeWidth={2} />
                    <span>View & Claim Break Credits</span>
                </button>
            </div>
        </div>
    );
}
