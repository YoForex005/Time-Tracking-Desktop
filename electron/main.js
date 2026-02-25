/**
 * main.js — Electron Main Process
 * -----------------------------------------------
 * Entry point for the Electron app. Responsibilities:
 *   1. Spawn the backend Node.js server (production only)
 *   2. Create the main BrowserWindow
 *   3. Handle window control IPC (minimize, maximize, close)
 *   4. Detect system idle time and notify the renderer via IPC
 *
 * Idle Detection Logic:
 *   - Poll system idle time every 10 seconds using powerMonitor.getSystemIdleTime()
 *   - Grace period: first 60 seconds of inactivity are ignored
 *   - At 60 seconds: emit 'idle-start' with timestamp = (now - 60s)
 *   - On activity resume (idle < threshold): emit 'idle-end'
 *   - Only fires events during state transitions (start→idle, idle→active)
 */

const { app, BrowserWindow, ipcMain, powerMonitor } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// ── Constants ─────────────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

/** Seconds of inactivity after which the user is considered idle */
const IDLE_THRESHOLD_SECS = 60;

/**
 * How often (ms) we poll the system idle time.
 *
 * Kept at 1 second so that when the user moves the mouse or presses a key,
 * the transition back to "active" is detected almost instantly.
 * powerMonitor.getSystemIdleTime() is a lightweight OS call — polling every
 * second has negligible CPU impact.
 */
const IDLE_POLL_INTERVAL_MS = 1_000; // 1 second

// ── State ─────────────────────────────────────────────────────────────────────

let mainWindow = null;
let backendProcess = null;

/**
 * Whether the user is currently considered idle.
 * Tracks state so we only emit events on transitions, not on every poll.
 */
let isUserIdle = false;

// ── Backend (production only) ─────────────────────────────────────────────────

/**
 * Spawns the packaged backend server.
 * In development, the backend is run separately via `npm run dev`.
 */
function startBackend() {
    if (isDev) return;

    const backendPath = path.join(process.resourcesPath, 'backend', 'dist', 'index.js');
    backendProcess = spawn('node', [backendPath], { detached: false, stdio: 'pipe' });

    backendProcess.stdout.on('data', (d) => console.log('[Backend]', d.toString()));
    backendProcess.stderr.on('data', (d) => console.error('[Backend]', d.toString()));
}

// ── Idle Detection ────────────────────────────────────────────────────────────

/**
 * Starts polling the system idle time every IDLE_POLL_INTERVAL_MS milliseconds.
 * Emits 'idle-start' / 'idle-end' IPC events to the renderer on state changes.
 *
 * Why not use powerMonitor events directly?
 *   powerMonitor.on('user-did-become-idle') requires a threshold set globally.
 *   Polling gives us full control and is reliable across all platforms.
 */
function startIdlePolling() {
    setInterval(() => {
        // Only run if the window exists and is ready
        if (!mainWindow || mainWindow.isDestroyed()) return;

        const idleSecs = powerMonitor.getSystemIdleTime();
        const nowIdle = idleSecs >= IDLE_THRESHOLD_SECS;

        // ── Transition: Active → Idle ──────────────────────────────────────
        if (nowIdle && !isUserIdle) {
            isUserIdle = true;

            // Calculate the real moment idleness BEGAN COUNTING — i.e. the point
            // at which the 60-second grace period expired, NOT when the user
            // stopped moving. We subtract only the excess beyond the threshold.
            //
            // Example: if idleSecs = 75
            //   Grace period  = 60s  (not counted)
            //   Countable idle = 75 - 60 = 15s
            //   So startTime  = now - 15s
            //
            // This ensures the first minute of inactivity is NEVER included
            // in the idle total.
            const countableIdleSecs = idleSecs - IDLE_THRESHOLD_SECS;
            const idleStartTime = new Date(Date.now() - countableIdleSecs * 1000).toISOString();

            console.log(`[Idle] User went idle. Countable idle: ${countableIdleSecs}s, started at: ${idleStartTime}`);
            mainWindow.webContents.send('idle-start', idleStartTime);
        }

        // ── Transition: Idle → Active ──────────────────────────────────────
        if (!nowIdle && isUserIdle) {
            isUserIdle = false;
            console.log('[Idle] User became active again');
            mainWindow.webContents.send('idle-end');
        }
    }, IDLE_POLL_INTERVAL_MS);
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 720,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        titleBarStyle: 'hidden',
        webPreferences: {
            nodeIntegration: false,     // security: no direct Node access in renderer
            contextIsolation: true,     // security: renderer and preload have separate contexts
            preload: path.join(__dirname, 'preload.js'),
        },
        backgroundColor: '#0a0b0f',
        show: false, // show only after ready-to-show to avoid white flash
    });

    const startUrl = isDev
        ? 'http://localhost:5173'
        : `file://${path.join(__dirname, '../dist/index.html')}`;

    mainWindow.loadURL(startUrl);
    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.on('closed', () => { mainWindow = null; });
}

// ── App Lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
    // ── IPC: Window Controls ──────────────────────────────────────────────────
    // Register IPC handlers after the app is fully ready
    ipcMain.on('window-close', () => mainWindow && mainWindow.close());
    ipcMain.on('window-minimize', () => mainWindow && mainWindow.minimize());
    ipcMain.on('window-maximize', () => {
        if (!mainWindow) return;
        if (mainWindow.isMaximized()) mainWindow.unmaximize();
        else mainWindow.maximize();
    });

    startBackend();
    createWindow();
    startIdlePolling(); // begin monitoring system idle time

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (backendProcess) backendProcess.kill();
    if (process.platform !== 'darwin') app.quit();
});
