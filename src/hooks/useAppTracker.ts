import { useEffect, useState, useRef } from 'react';
import { syncUsageData } from '../api/usage';
import type { AppUsageData } from '../api/usage';

// Minimal type for IPC data
interface IpcTrackerData {
    active: any;
    usage: AppUsageData[];
}

/**
 * Hook to manage silent background application tracking.
 * It listens to IPC events from the main process and periodically sends them to the server.
 */
export function useAppTracker() {
    const [usage, setUsage] = useState<AppUsageData[]>([]);
    const lastSyncTime = useRef<number>(Date.now());

    // Config: Sync to server every 10 seconds
    const SYNC_INTERVAL_MS = 10000;


    useEffect(() => {
        const win = window as any;
        if (!win.electronAPI) return;

        // Fetch initial state
        win.electronAPI.getAppUsage().then((data: IpcTrackerData) => {
            if (data && data.usage) {
                setUsage(data.usage);
            }
        });

        // Listen for updates every ~10s from Tracker
        const handleUpdate = (data: IpcTrackerData) => {
            if (!data || !data.usage) return;

            setUsage(data.usage);

            // Check if it's time to sync
            const now = Date.now();
            if (now - lastSyncTime.current >= SYNC_INTERVAL_MS) {
                lastSyncTime.current = now;
                console.log('[useAppTracker] Syncing usage data to backend...', data.usage.length, 'apps/sites recorded.');
                syncUsageData(data.usage);
            }
        };

        win.electronAPI.onAppTrackerUpdate(handleUpdate);

        return () => {
            if (win.electronAPI && win.electronAPI.removeAppTrackerListeners) {
                win.electronAPI.removeAppTrackerListeners();
            }
        };
    }, []);

    return { usage };
}
