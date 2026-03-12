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
const { autoUpdater } = require('electron-updater');
const axios = require('axios');
const path = require('path');
const { spawn } = require('child_process');
const tracker = require('./tracking/tracker');
const screenshotScheduler = require('./tracking/screenshotScheduler');
const { URL } = require('url');

// Set the app name explicitly for the taskbar and OS integration
app.setName('YO HRMX');
// Required for Windows taskbar grouping and notifications to show the correct name
if (process.platform === 'win32') {
    app.setAppUserModelId('com.yohrmx.timetracker');
}

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
const API_BASE = process.env.API_BASE || 'https://hrmsbackend.yoforex.net/api';

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
let sessionAuthToken = null;
let disconnectIntentSent = false;

// Tracks the current shift status so main.js can act on sleep/suspend
// without waiting for the renderer (which may be too slow before network drops).
// Updated by the renderer via 'update-shift-status' IPC whenever status changes.
let currentShiftStatus = 'stopped'; // 'stopped' | 'working' | 'on_break'
let sleepBreakStarted = false;      // true if THIS sleep triggered a break

function normalizeAuthToken(token) {
    if (typeof token !== 'string') return null;
    const normalized = token.trim().replace(/^Bearer\s+/i, '');
    return normalized || null;
}

async function sendDisconnectIntent(reason) {
    if (!sessionAuthToken) return;
    if (disconnectIntentSent) return;

    disconnectIntentSent = true;

    try {
        await axios.post(
            `${API_BASE}/time/disconnect-intent`,
            {
                reason: reason || 'desktop_exit',
                disconnectedAt: new Date().toISOString(),
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${sessionAuthToken}`,
                },
                timeout: 3000,
            }
        );
        console.log('[Session] Disconnect intent sent to backend');
    } catch (err) {
        const message = err && err.message ? err.message : 'unknown error';
        console.warn('[Session] Failed to send disconnect intent:', message);
    }
}

/**
 * Calls the break-toggle endpoint directly from main.js.
 * Used on sleep/resume so the request fires BEFORE the network drops.
 * Returns true if the request succeeded.
 */
async function sendBreakToggle(context) {
    if (!sessionAuthToken) return false;
    try {
        await axios.post(
            `${API_BASE}/time/break`,
            {},
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${sessionAuthToken}`,
                },
                timeout: 4000,
            }
        );
        console.log(`[Sleep] Break toggle sent from main process (${context})`);
        return true;
    } catch (err) {
        const message = err && err.message ? err.message : 'unknown error';
        console.warn(`[Sleep] Failed to toggle break (${context}):`, message);
        return false;
    }
}

// ── OTA Updates (Configuration) ──────────────────────────────────────────────

autoUpdater.autoDownload = true; // Download silently in the background
autoUpdater.allowPrerelease = true;

// Configure logging for updates
autoUpdater.logger = console;

function sendOtaStatus(message) {
    console.log(`[OTA] ${message}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ota-status', message);
    }
}

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
        icon: path.join(__dirname, 'assets', 'icon.png'),
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

    // ── OTA Listeners ────────────────────────────────────────────────────────

    autoUpdater.on('checking-for-update', () => {
        sendOtaStatus('Checking for update...');
    });

    autoUpdater.on('update-available', (info) => {
        sendOtaStatus(`Update v${info.version} available. Downloading...`);
    });

    autoUpdater.on('update-not-available', () => {
        sendOtaStatus('App is up to date.');
    });

    autoUpdater.on('error', (err) => {
        sendOtaStatus(`Update error: ${err.message}`);
    });

    autoUpdater.on('download-progress', (progressObj) => {
        const msg = `Downloading: ${Math.round(progressObj.percent)}%`;
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('ota-status', msg);
        }
    });

    autoUpdater.on('update-downloaded', (info) => {
        sendOtaStatus('Update ready to install.');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('ota-update-ready', info.version);
        }
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
    ipcMain.handle('get-app-usage', async () => {
        return usageMonitor.getUsageData();
    });

    ipcMain.handle('get-app-version', () => {
        return app.getVersion();
    });

    ipcMain.on('clear-app-usage', () => {
        tracker.clearTrackingData();
    });

    ipcMain.on('set-tracker-auth-token', (_event, token) => {
        if (typeof token !== 'string') return;
        tracker.setAuthToken(token);
        screenshotScheduler.setAuthToken(token);
        sessionAuthToken = normalizeAuthToken(token);
        disconnectIntentSent = false;
    });

    ipcMain.on('clear-tracker-auth-token', () => {
        tracker.clearAuthToken();
        screenshotScheduler.clearAuthToken();
        sessionAuthToken = null;
        disconnectIntentSent = false;
    });

    // ── IPC: Shift Status Sync ────────────────────────────────────────────────
    // Renderer sends current shift status on every change so main.js always
    // knows whether the user is working/on_break/stopped before a suspend fires.
    ipcMain.on('update-shift-status', (_event, status) => {
        if (typeof status === 'string') {
            currentShiftStatus = status;
            console.log(`[Sleep] Shift status updated to '${currentShiftStatus}'`);
        }
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
        const loginUrl = new URL('https://hrms.yoforex.net/login');
        loginUrl.searchParams.set('desktopCode', String(deviceCode));
        loginUrl.searchParams.set('returnTo', 'desktop');
        shell.openExternal(loginUrl.toString());
        console.log('[Auth] Opened browser login with deviceCode:', deviceCode);
    });

    ipcMain.on('open-dashboard', () => {
        shell.openExternal('https://hrms.yoforex.net/dashboard');
        console.log('[Auth] Opened browser dashboard');
    });

    ipcMain.on('restart-app', () => {
        console.log('[OTA] Restart and install triggered');
        // quitAndInstall(isSilent, isForceRunAfter)
        autoUpdater.quitAndInstall(true, true);
    });

    createWindow();

    // ── OTA Check Logic ──────────────────────────────────────────────────────

    // 1. Check immediately on startup (after window is ready)
    setTimeout(() => {
        console.log('[OTA] Running initial startup check...');
        autoUpdater.checkForUpdates().catch(err => console.error('[OTA] Startup check failed:', err));
    }, 5000);

    // 2. Periodic background check every 60 minutes
    const ONE_HOUR = 60 * 60 * 1000;
    setInterval(() => {
        console.log('[OTA] Running periodic hourly check...');
        autoUpdater.checkForUpdates().catch(err => console.error('[OTA] Periodic check failed:', err));
    }, ONE_HOUR);

    startIdlePolling();        // begin monitoring system idle time
    startScreenLockDetection(); // begin monitoring screen lock/unlock

    app.on('before-quit', () => {
        void sendDisconnectIntent('before_quit');
    });

    // ── OTA: Kill backend before update installs ──────────────────────────────
    // electron-updater fires this event just before quitAndInstall() hands
    // control to the installer. Killing the backend here frees any file locks
    // so Windows can overwrite the core files during the update.
    app.on('before-quit-for-update', () => {
        console.log('[OTA] Quitting for update — stopping backend process');
        if (backendProcess) {
            backendProcess.kill();
            backendProcess = null;
        }
    });

    powerMonitor.on('shutdown', () => {
        void sendDisconnectIntent('system_shutdown');
    });

    // ── Sleep / Resume Detection ─────────────────────────────────────────────
    // IMPORTANT: These are SEPARATE from 'shutdown':
    //   shutdown → disconnect-intent → 5-min grace → auto clock-out (unchanged)
    //   suspend  → break toggle called DIRECTLY via axios (no renderer involvement)
    //   resume   → break toggle called DIRECTLY via axios to end the sleep break
    //
    // We call the API from main.js (not the renderer) because the network
    // is still available at this point, whereas the renderer's async HTTP
    // call often fails after the network drops during suspend.
    powerMonitor.on('suspend', async () => {
        console.log('[Sleep] System suspending');

        // Only auto-break if the user is actively working and below limit.
        // Break limit check is skipped here (backend enforces it anyway and
        // will return 400 if exceeded — we check the result).
        if (currentShiftStatus !== 'working') {
            console.log(`[Sleep] Status is '${currentShiftStatus}' — skipping sleep break`);
            return;
        }

        const ok = await sendBreakToggle('suspend');
        sleepBreakStarted = ok; // only set flag if the API call succeeded

        // Also tell the renderer so the UI reflects the break immediately
        if (ok && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('sleep-break-started');
        }
    });

    powerMonitor.on('resume', async () => {
        console.log('[Sleep] System resumed from sleep');

        if (!sleepBreakStarted) {
            console.log('[Sleep] No sleep break was started — nothing to end');
            return;
        }

        sleepBreakStarted = false;
        const ok = await sendBreakToggle('resume');

        // Tell renderer to re-sync status from backend
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('sleep-break-ended', ok);
        }
    });


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
