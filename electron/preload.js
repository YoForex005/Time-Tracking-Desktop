/**
 * preload.js — Electron Preload Script
 * -----------------------------------------------
 * Runs in a sandboxed context between the main process and the renderer.
 * Exposes only specific, safe IPC channels to the React app via contextBridge.
 *
 * Exposed API (window.electronAPI):
 *   Window controls  : minimize, maximize, close
 *   Idle detection   : onIdleStart(cb), onIdleEnd(cb), removeIdleListeners()
 *   Screen lock      : onScreenLocked(cb), onScreenUnlocked(cb), removeScreenListeners()
 *   Sleep / Resume   : onSleepStart(cb), onSleepEnd(cb), removeSleepListeners()
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // ── Window Controls ──────────────────────────────────────────────────────
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),

    // ── Idle Detection ───────────────────────────────────────────────────────
    // The main process polls system idle time every 10 seconds and sends these
    // events when the user transitions between idle and active states.

    /**
     * Register a callback triggered when the user goes idle (after 1-min grace).
     * @param callback - Receives the ISO timestamp of when idleness actually began.
     */
    onIdleStart: (callback) => {
        ipcRenderer.on('idle-start', (_event, startTime) => callback(startTime));
    },

    /**
     * Register a callback triggered when the user becomes active again.
     */
    onIdleEnd: (callback) => {
        ipcRenderer.on('idle-end', () => callback());
    },

    /**
     * Remove all idle-related IPC listeners (call on component unmount).
     */
    removeIdleListeners: () => {
        ipcRenderer.removeAllListeners('idle-start');
        ipcRenderer.removeAllListeners('idle-end');
    },

    // ── Screen Lock Detection ────────────────────────────────────────────────
    // Fired when the user locks their screen (e.g. Win+L).
    // The renderer uses these to automatically start/end breaks.

    /**
     * Register a callback triggered when the screen is locked.
     * The renderer will automatically start a break if the user is working.
     */
    onScreenLocked: (callback) => {
        ipcRenderer.on('screen-locked', () => callback());
    },

    /**
     * Register a callback triggered when the screen is unlocked.
     * The renderer will end the break if it was started by a screen lock.
     */
    onScreenUnlocked: (callback) => {
        ipcRenderer.on('screen-unlocked', () => callback());
    },

    /** Remove all screen lock/unlock IPC listeners (call on component unmount). */
    removeScreenListeners: () => {
        ipcRenderer.removeAllListeners('screen-locked');
        ipcRenderer.removeAllListeners('screen-unlocked');
    },

    // ── Sleep / Resume Detection ─────────────────────────────────────────────
    // 'suspend' → system going to sleep (lid close, sleep button, OS power plan)
    // 'resume'  → system waking back up
    // NOTE: completely separate from 'shutdown' → that path handles clock-out.

    /**
     * Register a callback triggered when the system goes to sleep.
     * The renderer will auto-start a break (if working and below break limit).
     */
    onSleepStart: (callback) => {
        ipcRenderer.on('sleep-start', () => callback());
    },

    /**
     * Register a callback triggered when the system wakes from sleep.
     * The renderer will end the sleep-initiated break (if one was started).
     */
    onSleepEnd: (callback) => {
        ipcRenderer.on('sleep-end', () => callback());
    },

    /** Remove sleep event IPC listeners (call on component unmount). */
    removeSleepListeners: () => {
        ipcRenderer.removeAllListeners('sleep-start');
        ipcRenderer.removeAllListeners('sleep-end');
    },

    // ── App Tracking (Silent) ────────────────────────────────────────────────
    onAppTrackerUpdate: (callback) => {
        ipcRenderer.on('app-tracker-update', (_event, data) => callback(data));
    },
    removeAppTrackerListeners: () => {
        ipcRenderer.removeAllListeners('app-tracker-update');
    },
    getAppUsage: () => ipcRenderer.invoke('get-app-usage'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    clearAppUsage: () => ipcRenderer.send('clear-app-usage'),
    setTrackerAuthToken: (token) => ipcRenderer.send('set-tracker-auth-token', token),
    clearTrackerAuthToken: () => ipcRenderer.send('clear-tracker-auth-token'),

    // ── Idle Threshold (NEW — Admin Portal) ──────────────────────────────────
    // Called by the renderer after login to push the admin-set per-user threshold
    // to the main process, replacing the default 60-second hardcoded value.
    setIdleThreshold: (seconds) => ipcRenderer.send('set-idle-threshold', seconds),
    setScreenshotInterval: (seconds) => ipcRenderer.send('set-screenshot-interval', seconds),

    // ── Browser-Based Device-Flow Auth ────────────────────────────────────────
    /**
     * Opens the website login page in the system browser with the device code.
     * @param code - One-time UUID generated by the renderer (LoginPage.tsx)
     */
    openLogin: (code) => ipcRenderer.send('open-login', code),

    /**
     * Fired when the browser calls workfolio://... after successful web login.
     * Used to trigger an immediate desktop session poll instead of waiting.
     */
    onAuthCallback: (callback) => {
        ipcRenderer.on('auth-callback', (_event, payload) => callback(payload));
    },
    onOtaStatus: (callback) => {
        ipcRenderer.on('ota-status', (_event, status) => callback(status));
    },
    onUpdateReady: (callback) => {
        ipcRenderer.on('ota-update-ready', (_event, version) => callback(version));
    },
    restartApp: () => ipcRenderer.send('restart-app'),
    removeAuthCallbackListeners: () => {
        ipcRenderer.removeAllListeners('auth-callback');
    },
    /**
     * Opens the website dashboard in the system browser.
     */
    openDashboard: () => ipcRenderer.send('open-dashboard'),
});

