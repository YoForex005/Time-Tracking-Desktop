import { useState, useEffect, useRef, useCallback } from 'react';
import { useTimer } from '../hooks/useTimer';
import { useAppTracker } from '../hooks/useAppTracker';
import { useOvertimePrompt } from '../components/OvertimePromptProvider';

import EmployeeHeader from '../components/EmployeePopup/EmployeeHeader';
import WorkStatusHero from '../components/EmployeePopup/WorkStatusHero';
import TodaySummaryCards from '../components/EmployeePopup/TodaySummaryCards';
import ActionButtons from '../components/EmployeePopup/ActionButtons';
import QuickNavigation from '../components/EmployeePopup/QuickNavigation';
import ProfileDrawer from '../components/EmployeePopup/ProfileDrawer';
import LeaveSummaryModal from '../components/EmployeePopup/LeaveSummaryModal';
import ClockInModal from '../components/EmployeePopup/ClockInModal';
import CheckoutWarningModal from '../components/EmployeePopup/CheckoutWarningModal';
import ManageBreaksModal from '../components/EmployeePopup/ManageBreaksModal';
import CalendarModal from '../components/EmployeePopup/CalendarModal';
import { WEB_APP_URL } from '../config';





const OFFICE_WORK_TARGET_SECS = 8 * 60 * 60;
const OFFICE_BREAK_TARGET_SECS = 30 * 60;

interface DashboardProps {
    view: string;
    onLogout: () => void;
    userName?: string;
    avatarUrl?: string | null;
}

export default function Dashboard({ view: _view, onLogout, userName = 'Employee', avatarUrl }: DashboardProps) {
    const {
        status, loading, actionLoading, error,
        handleStart, handleBreak, handleStop, handleStartOvertime,
        todayWorked, todayBreakSecs, activeBreakStartTime, todayBreaksCount, todayIdleSecs,
        expectedWorkSecs, expectedBreakSecs, expectedActiveSecs, maxBreaks,
        breakReminderAfterSecs, breakReminderRepeatSecs,
        isOvertimeActive, overtimeSecs, overtimeStatus, overtimeAccepted,
        currentShiftId, workLocation,
        suspiciousActivityActive, suspiciousActivitySecs,
        breaks,
    } = useTimer();
    const { requestOvertimeConfirmation } = useOvertimePrompt();

    // Modals state
    const [showLocationModal, setShowLocationModal] = useState(false);
    const [showManageBreaksModal, setShowManageBreaksModal] = useState(false);
    const [showProfileDrawer, setShowProfileDrawer] = useState(false);
    const [showLeaveModal, setShowLeaveModal] = useState(false);
    const [showCalendarModal, setShowCalendarModal] = useState(false);


    // Checkout warning modal
    const [showWarning, setShowWarning] = useState(false);
    const [remainingSecs, setRemainingSecs] = useState(0);
    const [proceedingStop, setProceedingStop] = useState(false);

    const fallbackOvertimePromptedShiftRef = useRef<string | null>(null);

    // Break reminder modal / IPC
    const [showBreakReminder, setShowBreakReminder] = useState(false);
    const [nextBreakReminderAtSecs, setNextBreakReminderAtSecs] = useState<number | null>(null);
    const trackedBreakStartRef = useRef<string | null>(null);
    const statusRef = useRef(status);
    const showBreakReminderRef = useRef(showBreakReminder);
    const lastReminderTriggerAtRef = useRef(0);

    const currentBreakSecs = status === 'on_break' && activeBreakStartTime
        ? Math.max(0, Math.floor((Date.now() - new Date(activeBreakStartTime).getTime()) / 1000))
        : 0;

    const effectiveOfficeWorkTargetSecs = expectedWorkSecs > 0 ? expectedWorkSecs : OFFICE_WORK_TARGET_SECS;
    const effectiveOfficeBreakTargetSecs = expectedBreakSecs > 0 ? expectedBreakSecs : OFFICE_BREAK_TARGET_SECS;
    const breakLimitReached = status !== 'on_break' && todayBreaksCount >= maxBreaks;

    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    useEffect(() => {
        showBreakReminderRef.current = showBreakReminder;
    }, [showBreakReminder]);

    const showRendererBreakNotification = useCallback(async (breakSecs: number) => {
        if (!('Notification' in window)) return false;

        let permission = window.Notification.permission;
        if (permission === 'default') {
            permission = await window.Notification.requestPermission();
        }

        if (permission !== 'granted') {
            console.warn('[BreakReminder] Renderer notification permission:', permission);
            return false;
        }

        const iconUrl = new URL('icon.png', window.location.href).toString();
        const notification = new window.Notification('You are still on break', {
            body: `Your current break has been running for ${Math.floor(breakSecs / 60)} minutes.`,
            icon: iconUrl,
            silent: false,
        });
        notification.onclick = () => window.focus();
        return true;
    }, []);

    const triggerBreakReminder = useCallback((breakSecs: number, notifyNative: boolean) => {
        if (statusRef.current !== 'on_break') return;

        const now = Date.now();
        if (showBreakReminderRef.current && now - lastReminderTriggerAtRef.current < 1500) {
            return;
        }

        lastReminderTriggerAtRef.current = now;
        setShowBreakReminder(true);

        const api = window.electronAPI;
        api?.focusBreakReminder?.();
        window.requestAnimationFrame(() => {
            api?.focusBreakReminder?.();
        });

        if (notifyNative) {
            api?.showBreakReminder?.(breakSecs, true);
            void showRendererBreakNotification(breakSecs);
        }
    }, [showRendererBreakNotification]);

    useEffect(() => {
        const api = window.electronAPI;
        if (!api?.onShowBreakReminderModal) return;

        api.onShowBreakReminderModal?.((secs) => {
            triggerBreakReminder(secs, false);
        });

        return () => {
            api.removeShowBreakReminderModal?.();
        };
    }, [triggerBreakReminder]);

    useEffect(() => {
        if (status !== 'on_break' || !activeBreakStartTime) {
            trackedBreakStartRef.current = null;
            setShowBreakReminder(false);
            setNextBreakReminderAtSecs(null);
            lastReminderTriggerAtRef.current = 0;
            return;
        }

        if (trackedBreakStartRef.current !== activeBreakStartTime) {
            trackedBreakStartRef.current = activeBreakStartTime;
            setShowBreakReminder(false);
            setNextBreakReminderAtSecs(breakReminderAfterSecs);
        }
    }, [status, activeBreakStartTime, breakReminderAfterSecs]);

    useEffect(() => {
        if (
            status !== 'on_break' ||
            !activeBreakStartTime ||
            showBreakReminder ||
            nextBreakReminderAtSecs === null
        ) {
            return;
        }

        if (currentBreakSecs >= nextBreakReminderAtSecs) {
            triggerBreakReminder(currentBreakSecs, true);
        }
    }, [status, activeBreakStartTime, currentBreakSecs, nextBreakReminderAtSecs, showBreakReminder, triggerBreakReminder]);

    const dismissBreakReminder = () => {
        setShowBreakReminder(false);
        setNextBreakReminderAtSecs(currentBreakSecs + breakReminderRepeatSecs);
        window.electronAPI?.closeBreakReminderPopup?.();
    };

    const resumeFromBreakReminder = async () => {
        setShowBreakReminder(false);
        setNextBreakReminderAtSecs(null);
        window.electronAPI?.closeBreakReminderPopup?.();
        await handleBreak();
    };

    useEffect(() => {
        const api = window.electronAPI;
        if (!api?.onBreakReminderDismiss || !api?.onBreakReminderResume) return;

        api.onBreakReminderDismiss(() => {
            dismissBreakReminder();
        });
        api.onBreakReminderResume(() => {
            void resumeFromBreakReminder();
        });

        return () => {
            api.removeBreakReminderActionListeners?.();
        };
    }, [dismissBreakReminder, resumeFromBreakReminder]);

    const handleOvertimeDecision = useCallback(async (result: 'yes' | 'no') => {
        if (result === 'no') {
            return handleStop({ overtimeAccepted: false });
        }
        return handleStartOvertime();
    }, [handleStop, handleStartOvertime]);

    useEffect(() => {
        const api = window.electronAPI;
        if (!api?.onOvertimePromptNo || !api?.onOvertimePromptYes) return;

        api.onOvertimePromptNo(() => {
            void handleOvertimeDecision('no');
        });
        api.onOvertimePromptYes(() => {
            void handleOvertimeDecision('yes');
        });

        return () => {
            api.removeOvertimePromptListeners?.();
        };
    }, [handleOvertimeDecision]);

    useEffect(() => {
        if (!currentShiftId) {
            fallbackOvertimePromptedShiftRef.current = null;
        }
    }, [currentShiftId]);

    useEffect(() => {
        if (
            (status !== 'working' && status !== 'on_break') ||
            workLocation !== 'office' ||
            !currentShiftId ||
            isOvertimeActive ||
            overtimeStatus === 'active' ||
            typeof overtimeAccepted === 'boolean' ||
            fallbackOvertimePromptedShiftRef.current === currentShiftId ||
            todayWorked < effectiveOfficeWorkTargetSecs ||
            todayBreakSecs < effectiveOfficeBreakTargetSecs
        ) {
            return;
        }

        fallbackOvertimePromptedShiftRef.current = currentShiftId;
        setShowBreakReminder(false);
        setNextBreakReminderAtSecs(null);
        window.electronAPI?.closeBreakReminderPopup?.();

        const promptedShiftId = currentShiftId;
        void (async () => {
            const api = window.electronAPI;
            if (api?.showOvertimePrompt) {
                api.showOvertimePrompt(effectiveOfficeWorkTargetSecs, effectiveOfficeBreakTargetSecs);
                return;
            }
            await requestOvertimeConfirmation(handleOvertimeDecision);
        })().catch(() => {
            if (fallbackOvertimePromptedShiftRef.current === promptedShiftId) {
                fallbackOvertimePromptedShiftRef.current = null;
            }
        });
    }, [
        status,
        workLocation,
        currentShiftId,
        isOvertimeActive,
        overtimeStatus,
        overtimeAccepted,
        todayWorked,
        todayBreakSecs,
        effectiveOfficeWorkTargetSecs,
        effectiveOfficeBreakTargetSecs,
        requestOvertimeConfirmation,
        handleOvertimeDecision,
    ]);

    // Handle Clock In
    const handleClockInClick = () => setShowLocationModal(true);
    const handleLocationSelect = (location: 'wfh' | 'office') => {
        setShowLocationModal(false);
        handleStart(location);
    };

    // Handle Clock Out
    const handleCheckoutClick = () => {
        if (isOvertimeActive) {
            setShowWarning(false);
            void handleStop();
            return;
        }

        const activeSecs = Math.max(0, todayWorked - todayIdleSecs);
        const workShortfall = Math.max(0, expectedWorkSecs - todayWorked);
        const activeShortfall = Math.max(0, expectedActiveSecs - activeSecs);
        const maxShortfall = Math.max(workShortfall, activeShortfall);

        if (maxShortfall > 0) {
            setRemainingSecs(maxShortfall);
            setShowWarning(true);
        } else {
            handleStop();
        }
    };

    const confirmStop = async () => {
        setProceedingStop(true);
        setShowWarning(false);
        await handleStop();
        setProceedingStop(false);
    };

    // Background app tracking sync
    useAppTracker();

    if (loading) {
        return (
            <div className="control-center-container loading-wrapper">
                <div className="control-center-skeleton">
                    <div className="skeleton-row header-skel" />
                    <div className="skeleton-row hero-skel" />
                    <div className="skeleton-grid summary-skel" />
                    <div className="skeleton-row action-skel" />
                </div>
            </div>
        );
    }

    const liveTimerSecs = isOvertimeActive ? overtimeSecs : todayWorked;
    const hasCompletedTodayShift = status === 'stopped' && todayWorked > 0;

    const openWebPage = (path: string) => {
        const api = (window as any).electronAPI;
        if (api?.openExternalPage) {
            api.openExternalPage(path);
        } else if (api?.openDashboard) {
            api.openDashboard();
        } else {
            const targetUrl = `${WEB_APP_URL}${path.startsWith('/') ? '' : '/'}${path}`;
            window.open(targetUrl, '_blank');
        }
    };

    return (
        <div className="control-center-container">
            {/* Header / Identity Section */}
            <EmployeeHeader
                userName={userName}
                avatarUrl={avatarUrl}
                designation="Software Developer"
                teamName="YoForex Team"
                role="Employee"
                onOpenProfile={() => setShowProfileDrawer(true)}
                onOpenLeave={() => setShowLeaveModal(true)}
                onLogout={onLogout}
                canLogout={status === 'stopped'}
            />

            {/* Primary Work Status & Live Timer Section */}
            <WorkStatusHero
                status={status}
                liveTimerSecs={liveTimerSecs}
                isOvertimeActive={isOvertimeActive}
                workLocation={workLocation}
                suspiciousActivityActive={suspiciousActivityActive}
                suspiciousActivitySecs={suspiciousActivitySecs}
                error={error}
                hasCompletedTodayShift={hasCompletedTodayShift}
            />

            {/* Today Summary Metrics (Worked / Break / Overtime) */}
            <TodaySummaryCards
                todayWorkedSecs={todayWorked}
                todayBreakSecs={todayBreakSecs}
                overtimeSecs={overtimeSecs}
                expectedWorkSecs={effectiveOfficeWorkTargetSecs}
                expectedBreakSecs={effectiveOfficeBreakTargetSecs}
                todayBreaksCount={todayBreaksCount}
                maxBreaks={maxBreaks}
            />

            {/* Dynamic Primary & Contextual Action Buttons */}
            <ActionButtons
                status={status}
                actionLoading={actionLoading}
                breakLimitReached={breakLimitReached}
                proceedingStop={proceedingStop}
                onClockIn={handleClockInClick}
                onTakeBreak={handleBreak}
                onResumeBreak={handleBreak}
                onClockOut={handleCheckoutClick}
                onManageBreaks={() => setShowManageBreaksModal(true)}
                hasCompletedTodayShift={hasCompletedTodayShift}
            />

            {/* Quick Navigation Footer Row */}
            <QuickNavigation
                onOpenDashboard={() => openWebPage('/dashboard')}
                onOpenCalendar={() => setShowCalendarModal(true)}
                onOpenLeave={() => setShowLeaveModal(true)}
                onOpenProfile={() => setShowProfileDrawer(true)}
            />

            {/* Modals & Drawers */}
            <CalendarModal
                isOpen={showCalendarModal}
                onClose={() => setShowCalendarModal(false)}
                onOpenWebCalendar={() => openWebPage('/holiday')}
            />


            <ClockInModal
                isOpen={showLocationModal}
                onSelect={handleLocationSelect}
                onCancel={() => setShowLocationModal(false)}
            />

            <CheckoutWarningModal
                isOpen={showWarning}
                remainingSecs={remainingSecs}
                onProceed={confirmStop}
                onCancel={() => setShowWarning(false)}
            />

            <ManageBreaksModal
                isOpen={showManageBreaksModal}
                breaks={breaks}
                onClose={() => setShowManageBreaksModal(false)}
                currentBreakSecs={currentBreakSecs}
                totalBreakSecs={todayBreakSecs}
                expectedBreakSecs={effectiveOfficeBreakTargetSecs}
                status={status}
            />

            <ProfileDrawer
                isOpen={showProfileDrawer}
                onClose={() => setShowProfileDrawer(false)}
                userName={userName}
                avatarUrl={avatarUrl}
                email="employee@yoforex.net"
                teamName="YoForex Team"
                designation="Software Developer"
                role="Employee"
                expectedWorkSecs={effectiveOfficeWorkTargetSecs}
            />

            <LeaveSummaryModal
                isOpen={showLeaveModal}
                onClose={() => setShowLeaveModal(false)}
            />
        </div>
    );
}
