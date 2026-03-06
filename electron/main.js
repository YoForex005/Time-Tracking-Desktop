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

process.noDeprecation = true; // Hides non-critical node warnings (like url.parse)

const { app, BrowserWindow, ipcMain, powerMonitor, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const tracker = require('./tracking/tracker');
const screenshotScheduler = require('./tracking/screenshotScheduler');
const { URL } = require('url');

// ── Custom Protocol (Deep-Link Auth) ──────────────────────────────────────────
// Register workfolio:// as the app's custom URL scheme so the OS can hand
// browser-to-desktop callbacks back to us after the user authenticates.
// Must be called before app is ready.
const DEEP_LINK_PROTOCOL = 'workfolio';
if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
} else {
    app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL);
}

// Keep a single desktop instance so deep-link callbacks always target
// the existing app window instead of launching a second copy.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
    app.quit();
}

// ── Constants ─────────────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

/**
 * Idle threshold in seconds — mutable so the renderer can push the
 * admin-configured per-user value after login via the 'set-idle-threshold' IPC.
 * Default: 60s (matches the previous hardcoded value).
 */
let IDLE_THRESHOLD_SECS = 60; // NOTE: updated dynamically via IPC after login

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
let pendingAuthCallbackUrl = null;

/**
 * Whether the user is currently considered idle.
 * Tracks state so we only emit events on transitions, not on every poll.
 */
let isUserIdle = false;

/**
 * Whether the screen is currently locked (Win+L or screensaver lock).
 * While locked, idle polling is suppressed — the break itself accounts for
 * the time, so we don't want to double-count it as idle time too.
 */
let isScreenLocked = false;

function extractDeepLink(argv) {
    return argv.find((arg) => typeof arg === 'string' && arg.startsWith(`${DEEP_LINK_PROTOCOL}://`)) ?? null;
}

function focusMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
}

function dispatchAuthCallback(url) {
    if (!url) return;
    if (!mainWindow || mainWindow.isDestroyed()) {
        pendingAuthCallbackUrl = url;
        return;
    }
    mainWindow.webContents.send('auth-callback', { url });
}

function handleDeepLink(rawUrl) {
    if (!rawUrl) return;
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== `${DEEP_LINK_PROTOCOL}:`) return;

        console.log('[Auth] Deep link received:', rawUrl);
        focusMainWindow();
        dispatchAuthCallback(rawUrl);
    } catch (err) {
        console.warn('[Auth] Failed to parse deep link:', rawUrl, err);
    }
}

if (gotSingleInstanceLock) {
    app.on('second-instance', (_event, commandLine) => {
        const deepLink = extractDeepLink(commandLine);
        if (deepLink) {
            handleDeepLink(deepLink);
            return;
        }
        focusMainWindow();
    });
}

app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
});

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

        // Suppress idle tracking while the screen is locked.
        // The break (started by screen-lock) already accounts for this time.
        // Counting idle on top of a lock-break would double-count inactivity.
        if (isScreenLocked) return;

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

// ── Screen Lock Detection ─────────────────────────────────────────────────────

/**
 * Listens for OS-level screen lock and unlock events.
 *
 * Behaviour:
 *   - Screen LOCKED  → notify renderer (it will start a break if user is working)
 *   - Screen UNLOCKED → notify renderer (it will end the break if it was lock-initiated)
 *
 * We also flip `isScreenLocked` so the idle poller knows to pause
 * itself — no point tracking idle time while the user is already on a
 * lock-break.
 */
function startScreenLockDetection() {
    powerMonitor.on('lock-screen', () => {
        isScreenLocked = true;

        // If the user was idle when they locked, clear that state.
        // The lock-break will cover this period going forward.
        if (isUserIdle) {
            isUserIdle = false;
            // Tell renderer to end the idle session cleanly before break starts
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('idle-end');
            }
        }

        console.log('[ScreenLock] Screen locked — notifying renderer to start break');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('screen-locked');
        }
    });

    powerMonitor.on('unlock-screen', () => {
        isScreenLocked = false;
        console.log('[ScreenLock] Screen unlocked — notifying renderer to end break');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('screen-unlocked');
        }
    });
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 480,
        height: 500,
        minWidth: 420,
        minHeight: 420,
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
    mainWindow.webContents.on('did-finish-load', () => {
        if (!pendingAuthCallbackUrl || !mainWindow || mainWindow.isDestroyed()) return;
        const url = pendingAuthCallbackUrl;
        pendingAuthCallbackUrl = null;
        mainWindow.webContents.send('auth-callback', { url });
    });
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        // Start silent application tracking
        tracker.startTracking(mainWindow);
        // Start silent periodic screenshot scheduler
        screenshotScheduler.start();
    });
    mainWindow.on('closed', () => {
        tracker.stopTracking();
        screenshotScheduler.stop();
        mainWindow = null;
    });
}

// ── App Lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
    if (!gotSingleInstanceLock) return;
    // ── IPC: Window Controls ──────────────────────────────────────────────────
    // Register IPC handlers after the app is fully ready
    ipcMain.on('window-close', () => mainWindow && mainWindow.close());
    ipcMain.on('window-minimize', () => mainWindow && mainWindow.minimize());
    ipcMain.on('window-maximize', () => {
        if (!mainWindow) return;
        if (mainWindow.isMaximized()) mainWindow.unmaximize();
        else mainWindow.maximize();
    });

    // ── IPC: App Tracker ──────────────────────────────────────────────────────
    ipcMain.handle('get-app-usage', () => {
        return tracker.getCurrentData();
    });

    ipcMain.on('clear-app-usage', () => {
        tracker.clearTrackingData();
    });

    ipcMain.on('set-tracker-auth-token', (_event, token) => {
        if (typeof token !== 'string') return;
        tracker.setAuthToken(token);
        screenshotScheduler.setAuthToken(token);
    });

    ipcMain.on('clear-tracker-auth-token', () => {
        tracker.clearAuthToken();
        screenshotScheduler.clearAuthToken();
    });

    // ── IPC: Dynamic Idle Threshold (NEW — Admin Portal) ─────────────────────
    // Called by the renderer after login with the admin-set value for this user.
    ipcMain.on('set-idle-threshold', (_event, seconds) => {
        if (typeof seconds === 'number' && seconds >= 10) {
            IDLE_THRESHOLD_SECS = Math.round(seconds);
            console.log(`[Idle] Threshold updated by admin to ${IDLE_THRESHOLD_SECS}s`);
        }
    });

    ipcMain.on('set-screenshot-interval', (_event, seconds) => {
        if (typeof seconds === 'number' && seconds >= 60 && seconds <= 3600) {
            screenshotScheduler.setIntervalSecs(Math.round(seconds));
        }
    });

    // ── IPC: Open Login in System Browser (Device Flow) ─────────────────────
    // Renderer sends the one-time deviceCode it generated.
    // We embed it as ?desktopCode=<uuid> so the website POSTs the session
    // to the backend by that code. The renderer polls the backend every 2s.
    ipcMain.on('open-login', (_event, deviceCode) => {
        const loginUrl = new URL('http://localhost:3000/login');
        loginUrl.searchParams.set('desktopCode', String(deviceCode));
        loginUrl.searchParams.set('returnTo', 'desktop');
        shell.openExternal(loginUrl.toString());
        console.log('[Auth] Opened browser login with deviceCode:', deviceCode);
    });

    ipcMain.on('open-dashboard', () => {
        shell.openExternal('http://localhost:3000/dashboard');
        console.log('[Auth] Opened browser dashboard');
    });

    createWindow();

    startIdlePolling();        // begin monitoring system idle time
    startScreenLockDetection(); // begin monitoring screen lock/unlock

    // On Windows/Linux cold-start via protocol, deep link is passed in argv.
    const startupDeepLink = extractDeepLink(process.argv);
    if (startupDeepLink) {
        handleDeepLink(startupDeepLink);
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    tracker.stopTracking();
    screenshotScheduler.stop();
    if (backendProcess) backendProcess.kill();
    if (process.platform !== 'darwin') app.quit();
});
