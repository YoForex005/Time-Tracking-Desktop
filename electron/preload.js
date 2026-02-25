/**
 * preload.js — Electron Preload Script
 * -----------------------------------------------
 * Runs in a sandboxed context between the main process and the renderer.
 * Exposes only specific, safe IPC channels to the React app via contextBridge.
 *
 * Exposed API (window.electronAPI):
 *   Window controls  : minimize, maximize, close
 *   Idle detection   : onIdleStart(callback), onIdleEnd(callback), removeIdleListeners()
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
});
