/**
 * useTimer.ts — Core Time Tracking Hook
 * -----------------------------------------------
 * Manages all timer state for the dashboard:
 *   - Shift status (stopped / working / on_break)
 *   - Current shift and break data from the backend
 *   - Computed stats: todayWorked, todayBreakSecs, todayBreaksCount, todayIdleSecs
 *   - Actions: handleStart, handleBreak, handleStop
 *
 * Idle Detection Integration:
 *   - Listens for 'idle-start' / 'idle-end' events from Electron main process
 *     (via window.electronAPI, injected by preload.js)
 *   - On idle-start → calls POST /api/time/idle/start with the real idle timestamp
 *   - On idle-end   → calls POST /api/time/idle/end
 *   - Periodically refreshes todayIdleSecs from the backend for the pie chart
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    getStatus, startShift, toggleBreak, stopShift, startOvertime, getHistory, sendHeartbeat,
    startIdleSession, endIdleSession, getTodayIdleSecs,
    subscribeToThresholdEvents, rolloverMidnight,
} from '../api';


// ── Types ─────────────────────────────────────────────────────────────────────

export type TimerStatus = 'stopped' | 'working' | 'on_break';

export interface HistoryShift {
    id: string;
    startTime: string;
    endTime: string | null;
    regularEndTime?: string | null;
    regularWorkSecs?: number | null;
    regularBreakSecs?: number | null;
    overtimeAccepted?: boolean | null;
    overtimeDecisionAt?: string | null;
    overtimeStartTime?: string | null;
    overtimeEndTime?: string | null;
    overtimeStatus?: 'none' | 'active' | 'completed' | string;
    checkoutType?: 'manual' | 'auto_shutdown' | 'midnight_rollover';
    checkoutReason?: string | null;
    graceAppliedSecs?: number;
    timeAdjustmentSecs?: number;
    workLocation?: string;
    breaks: Array<{ id: string; startTime: string; endTime: string | null }>;
}

// Extend the global Window type to include Electron's preload API
declare global {
    interface Window {
        electronAPI?: {
            // Window controls
            minimize: () => void;
            maximize: () => void;
            close: () => void;
            // Idle detection
            onIdleStart: (cb: (startTime: string) => void) => void;
            onIdleEnd: (cb: () => void) => void;
            removeIdleListeners: () => void;
            // Screen lock detection
            onScreenLocked: (cb: () => void) => void;
            onScreenUnlocked: (cb: () => void) => void;
            removeScreenListeners: () => void;
            // Sleep / Resume detection (SEPARATE from shutdown → clock-out)
            // Main.js calls the API directly; renderer just re-syncs UI.
            onSleepBreakStarted: (cb: () => void) => void;
            onSleepBreakEnded: (cb: (ok: boolean) => void) => void;
            removeSleepListeners: () => void;
            // Shift status sync to main process
            updateShiftStatus: (
                status: string,
                activeBreakStartTime: string | null,
                breakReminderAfterSecs: number,
                breakReminderRepeatSecs: number
            ) => void;
            // Break reminder modal
            onShowBreakReminderModal?: (cb: (breakSecs: number) => void) => void;
            showBreakReminder?: (breakSecs: number, focusWindow?: boolean) => void;
            focusBreakReminder?: () => void;
            closeBreakReminderPopup?: () => void;
            focusMainWindow?: () => void;
            onBreakReminderDismiss?: (cb: () => void) => void;
            onBreakReminderResume?: (cb: () => void) => void;
            removeBreakReminderActionListeners?: () => void;
            showOvertimePrompt?: (workSecs: number, breakSecs: number) => void;
            updateOvertimeStatus?: (payload: {
                status: TimerStatus;
                workLocation: string;
                currentShiftId: string | null;
                overtimeAccepted: boolean;
                todayWorked: number;
                todayBreakSecs: number;
                workTargetSecs: number;
                breakTargetSecs: number;
            }) => void;
            focusOvertimePrompt?: () => void;
            closeOvertimePrompt?: () => void;
            onOvertimePromptNo?: (cb: () => void) => void;
            onOvertimePromptYes?: (cb: () => void) => void;
            removeOvertimePromptListeners?: () => void;
            removeShowBreakReminderModal?: () => void;
            // Tracker auth
            setTrackerAuthToken: (token: string) => void;
            clearTrackerAuthToken: () => void;
            // Idle threshold
            setIdleThreshold: (seconds: number) => void;
            // Screenshot interval
            setScreenshotInterval: (seconds: number) => void;
            // WFH config
            setWfhConfig: (config: { intervalMs: number; width: number; height: number }) => void;
            // WFH screen idle threshold (independent of hardware idle threshold)
            setWfhScreenIdleThreshold: (seconds: number) => void;
            // WFH mode
            setWorkLocation: (location: string) => void;
        };
    }
}

// ── Pure Helpers ──────────────────────────────────────────────────────────────

/** Calculate elapsed seconds between two ISO timestamps (or now if end is null) */
function calcDuration(start: string, end: string | null): number {
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : Date.now();
    return Math.floor((e - s) / 1000);
}

/** Sum up all break durations for a shift (open breaks count to now) */
function calcTotalBreakSecs(breaks: HistoryShift['breaks']): number {
    return breaks.reduce((acc, b) => {
        if (!b.startTime) return acc;
        return acc + calcDuration(b.startTime, b.endTime);
    }, 0);
}

/** Calculate seconds inside a local day/window only. */
function calcDurationInRange(start: string, end: string | null, rangeStartMs: number, rangeEndMs: number): number {
    const startMs = Math.max(new Date(start).getTime(), rangeStartMs);
    const endMs = Math.min(end ? new Date(end).getTime() : Date.now(), rangeEndMs);
    return Math.max(0, Math.floor((endMs - startMs) / 1000));
}

function calcTotalBreakSecsInRange(
    breaks: HistoryShift['breaks'],
    rangeStartMs: number,
    rangeEndMs: number
): number {
    return breaks.reduce((acc, b) => {
        if (!b.startTime) return acc;
        return acc + calcDurationInRange(b.startTime, b.endTime, rangeStartMs, rangeEndMs);
    }, 0);
}

function calcWorkSecsUntil(shift: HistoryShift, endTime: string): number {
    const shiftStartMs = new Date(shift.startTime).getTime();
    const endMs = new Date(endTime).getTime();
    if (!Number.isFinite(shiftStartMs) || !Number.isFinite(endMs)) return 0;

    const cappedEndMs = Math.max(shiftStartMs, Math.min(endMs, Date.now()));
    const elapsedSecs = Math.max(0, Math.floor((cappedEndMs - shiftStartMs) / 1000));
    const breakSecs = calcTotalBreakSecsInRange(shift.breaks, shiftStartMs, cappedEndMs);
    const adjustmentSecs = (shift.timeAdjustmentSecs ?? 0) + (shift.graceAppliedSecs ?? 0);

    return Math.max(0, elapsedSecs - breakSecs + adjustmentSecs);
}

function getNextLocalMidnight(): Date {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
    return next;
}

/** Format a seconds count as HH:MM:SS */
export function formatDuration(seconds: number): string {
    if (seconds < 0) seconds = 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTimer() {
    // ── Core shift state ──────────────────────────────────────────────────────
    const [status, setStatus] = useState<TimerStatus>('stopped');
    const [currentShift, setCurrentShift] = useState<HistoryShift | null>(null);
    const [history, setHistory] = useState<HistoryShift[]>([]);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState('');

    // ── Live idle threshold tracking ──────────────────────────────────────────
    // Seeded from localStorage (set at login) so the ref is correct from the start.
    // After each status poll, if the backend returns a different value (admin changed
    // it), we push the new threshold to the Electron main process via IPC.
    const lastThresholdRef = useRef<number>(
        parseInt(localStorage.getItem('wf_idle_threshold') ?? '60', 10)
    );
    const lastScreenshotIntervalRef = useRef<number>(600);

    // ── Work-time targets (from OrgSettings, delivered via status poll) ────────
    // Admin sets these in the admin portal. Desktop reads them every poll and
    // shows a checkout warning if not met.
    const [expectedWorkSecs, setExpectedWorkSecs] = useState(28800); // 8h default
    const [expectedBreakSecs, setExpectedBreakSecs] = useState(3600); // 1h default
    const [expectedActiveSecs, setExpectedActiveSecs] = useState(25200); // 7h default
    const [maxBreaks, setMaxBreaks] = useState(3);     // admin-configurable break limit
    const [breakReminderAfterSecs, setBreakReminderAfterSecs] = useState(1800);
    const [breakReminderRepeatSecs, setBreakReminderRepeatSecs] = useState(300);


    // ── Idle state ────────────────────────────────────────────────────────────
    // `closedIdleSecs` = total seconds from all COMPLETED idle sessions (from backend).
    // `idleSessionStartTime` = start of the CURRENT open idle session (tracked locally).
    // The two are combined on every tick to produce a smooth real-time idle counter.
    const [closedIdleSecs, setClosedIdleSecs] = useState(0);
    const [idleSessionStartTime, setIdleSessionStartTime] = useState<Date | null>(null);

    // ── Screen Lock state ─────────────────────────────────────────────────────
    // `lockBreakRef` = true when the current break was automatically started by
    // a screen lock event. Only in this case do we auto-resume work on unlock.
    // Manual breaks (user clicked "Take Break") leave this as false, so they
    // are NEVER auto-ended on unlock.
    const lockBreakRef = useRef(false);

    // ── Tick: forces re-render every second when shift is active ──────────────
    const [tick, setTick] = useState(0);
    const tickRef = useRef<number | null>(null);

    // ── Data Fetching ─────────────────────────────────────────────────────────

    const fetchStatus = useCallback(async () => {
        try {
            const data = await getStatus();
            setStatus(data.status);
            if (data.shift && typeof data.shift === 'object') {
                setCurrentShift(data.shift as HistoryShift);
            } else {
                setCurrentShift(null);
            }

            // ── Live idle threshold sync ──────────────────────────────────────
            // Detect if admin changed the threshold since the last poll.
            const newThreshold = data.idleThresholdSecs;
            if (typeof newThreshold === 'number' && newThreshold !== lastThresholdRef.current) {
                lastThresholdRef.current = newThreshold;
                localStorage.setItem('wf_idle_threshold', String(newThreshold));
                console.log(`[Idle] Admin updated threshold → ${newThreshold}s. Pushing to Electron.`);

                // Push to Electron main process so polling uses the new value immediately
                const api = window.electronAPI;
                if (api && 'setIdleThreshold' in api) {
                    (api as unknown as { setIdleThreshold: (s: number) => void }).setIdleThreshold(newThreshold);
                }
            }

            // ── Keep work-time targets in sync ───────────────────────────────
            if (typeof data.expectedWorkSecs === 'number') setExpectedWorkSecs(data.expectedWorkSecs);
            if (typeof data.expectedBreakSecs === 'number') setExpectedBreakSecs(data.expectedBreakSecs);
            if (typeof data.expectedActiveSecs === 'number') setExpectedActiveSecs(data.expectedActiveSecs);
            if (typeof data.maxBreaks === 'number') setMaxBreaks(data.maxBreaks);
            if (typeof data.breakReminderAfterSecs === 'number') setBreakReminderAfterSecs(data.breakReminderAfterSecs);
            if (typeof data.breakReminderRepeatSecs === 'number') setBreakReminderRepeatSecs(data.breakReminderRepeatSecs);
            if (
                typeof data.screenshotIntervalSecs === 'number' &&
                data.screenshotIntervalSecs !== lastScreenshotIntervalRef.current
            ) {
                console.log(
                    `[Screenshot] Admin updated interval -> ${data.screenshotIntervalSecs}s. Syncing to desktop scheduler.`
                );
                lastScreenshotIntervalRef.current = data.screenshotIntervalSecs;
                const api = window.electronAPI;
                if (api && 'setScreenshotInterval' in api) {
                    (api as unknown as { setScreenshotInterval: (s: number) => void })
                        .setScreenshotInterval(data.screenshotIntervalSecs);
                }
            }

            // Sync WFH capture config (interval + thumbnail size)
            if (
                typeof data.wfhCaptureIntervalMs === 'number' &&
                typeof data.wfhThumbWidth === 'number' &&
                typeof data.wfhThumbHeight === 'number'
            ) {
                const api = window.electronAPI;
                if (api && 'setWfhConfig' in api) {
                    api.setWfhConfig({
                        intervalMs: data.wfhCaptureIntervalMs,
                        width: data.wfhThumbWidth,
                        height: data.wfhThumbHeight
                    });
                }
            }

            // Sync WFH screen idle threshold (separate from hardware idle threshold)
            if (typeof data.wfhScreenIdleThresholdSecs === 'number') {
                const api = window.electronAPI;
                if (api && 'setWfhScreenIdleThreshold' in api) {
                    (api as unknown as { setWfhScreenIdleThreshold: (s: number) => void })
                        .setWfhScreenIdleThreshold(data.wfhScreenIdleThresholdSecs);
                }
            }

            // ── WFH mode sync ─────────────────────────────────────────────────
            // Push the active shift's workLocation to the Electron main process
            // so it can activate/deactivate the screen-change idle monitor.
            const shiftData = data.shift as { workLocation?: string } | null;
            const workLoc = shiftData?.workLocation ?? 'office';
            window.electronAPI?.setWorkLocation?.(workLoc);


        } catch {
            // Do NOT reset status/shift on network errors.
            // If the backend is temporarily unreachable (e.g. network reconnecting
            // after sleep), wiping the UI would show NOT CLOCKED IN even though
            // the shift is still active. Silently ignore and keep last known state.
            console.warn('[Status] fetchStatus failed — keeping last known state');
        }
    }, []);

    /**
     * Retries fetchStatus up to `maxAttempts` times with a `delayMs` gap.
     * Used after system wake so we wait for the network to reconnect before
     * syncing — prevents the "NOT CLOCKED IN" flash caused by an early failed fetch.
     */
    const fetchStatusWithRetry = useCallback(async (maxAttempts = 5, delayMs = 2000) => {
        for (let i = 0; i < maxAttempts; i++) {
            try {
                await fetchStatus();
                return; // success
            } catch {
                if (i < maxAttempts - 1) {
                    await new Promise(r => setTimeout(r, delayMs));
                }
            }
        }
    }, [fetchStatus]);


    const fetchHistory = useCallback(async () => {
        try {
            const shifts = await getHistory();
            setHistory(shifts);
        } catch { /* Silently ignore — history is non-critical */ }
    }, []);

    /**
     * Refresh idle seconds from the backend.
     * This gives us the total of all CLOSED idle sessions.
     * The currently open (live) session is tracked locally via idleSessionStartTime.
     */
    const fetchIdleSecs = useCallback(async () => {
        try {
            const secs = await getTodayIdleSecs();
            setClosedIdleSecs(secs);
        } catch { /* Silently ignore — non-critical */ }
    }, []);

    // Initial load: fetch all data in parallel
    useEffect(() => {
        setLoading(true);
        Promise.all([fetchStatus(), fetchHistory(), fetchIdleSecs()])
            .finally(() => setLoading(false));

        // ── Push initial thresholds to Electron on mount ──────────────────────────
        // Because the main process defaults to 60s/600s on launch, we must sync our
        // local saved values immediately so that previous settings are respected
        // without waiting for the admin to change them in the database.
        const api = window.electronAPI;
        if (api) {
            if ('setIdleThreshold' in api) {
                (api as unknown as { setIdleThreshold: (s: number) => void }).setIdleThreshold(lastThresholdRef.current);
            }
            if ('setScreenshotInterval' in api) {
                (api as unknown as { setScreenshotInterval: (s: number) => void }).setScreenshotInterval(lastScreenshotIntervalRef.current);
            }
        }
    }, [fetchStatus, fetchHistory, fetchIdleSecs]);

    // ── Per-second Tick ───────────────────────────────────────────────────────
    // Triggers re-renders so inline stats (work time, break time) update live.

    useEffect(() => {
        if (status !== 'stopped' && currentShift) {
            tickRef.current = window.setInterval(() => setTick(t => t + 1), 1000);
        } else {
            if (tickRef.current) clearInterval(tickRef.current);
        }
        return () => { if (tickRef.current) clearInterval(tickRef.current); };
    }, [status, currentShift]);

    // ── Idle Sync: re-fetch idle secs from backend every 30 seconds ──────────
    // This ensures the pie chart stays accurate even for long idle sessions.

    useEffect(() => {
        // Refresh idle secs from backend every 30s when shift is active.
        // Also runs during on_break so already-closed idle sessions stay accurate.
        if (status === 'working' || status === 'on_break') {
            const interval = window.setInterval(fetchIdleSecs, 10_000);
            return () => clearInterval(interval);
        }
    }, [status, fetchIdleSecs]);

    // ── Settings Sync: re-fetch status every 30 seconds ──────────────────────
    // fetchStatus includes expectedWorkSecs + expectedActiveSecs from OrgSettings.
    // Without this, the desktop only reads them once on mount and never again,
    // so admin changes to work time targets would only appear after a user action.
    // This poll ensures settings propagate within 30 seconds automatically.
    useEffect(() => {
        const interval = window.setInterval(fetchStatus, 30_000);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    // Browser/dev fallback only. In Electron, main.js owns heartbeat so it
    // keeps running even if the renderer timer is throttled in the background.
    useEffect(() => {
        if (status !== 'working' && status !== 'on_break') return;
        if (window.electronAPI) return;

        const tickHeartbeat = async () => {
            try {
                await sendHeartbeat();
            } catch (err) {
                console.warn('[Heartbeat] Failed to ping backend:', err);
            }
        };

        void tickHeartbeat(); // run immediately on state change
        const interval = window.setInterval(() => {
            void tickHeartbeat();
        }, 20_000);

        return () => clearInterval(interval);
    }, [status]);

    // Split an active shift at local midnight so each day is calculated in
    // the machine's 00:00:00 -> 23:59:59 calendar box.
    useEffect(() => {
        if (status === 'stopped' || !currentShift) return;

        const rolloverAt = getNextLocalMidnight();
        const delayMs = Math.max(0, rolloverAt.getTime() - Date.now());

        const timeout = window.setTimeout(async () => {
            try {
                const wasIdle = !!idleSessionStartTime;
                const result = await rolloverMidnight({ rolloverAt, continueIdle: wasIdle });
                if (result.shift && typeof result.shift === 'object') {
                    setCurrentShift(result.shift as HistoryShift);
                }
                if (wasIdle) setIdleSessionStartTime(new Date(rolloverAt));
                await fetchStatus();
                await fetchHistory();
                await fetchIdleSecs();
            } catch (err) {
                console.warn('[Midnight] Failed to roll over active shift:', err);
            }
        }, delayMs);

        return () => clearTimeout(timeout);
    }, [status, currentShift, idleSessionStartTime, fetchStatus, fetchHistory, fetchIdleSecs]);


    // ── Real-time idle threshold sync (SSE) ─────────────────────────────────
    // Subscribes to the backend SSE stream on mount.
    // When admin changes a user's idle threshold, the backend pushes an
    // `idle-threshold-changed` event. This callback fires in milliseconds
    // and immediately applies the new threshold to Electron's idle poller.
    useEffect(() => {
        const unsubscribe = subscribeToThresholdEvents((newThreshold: number) => {
            // Guard: only act if the value actually changed
            if (newThreshold === lastThresholdRef.current) return;

            lastThresholdRef.current = newThreshold;
            localStorage.setItem('wf_idle_threshold', String(newThreshold));
            console.log(`[Idle] SSE: admin updated threshold → ${newThreshold}s`);

            // Push to Electron main process — idle polling switches to new value instantly
            const api = window.electronAPI;
            if (api && 'setIdleThreshold' in api) {
                (api as unknown as { setIdleThreshold: (s: number) => void }).setIdleThreshold(newThreshold);
            }
        });

        return unsubscribe; // closes the EventSource on unmount
    }, []);

    // ── Idle Event Listeners (Electron IPC) ───────────────────────────────────
    // Only active when a shift is in 'working' state (not on break, not stopped).

    useEffect(() => {
        const api = window.electronAPI;
        if (!api) return; // Running in browser (dev mode without Electron)

        // Called by Electron when user has been idle for ≥60 seconds
        api.onIdleStart(async (idleStartTime: string) => {
            // Only track idle during active work — never during a break
            if (status !== 'working') return;

            console.log('[Idle] User went idle at:', idleStartTime);

            // Set local start time so the counter ticks every second immediately
            setIdleSessionStartTime(new Date(idleStartTime));

            // Also persist to backend (fire-and-forget, errors are non-fatal)
            try {
                await startIdleSession(idleStartTime);
            } catch (e) {
                console.warn('[Idle] Failed to record idle start on server:', e);
            }
        });

        // Called by Electron when the user moves their mouse or types again
        api.onIdleEnd(async () => {
            console.log('[Idle] User became active again');

            // Clear the local timer — the session is over
            setIdleSessionStartTime(null);

            // Fetch updated closed total from backend, then persist the session end
            try {
                await endIdleSession();
                await fetchIdleSecs(); // re-sync closed total so counter is accurate
            } catch (e) {
                console.warn('[Idle] Failed to record idle end on server:', e);
            }
        });

        // Cleanup listeners when component unmounts or status changes
        return () => api.removeIdleListeners();
    }, [status, fetchIdleSecs]);

    // ── Screen Lock / Unlock Listeners (Electron IPC) ─────────────────────────
    // When Win+L is pressed:
    //   • If working → automatically start a break + set lockBreakRef flag
    // When screen unlocks:
    //   • If lockBreakRef is set → automatically end the break + clear flag
    //   • Otherwise (manual break) → do nothing

    useEffect(() => {
        const api = window.electronAPI;
        if (!api) return;

        api.onScreenLocked(async () => {
            console.log('[ScreenLock] Screen locked');

            // Only auto-break if the user is currently working (not already on break or stopped)
            if (status !== 'working') return;

            // Close any open idle session first — the break covers this time now
            setIdleSessionStartTime(null);
            await endIdleSession().catch(() => { /* No idle session open — safe to ignore */ });

            // Mark this break as lock-initiated so we know to auto-resume on unlock
            lockBreakRef.current = true;

            console.log('[ScreenLock] Auto-starting break due to screen lock');
            try {
                await toggleBreak();
                await fetchStatus();
                await fetchHistory();
            } catch (e) {
                console.warn('[ScreenLock] Failed to start break on screen lock:', e);
                lockBreakRef.current = false; // reset flag if the API call failed
            }
        });

        api.onScreenUnlocked(async () => {
            console.log('[ScreenLock] Screen unlocked');

            // Only auto-resume if THIS break was started by a screen lock
            if (!lockBreakRef.current) {
                console.log('[ScreenLock] Break was not lock-initiated — leaving break running');
                return;
            }

            // Clear the flag before the API call to avoid double-triggering
            lockBreakRef.current = false;

            console.log('[ScreenLock] Auto-ending break due to screen unlock');
            try {
                await toggleBreak();
                await fetchStatus();
                await fetchHistory();
            } catch (e) {
                console.warn('[ScreenLock] Failed to end break on screen unlock:', e);
            }
        });

        return () => api.removeScreenListeners();
    }, [status, fetchStatus, fetchHistory]);

    // ── Sleep / Resume Listeners (Electron IPC) ────────────────────────────────
    // Main.js already called the backend API before the network dropped.
    // Here the renderer just re-syncs its UI state from the backend.
    //
    // ⚠️ INDEPENDENT from shutdown → disconnect-intent → auto-checkout.

    useEffect(() => {
        const api = window.electronAPI;
        if (!api) return;

        api.onSleepBreakStarted(async () => {
            console.log('[Sleep] Main process started break on sleep — re-syncing UI');
            await fetchStatus();
            await fetchHistory();
        });

        api.onSleepBreakEnded(async (ok: boolean) => {
            console.log(`[Sleep] Main process ended break on wake (ok=${ok}) — re-syncing UI`);
            // Use retry: network may take a few seconds to reconnect after sleep.
            // Without retry the first fetch fails and the UI shows NOT CLOCKED IN.
            await fetchStatusWithRetry(6, 2000);
            await fetchHistory();
            await fetchIdleSecs();
        });

        return () => api.removeSleepListeners();
    }, [fetchStatus, fetchStatusWithRetry, fetchHistory, fetchIdleSecs]);

    // ── Computed Stats ────────────────────────────────────────────────────────
    // Recalculated on every render (every second when shift is active)

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayStart = startOfToday.getTime();

    // Completed shifts today (used for historical totals)
    const completedToday = history.filter(
        s => new Date(s.startTime).getTime() >= todayStart && s.endTime !== null
    );

    const _historyWork = completedToday.reduce(
        (acc, s) => acc + calcDuration(s.startTime, s.endTime) - calcTotalBreakSecs(s.breaks), 0
    );
    const _historyBreakSecs = completedToday.reduce(
        (acc, s) => acc + calcTotalBreakSecs(s.breaks), 0
    );
    void _historyWork;
    void _historyBreakSecs;

    // Break limit is per active shift. The status API returns all breaks for the
    // current shift, and optimistic break starts are added to this same array.
    const todayBreaksCount = currentShift?.breaks.length ?? 0;


    // ── Active shift contribution (recalculated every second via tick) ──────────
    let activeWork = 0;
    let activeBreakSecs = 0;
    let elapsedSecs = 0;

    const liveActiveSecs = idleSessionStartTime
        ? Math.floor((Date.now() - idleSessionStartTime.getTime()) / 1000)
        : 0;
    const todayIdleSecs = closedIdleSecs + liveActiveSecs;

    if (currentShift) {
        const nowMs = Date.now();
        const totalElapsed = calcDurationInRange(currentShift.startTime, null, todayStart, nowMs);
        activeBreakSecs = calcTotalBreakSecsInRange(currentShift.breaks, todayStart, nowMs);
        const adjustmentSecs = (currentShift.timeAdjustmentSecs ?? 0) + (currentShift.graceAppliedSecs ?? 0);
        activeWork = Math.max(0, totalElapsed - activeBreakSecs + adjustmentSecs);
        elapsedSecs = totalElapsed;
    }

    // Show only the CURRENT shift's work/break time.
    // After checkout (currentShift = null), activeWork = 0 → timer resets to 00:00:00.
    // One check-in → check-out = one shift. Backend history is unaffected.
    const todayWorked = activeWork;
    const todayBreakSecs = activeBreakSecs;
    const activeBreak = currentShift?.breaks.find(b => !b.endTime) ?? null;
    const isOvertimeActive =
        status !== 'stopped' &&
        currentShift?.overtimeStatus === 'active' &&
        !!currentShift.overtimeStartTime;
    const overtimeBaseWorkedSecs = isOvertimeActive && currentShift?.overtimeStartTime
        ? calcWorkSecsUntil(currentShift, currentShift.overtimeStartTime)
        : null;
    const overtimeSecs = overtimeBaseWorkedSecs !== null
        ? Math.max(0, todayWorked - overtimeBaseWorkedSecs)
        : 0;

    // ── Idle time: combine closed sessions (from backend) + live active session ──
    // `closedIdleSecs` = sum of all finished idle sessions fetched from backend.
    // `liveActiveSecs` = seconds since the current idle session started (if any).
    // Together they give a smooth second-by-second idle counter, just like
    // todayWorked / todayBreakSecs are computed on every tick.
    // ── Actions ───────────────────────────────────────────────────────────────

    const handleStart = async (workLocation: 'wfh' | 'office') => {
        setError('');
        setActionLoading(true);
        try {
            await startShift(workLocation);
            await fetchStatus();
            await fetchHistory();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleBreak = async () => {
        if (!currentShift) return;
        setError('');

        // Enforce the admin-configurable break limit for instant feedback
        if (status !== 'on_break' && todayBreaksCount >= maxBreaks) {
            setError(`Break limit reached — only ${maxBreaks} break${maxBreaks !== 1 ? 's' : ''} are allowed per shift`);
            return;
        }

        setActionLoading(true);

        const isCurrentlyOnBreak = status === 'on_break';
        const now = new Date().toISOString();

        // ── If going ON break: close any open idle session first ──────────────
        // This prevents idle time from bleeding into break time.
        // If the user was idle and then clicked "Take Break", we cap the idle
        // session right now before the break begins.
        if (!isCurrentlyOnBreak) {
            await endIdleSession().catch(() => { /* No open idle session — safe to ignore */ });
        }

        // Optimistic update: change UI instantly before API responds
        if (isCurrentlyOnBreak) {
            setStatus('working');
            setCurrentShift(prev => {
                if (!prev) return prev;
                const breaks = prev.breaks.map((b, i) =>
                    i === prev.breaks.length - 1 && !b.endTime ? { ...b, endTime: now } : b
                );
                return { ...prev, breaks };
            });
        } else {
            setStatus('on_break');
            setCurrentShift(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    breaks: [...prev.breaks, { id: `temp-${Date.now()}`, startTime: now, endTime: null }],
                };
            });
        }

        try {
            await toggleBreak();
            await fetchStatus();
            await fetchHistory();
            await fetchIdleSecs(); // refresh idle chart after break state change
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Error');
            // Revert the optimistic update if the API call failed
            await fetchStatus();
            await fetchHistory();
        } finally {
            setActionLoading(false);
        }
    };

    const handleStop = async (options: { overtimeAccepted?: boolean } = {}): Promise<boolean> => {
        setError('');
        setActionLoading(true);
        try {
            // Close any open idle session before stopping the shift
            await endIdleSession().catch(() => { /* Already closed or no shift — safe to ignore */ });
            setIdleSessionStartTime(null); // clear local idle timer
            await stopShift(options);
            await fetchHistory();
            await fetchStatus();
            await fetchIdleSecs();
            return true;
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Error');
            return false;
        } finally {
            setActionLoading(false);
        }
    };

    const handleStartOvertime = async (): Promise<boolean> => {
        setError('');
        setActionLoading(true);
        try {
            await endIdleSession().catch(() => { /* Already closed or no shift - safe to ignore */ });
            setIdleSessionStartTime(null);
            await startOvertime();
            await fetchStatus();
            await fetchHistory();
            await fetchIdleSecs();
            return true;
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Error');
            await fetchStatus();
            await fetchHistory();
            return false;
        } finally {
            setActionLoading(false);
        }
    };

    // ── Shift status sync to main process ──────────────────────────────────────
    // Keep main.js informed so it can guard the sleep break and schedule break reminders correctly.
    useEffect(() => {
        const api = window.electronAPI;
        if (!api || !('updateShiftStatus' in api)) return;

        const activeBreakStartTime = status === 'on_break' ? activeBreak?.startTime ?? null : null;
        console.log('[useTimer] Syncing shift status to Electron:', {
            status,
            activeBreakStartTime,
            breakReminderAfterSecs,
            breakReminderRepeatSecs
        });

        (api as any).updateShiftStatus(
            status,
            activeBreakStartTime,
            breakReminderAfterSecs,
            breakReminderRepeatSecs
        );
    }, [status, activeBreak?.startTime, breakReminderAfterSecs, breakReminderRepeatSecs]);

    // Suppress unused variable warning — tick is only used to trigger re-renders
    void tick;

    return {
        status,
        elapsedSecs,
        history,
        loading,
        actionLoading,
        error,
        handleStart,
        handleBreak,
        handleStop,
        handleStartOvertime,
        todayWorked,
        todayBreakSecs,
        isOvertimeActive,
        overtimeSecs,
        overtimeStartTime: currentShift?.overtimeStartTime ?? null,
        overtimeStatus: currentShift?.overtimeStatus ?? 'none',
        overtimeAccepted: currentShift?.overtimeAccepted ?? null,
        overtimeDecisionAt: currentShift?.overtimeDecisionAt ?? null,
        activeBreakStartTime: status === 'on_break' ? activeBreak?.startTime ?? null : null,
        todayBreaksCount,
        todayIdleSecs,        // real-time idle seconds (increments every second)
        expectedWorkSecs,     // org-wide expected total shift length
        expectedBreakSecs,    // org-wide required break time before overtime prompt
        expectedActiveSecs,   // org-wide expected active (non-idle) time
        maxBreaks,            // org-wide max breaks per shift (admin-configurable)
        breakReminderAfterSecs,
        breakReminderRepeatSecs,
        currentShiftId: currentShift?.id ?? null,
        workLocation: currentShift?.workLocation ?? 'office',
    };
}
