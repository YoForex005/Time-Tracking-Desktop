import { useState, useEffect, useCallback, useRef } from 'react';
import { getStatus, startShift, toggleBreak, stopShift, getHistory } from '../api';

export type TimerStatus = 'stopped' | 'working' | 'on_break';

export interface HistoryShift {
    id: string;
    startTime: string;
    endTime: string | null;
    breaks: Array<{ id: string; startTime: string; endTime: string | null }>;
}

function calcDuration(start: string, end: string | null): number {
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : Date.now();
    return Math.floor((e - s) / 1000);
}

function calcTotalBreakSecs(breaks: HistoryShift['breaks']): number {
    return breaks.reduce((acc, b) => {
        if (!b.startTime) return acc;
        return acc + calcDuration(b.startTime, b.endTime);
    }, 0);
}

export function formatDuration(seconds: number): string {
    if (seconds < 0) seconds = 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function useTimer() {
    const [status, setStatus] = useState<TimerStatus>('stopped');
    const [currentShift, setCurrentShift] = useState<HistoryShift | null>(null);
    const [history, setHistory] = useState<HistoryShift[]>([]);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState('');

    // A simple tick counter that increments every second to force re-renders
    const [tick, setTick] = useState(0);
    const tickRef = useRef<number | null>(null);

    const fetchStatus = useCallback(async () => {
        try {
            const data = await getStatus();
            setStatus(data.status);
            if (data.shift && typeof data.shift === 'object') {
                setCurrentShift(data.shift as HistoryShift);
            } else {
                setCurrentShift(null);
            }
        } catch {
            setStatus('stopped');
            setCurrentShift(null);
        }
    }, []);

    const fetchHistory = useCallback(async () => {
        try {
            const shifts = await getHistory();
            setHistory(shifts);
        } catch { }
    }, []);

    useEffect(() => {
        setLoading(true);
        Promise.all([fetchStatus(), fetchHistory()]).finally(() => setLoading(false));
    }, [fetchStatus, fetchHistory]);

    // Tick every second to trigger re-renders so inline stats recalculate
    useEffect(() => {
        if (status !== 'stopped' && currentShift) {
            tickRef.current = window.setInterval(() => setTick(t => t + 1), 1000);
        } else {
            if (tickRef.current) clearInterval(tickRef.current);
        }
        return () => { if (tickRef.current) clearInterval(tickRef.current); };
    }, [status, currentShift]);

    // ── INLINE STATS: recalculate fresh on every render (every second when active) ──
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayStart = startOfToday.getTime();

    // Completed shifts today (for historical work/break time)
    const completedToday = history.filter(
        s => new Date(s.startTime).getTime() >= todayStart && s.endTime !== null
    );

    const historyWork = completedToday.reduce(
        (acc, s) => acc + calcDuration(s.startTime, s.endTime) - calcTotalBreakSecs(s.breaks), 0
    );
    const historyBreakSecs = completedToday.reduce(
        (acc, s) => acc + calcTotalBreakSecs(s.breaks), 0
    );

    // ── BREAK COUNT: use ALL today's shifts in history as ground truth ──
    // The /history API always returns complete data (5 breaks = 5 in history).
    // The /status API may only return the latest break, so we DON'T use currentShift.breaks.length.
    const breaksCountFromHistory = history
        .filter(s => new Date(s.startTime).getTime() >= todayStart)
        .reduce((acc, s) => acc + s.breaks.length, 0);

    // Optimistic +1: user clicked "Take Break" but server hasn't responded yet (temp ID)
    const hasOptimisticBreak = !!(currentShift?.breaks.some(b => b.id.startsWith('temp-')));
    const todayBreaksCount = breaksCountFromHistory + (hasOptimisticBreak ? 1 : 0);

    let activeWork = 0;
    let activeBreakSecs = 0;
    let elapsedSecs = 0;

    if (currentShift) {
        const totalElapsed = calcDuration(currentShift.startTime, null);
        activeBreakSecs = calcTotalBreakSecs(currentShift.breaks);

        activeWork = Math.max(0, totalElapsed - activeBreakSecs);
        elapsedSecs = totalElapsed;
    }

    const todayWorked = historyWork + activeWork;
    const todayBreakSecs = historyBreakSecs + activeBreakSecs;
    // todayBreaksCount is already computed above from history

    const handleStart = async () => {
        setError('');
        setActionLoading(true);
        try {
            await startShift();
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

        // ── Frontend limit check (UX) ──
        if (status !== 'on_break' && todayBreaksCount >= 10) {
            setError('Only 10 breaks are available for a single day');
            return;
        }

        setActionLoading(true);

        const isCurrentlyOnBreak = status === 'on_break';
        const now = new Date().toISOString();

        // ── OPTIMISTIC UPDATE: update UI instantly before API responds ──
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
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Error';
            setError(msg);
            // Revert optimistic update on failure
            await fetchStatus();
            await fetchHistory();
        } finally {
            setActionLoading(false);
        }
    };

    const handleStop = async () => {
        setError('');
        setActionLoading(true);
        try {
            await stopShift();
            await fetchHistory();
            await fetchStatus();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Error');
        } finally {
            setActionLoading(false);
        }
    };

    // Suppress unused variable warning for tick (it's used only to trigger re-renders)
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
        todayWorked,
        todayBreakSecs,
        todayBreaksCount,
    };
}
