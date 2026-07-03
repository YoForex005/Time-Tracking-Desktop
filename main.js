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

const { app, BrowserWindow, ipcMain, powerMonitor, shell, Notification, screen } = require('electron');
const { autoUpdater } = require('electron-updater');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const tracker = require('./tracking/tracker');
const screenshotScheduler = require('./tracking/screenshotScheduler');
const wfhScreenMonitor = require('./tracking/wfhScreenMonitor');
const { URL } = require('url');

function loadLocalEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) return;

    const envText = fs.readFileSync(envPath, 'utf8');
    for (const line of envText.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIndex = trimmed.indexOf('=');
        if (eqIndex <= 0) continue;

        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}

loadLocalEnv();

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Set the app name explicitly for the taskbar and OS integration
app.setName('YO HRMX');
// Required for Windows taskbar grouping and notifications to show the correct name
if (process.platform === 'win32') {
    app.setAppUserModelId(isDev ? process.execPath : 'com.yohrmx.timetracker');
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

const PRODUCTION_API_BASE = 'https://hrmsbackend.yoforex.net/api';
const PRODUCTION_WEB_APP_URL = 'https://hrms.yoforex.net';
const API_BASE = isDev ? (process.env.API_BASE || 'http://127.0.0.1:3005/api') : PRODUCTION_API_BASE;
const WEB_APP_URL = isDev ? (process.env.WEB_APP_URL || 'http://localhost:3000') : PRODUCTION_WEB_APP_URL;
console.log(`[Config] API_BASE=${API_BASE}`);
console.log(`[Config] WEB_APP_URL=${WEB_APP_URL}`);

/**
 * Idle threshold in seconds — mutable so the renderer can push the
 * admin-configured per-user value after login via the 'set-idle-threshold' IPC.
 * Default: 60s (matches the previous hardcoded value).
 */
let IDLE_THRESHOLD_SECS = 60;            // hardware (input) idle — updated via IPC after login
let WFH_SCREEN_IDLE_THRESHOLD_SECS = 240; // screen static idle — independent setting, updated via IPC

let wfhConfig = {
    intervalMs: 15000,
    width: 160,
    height: 90
};

/**
 * How often (ms) we poll the system idle time.
 *
 * Kept at 1 second so that when the user moves the mouse or presses a key,
 * the transition back to "active" is detected almost instantly.
 * powerMonitor.getSystemIdleTime() is a lightweight OS call — polling every
 * second has negligible CPU impact.
 */
const IDLE_POLL_INTERVAL_MS = 1_000; // 1 second
const HEARTBEAT_INTERVAL_MS = 20_000;
const DEFAULT_BREAK_REMINDER_AFTER_SECS = 1800;
const DEFAULT_BREAK_REMINDER_REPEAT_SECS = 300;

// ── State ─────────────────────────────────────────────────────────────────────

let mainWindow = null;
let backendProcess = null;
let pendingAuthCallbackUrl = null;
let sessionAuthToken = null;
let disconnectIntentSent = false;
let exitIntentInProgress = false;
let forceQuitAfterExitIntent = false;
let quittingForUpdate = false;

// Tracks the current shift status so main.js can act on sleep/suspend
// without waiting for the renderer (which may be too slow before network drops).
// Updated by the renderer via 'update-shift-status' IPC whenever status changes.
let currentShiftStatus = 'stopped'; // 'stopped' | 'working' | 'on_break'
let sleepBreakStarted = false;      // true if THIS sleep triggered a break
let breakReminderTimeout = null;
let activeBreakReminder = null;
let breakReminderWindow = null;
let overtimePromptWindow = null;
let overtimePromptFocusInterval = null;
let overtimePromptActionEmitted = false;
let overtimePromptCloseAllowed = false;
let lastOvertimePrompt = { workSecs: 28800, breakSecs: 3600 };
let lastOvertimeStatus = null;
let overtimePromptedShiftId = null;
let overtimeAcceptedShiftId = null;
let lastBreakReminderNotificationAt = 0;
let isWfhMode = false;              // true when active shift has workLocation === 'wfh'
let heartbeatTimer = null;
let heartbeatInFlight = false;
let lastOpenedLoginCode = null;
let lastOpenedLoginAt = 0;

const OVERTIME_PROMPT_WIDTH = 590;
const OVERTIME_PROMPT_HEIGHT = 625;

function normalizeAuthToken(token) {
    if (typeof token !== 'string') return null;
    const normalized = token.trim().replace(/^Bearer\s+/i, '');
    return normalized || null;
}

function formatLocalIsoWithOffset(date = new Date()) {
    const pad = (value, size = 2) => String(value).padStart(size, '0');
    const offsetMinutes = -date.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absOffset = Math.abs(offsetMinutes);
    const offsetHours = Math.floor(absOffset / 60);
    const offsetMins = absOffset % 60;

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
        `.${pad(date.getMilliseconds(), 3)}${sign}${pad(offsetHours)}:${pad(offsetMins)}`;
}

function buildClientTimestampPayload(date = new Date()) {
    return {
        clientLocalTime: formatLocalIsoWithOffset(date),
        clientTimezoneOffsetMinutes: date.getTimezoneOffset(),
        clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
}

async function sendDisconnectIntent(reason, options = {}) {
    const timeoutMs = options.timeoutMs || 3000;

    if (!sessionAuthToken) return false;
    if (disconnectIntentSent) return true;

    disconnectIntentSent = true;

    try {
        const eventTime = new Date();
        await axios.post(
            `${API_BASE}/time/disconnect-intent`,
            {
                reason: reason || 'desktop_exit',
                disconnectedAt: formatLocalIsoWithOffset(eventTime),
                ...buildClientTimestampPayload(eventTime),
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${sessionAuthToken}`,
                },
                timeout: timeoutMs,
            }
        );
        console.log('[Session] Disconnect intent sent to backend');
        return true;
    } catch (err) {
        const message = err && err.message ? err.message : 'unknown error';
        console.warn('[Session] Failed to send disconnect intent:', message);
        return false;
    }
}

function shouldSendExitIntent() {
    return !!sessionAuthToken;
}

function sendExitIntentThenQuit(reason, options = {}) {
    if (exitIntentInProgress) return;

    exitIntentInProgress = true;
    stopHeartbeatLoop();

    void sendDisconnectIntent(reason, { timeoutMs: options.timeoutMs || 2500 })
        .finally(() => {
            forceQuitAfterExitIntent = true;
            app.quit();
        });
}

async function sendHeartbeatPing(context = 'interval') {
    if (!sessionAuthToken) return false;
    if (currentShiftStatus !== 'working' && currentShiftStatus !== 'on_break') return false;
    if (heartbeatInFlight) return false;

    heartbeatInFlight = true;

    try {
        const eventTime = new Date();
        await axios.post(
            `${API_BASE}/time/heartbeat`,
            buildClientTimestampPayload(eventTime),
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${sessionAuthToken}`,
                },
                timeout: 4000,
            }
        );
        console.log(`[Heartbeat] Sent from main process (${context})`);
        return true;
    } catch (err) {
        const message = err && err.message ? err.message : 'unknown error';
        console.warn(`[Heartbeat] Failed from main process (${context}):`, message);
        return false;
    } finally {
        heartbeatInFlight = false;
    }
}

function stopHeartbeatLoop() {
    if (!heartbeatTimer) return;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    console.log('[Heartbeat] Main-process heartbeat stopped');
}

function syncHeartbeatLoop() {
    const shouldRun =
        !!sessionAuthToken &&
        (currentShiftStatus === 'working' || currentShiftStatus === 'on_break');

    if (!shouldRun) {
        stopHeartbeatLoop();
        return;
    }

    void sendHeartbeatPing(heartbeatTimer ? 'status-sync' : 'start');

    if (heartbeatTimer) return;

    heartbeatTimer = setInterval(() => {
        void sendHeartbeatPing();
    }, HEARTBEAT_INTERVAL_MS);
    console.log('[Heartbeat] Main-process heartbeat started');
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
            buildClientTimestampPayload(),
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
// Stable builds should use GitHub's latest-release endpoint. Enabling prerelease
// makes electron-updater trust the releases Atom feed, which can be misordered
// if a tag/release has an incorrect future date.
autoUpdater.allowPrerelease = false;

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

function bringMainWindowToFront() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.show();
    if (typeof mainWindow.moveTop === 'function') {
        mainWindow.moveTop();
    }
    if (process.platform === 'darwin') app.focus({ steal: true });
    mainWindow.focus();
    mainWindow.flashFrame(true);

    setTimeout(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.setAlwaysOnTop(false);
        mainWindow.flashFrame(false);
    }, 1500);
}

function formatDurationForNotification(seconds) {
    const totalSecs = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function showBreakReminderNotification(breakSecs) {
    if (!Notification.isSupported()) {
        console.warn('[BreakReminder] Native notifications are not supported on this system.');
        return false;
    }

    const body = Number.isFinite(Number(breakSecs))
        ? `Your current break has been running for ${formatDurationForNotification(breakSecs)}.`
        : 'Your current break is still running.';

    const notification = new Notification({
        title: 'You are still on break',
        body,
        icon: path.join(__dirname, 'assets', 'icon.png'),
        silent: false,
        timeoutType: 'default',
    });

    notification.on('show', () => {
        console.log('[BreakReminder] Native notification shown.');
    });
    notification.on('failed', (_event, error) => {
        console.warn('[BreakReminder] Native notification failed:', error);
    });
    notification.on('click', bringMainWindowToFront);
    notification.show();
    return true;
}

function handleBreakReminder(breakSecs, focusWindow = true) {
    const now = Date.now();
    const shouldShowNotification = now - lastBreakReminderNotificationAt >= 5000;

    showBreakReminderPopupWindow(breakSecs);

    if (!shouldShowNotification) {
        console.log('[BreakReminder] Ignoring duplicate native reminder request');
    } else {
        lastBreakReminderNotificationAt = now;

        try {
            showBreakReminderNotification(breakSecs);
        } catch (err) {
            console.warn('[BreakReminder] Failed to show native notification:', err);
        }
    }

    if (!focusWindow) return;

    try {
        bringMainWindowToFront();
    } catch (err) {
        console.warn('[BreakReminder] Failed to bring main window to front:', err);
    }
}

function buildBreakReminderPopupHtml(breakSecs) {
    const initialBreakSecs = Math.max(0, Math.floor(Number(breakSecs) || 0));

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: transparent;
      user-select: none;
    }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      background: rgba(15, 23, 42, 0.18);
      backdrop-filter: blur(2px);
    }
    .card {
      width: 100%;
      max-width: 520px;
      background: rgba(255, 255, 255, 0.98);
      border: 1px solid rgba(226, 232, 240, 0.95);
      border-radius: 28px;
      box-shadow: 0 28px 80px rgba(15, 23, 42, 0.24);
      padding: 44px 44px 36px;
      text-align: center;
    }
    .icon {
      width: 86px;
      height: 86px;
      border-radius: 50%;
      margin: 0 auto 26px;
      background: linear-gradient(135deg, #ffedd5, #fed7aa);
      color: #ea580c;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 18px 36px rgba(249, 115, 22, 0.22);
      font-size: 46px;
      font-weight: 800;
    }
    h1 {
      margin: 0 0 12px;
      color: #0f172a;
      font-size: 27px;
      line-height: 1.2;
      letter-spacing: 0;
      font-weight: 800;
    }
    p {
      margin: 0 0 28px;
      color: #64748b;
      font-size: 17px;
      font-weight: 500;
    }
    .timer {
      border: 1px solid #fdba74;
      border-radius: 22px;
      background: rgba(255, 247, 237, 0.78);
      padding: 28px 20px 24px;
      margin-bottom: 34px;
    }
    .time {
      color: #ea580c;
      font-size: 54px;
      line-height: 1;
      letter-spacing: 0;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    .label {
      margin-top: 16px;
      color: #9a3412;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
    }
    button {
      border: 0;
      border-radius: 19px;
      height: 60px;
      font-size: 18px;
      font-weight: 800;
      cursor: pointer;
    }
    #dismiss {
      background: #f1f5f9;
      color: #475569;
    }
    #resume {
      background: #475569;
      color: #fff;
      box-shadow: 0 16px 34px rgba(71, 85, 105, 0.24);
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="icon">&#9749;</div>
    <h1>You are still on break</h1>
    <p>Your current break has been running for</p>
    <section class="timer">
      <div id="time" class="time">00:00:00</div>
      <div class="label">Break duration</div>
    </section>
    <div class="actions">
      <button id="dismiss">Dismiss</button>
      <button id="resume">Resume</button>
    </div>
  </main>
  <script>
    const { ipcRenderer } = require('electron');
    let elapsedSecs = ${initialBreakSecs};
    function formatDuration(totalSecs) {
      const hours = Math.floor(totalSecs / 3600);
      const minutes = Math.floor((totalSecs % 3600) / 60);
      const seconds = totalSecs % 60;
      return String(hours).padStart(2, '0') + ':' +
        String(minutes).padStart(2, '0') + ':' +
        String(seconds).padStart(2, '0');
    }
    function render() {
      document.getElementById('time').textContent = formatDuration(elapsedSecs);
    }
    document.getElementById('dismiss').addEventListener('click', () => {
      ipcRenderer.send('break-reminder-popup-dismiss');
    });
    document.getElementById('resume').addEventListener('click', () => {
      ipcRenderer.send('break-reminder-popup-resume');
    });
    render();
    setInterval(() => {
      elapsedSecs += 1;
      render();
    }, 1000);
  </script>
</body>
</html>`;
}

function closeBreakReminderPopupWindow() {
    if (!breakReminderWindow || breakReminderWindow.isDestroyed()) {
        breakReminderWindow = null;
        return;
    }
    const win = breakReminderWindow;
    breakReminderWindow = null;
    win.close();
}

function focusBreakReminderPopupWindow() {
    if (!breakReminderWindow || breakReminderWindow.isDestroyed()) return false;
    breakReminderWindow.setAlwaysOnTop(true, 'screen-saver');
    breakReminderWindow.show();
    if (typeof breakReminderWindow.moveTop === 'function') {
        breakReminderWindow.moveTop();
    }
    breakReminderWindow.focus();
    breakReminderWindow.flashFrame(true);
    return true;
}

function showBreakReminderPopupWindow(breakSecs) {
    if (focusBreakReminderPopupWindow()) return;

    breakReminderWindow = new BrowserWindow({
        width: 560,
        height: 580,
        show: false,
        frame: false,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        focusable: true,
        transparent: true,
        backgroundColor: '#00000000',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false,
            backgroundThrottling: false,
        },
    });

    breakReminderWindow.setAlwaysOnTop(true, 'screen-saver');
    if (typeof breakReminderWindow.setVisibleOnAllWorkspaces === 'function') {
        breakReminderWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }

    breakReminderWindow.once('ready-to-show', () => {
        if (!breakReminderWindow || breakReminderWindow.isDestroyed()) return;
        focusBreakReminderPopupWindow();
    });

    breakReminderWindow.on('closed', () => {
        breakReminderWindow = null;
    });

    breakReminderWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildBreakReminderPopupHtml(breakSecs))}`);
}

function formatDurationLabelForPopup(seconds) {
    const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const parts = [];
    if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
    return parts.length > 0 ? parts.join(' ') : '0 minutes';
}

function escapeXml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function getActiveWindowBounds() {
    try {
        const activeWin = require('active-win');
        const win = typeof activeWin.sync === 'function'
            ? activeWin.sync({ screenRecordingPermission: false })
            : null;
        const bounds = win?.bounds;
        if (
            bounds &&
            Number.isFinite(bounds.x) &&
            Number.isFinite(bounds.y) &&
            Number.isFinite(bounds.width) &&
            Number.isFinite(bounds.height) &&
            bounds.width > 0 &&
            bounds.height > 0
        ) {
            return bounds;
        }
    } catch (err) {
        console.warn('[Overtime] Failed to read active window bounds:', err.message);
    }
    return null;
}

function getOvertimePromptDisplay(activeBounds = getActiveWindowBounds()) {
    return activeBounds
        ? screen.getDisplayMatching(activeBounds)
        : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function getOvertimePromptWindowBounds() {
    const activeBounds = getActiveWindowBounds();
    const display = getOvertimePromptDisplay(activeBounds);
    const area = display.bounds || display.workArea;

    return {
        x: area.x,
        y: area.y,
        width: Math.max(OVERTIME_PROMPT_WIDTH, area.width),
        height: Math.max(OVERTIME_PROMPT_HEIGHT, area.height),
    };
}

function getNativeWindowHandleText(win) {
    if (!win || win.isDestroyed()) return null;
    const handleBuffer = win.getNativeWindowHandle();
    if (!handleBuffer || handleBuffer.length === 0) return null;

    if (handleBuffer.length >= 8 && typeof handleBuffer.readBigUInt64LE === 'function') {
        return handleBuffer.readBigUInt64LE(0).toString();
    }

    return String(handleBuffer.readUInt32LE(0));
}

function forceNativeWindowToFront(win, label = 'Window', activate = false) {
    if (process.platform !== 'win32' || !win || win.isDestroyed()) return;

    const handleText = getNativeWindowHandleText(win);
    if (!handleText) return;
    const safeHandleText = String(handleText).replace(/[^\d]/g, '');
    if (!safeHandleText) return;

    const script = `
$Handle = [Int64]${safeHandleText}
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class YoHrmxForeground {
    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, UInt32 uFlags);
    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern IntPtr SetActiveWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool AllowSetForegroundWindow(int dwProcessId);
    [DllImport("user32.dll")]
    public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);
}
"@
$hWnd = [IntPtr]::new($Handle)
$HWND_TOPMOST = [IntPtr]::new(-1)
$ASFW_ANY = -1
$SW_SHOW = 5
$SW_SHOWNOACTIVATE = 4
$SWP_NOSIZE = 0x0001
$SWP_NOMOVE = 0x0002
$SWP_NOACTIVATE = 0x0010
$SWP_SHOWWINDOW = 0x0040
[YoHrmxForeground]::ShowWindowAsync($hWnd, ${activate ? '$SW_SHOW' : '$SW_SHOWNOACTIVATE'}) | Out-Null
[YoHrmxForeground]::SetWindowPos($hWnd, $HWND_TOPMOST, 0, 0, 0, 0, $SWP_NOMOVE -bor $SWP_NOSIZE -bor $SWP_SHOWWINDOW${activate ? '' : ' -bor $SWP_NOACTIVATE'}) | Out-Null
${activate ? `[YoHrmxForeground]::AllowSetForegroundWindow($ASFW_ANY) | Out-Null
[YoHrmxForeground]::BringWindowToTop($hWnd) | Out-Null
[YoHrmxForeground]::SetActiveWindow($hWnd) | Out-Null
[YoHrmxForeground]::SetForegroundWindow($hWnd) | Out-Null
[YoHrmxForeground]::SwitchToThisWindow($hWnd, $true) | Out-Null
try { (New-Object -ComObject WScript.Shell).AppActivate("Overtime Prompt") | Out-Null } catch {}` : ''}
`;

    execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { windowsHide: true, timeout: 3000 },
        (err, _stdout, stderr) => {
            if (err) {
                console.warn(`[${label}] Native foreground request failed:`, err.message);
            } else if (stderr && String(stderr).trim()) {
                console.warn(`[${label}] Native foreground warning:`, String(stderr).trim());
            }
        }
    );
}

function buildOvertimePromptPopupHtml(workSecs = 28800, breakSecs = 3600) {
    const workLabel = formatDurationForNotification(workSecs);
    const breakLabel = formatDurationForNotification(breakSecs);

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: transparent;
      user-select: none;
    }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(15, 23, 42, 0.72);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .card {
      width: 100%;
      max-width: 560px;
      background: rgba(255, 255, 255, 0.98);
      border: 1px solid rgba(226, 232, 240, 0.95);
      border-radius: 28px;
      box-shadow: 0 28px 80px rgba(15, 23, 42, 0.24);
      padding: 44px 46px 36px;
      text-align: center;
    }
    .icon {
      width: 78px;
      height: 78px;
      border-radius: 50%;
      margin: 0 auto 26px;
      background: linear-gradient(135deg, #dbeafe, #bfdbfe);
      color: #2563eb;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 18px 36px rgba(37, 99, 235, 0.2);
      font-size: 40px;
      font-weight: 800;
    }
    h1 {
      margin: 0 0 24px;
      color: #0f172a;
      font-size: 40px;
      line-height: 1.35;
      letter-spacing: 0;
      font-weight: 900;
    }
    p {
      margin: 0 0 32px;
      color: #64748b;
      font-size: 24px;
      line-height: 1.55;
      font-weight: 500;
    }
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
    }
    button {
      border: 0;
      border-radius: 18px;
      height: 66px;
      font-size: 18px;
      font-weight: 800;
      cursor: pointer;
    }
    button:disabled {
      cursor: wait;
      opacity: 0.72;
    }
    #no {
      background: #f1f5f9;
      color: #475569;
    }
    #yes {
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: #fff;
      box-shadow: 0 16px 34px rgba(37, 99, 235, 0.24);
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="icon">&#9201;</div>
    <h1>Do you want to<br>start<br>OverTime?</h1>
    <p>You have completed ${workLabel} of work<br>and ${breakLabel} of break.</p>
    <div class="actions">
      <button id="no">No</button>
      <button id="yes">Yes</button>
    </div>
  </main>
  <script>
    const { ipcRenderer } = require('electron');
    const noButton = document.getElementById('no');
    const yesButton = document.getElementById('yes');
    let decisionSent = false;

    function sendDecision(action) {
      if (decisionSent) return;
      decisionSent = true;
      noButton.disabled = true;
      yesButton.disabled = true;
      if (action === 'no') noButton.textContent = 'Saving...';
      if (action === 'yes') yesButton.textContent = 'Saving...';
      ipcRenderer.send(action === 'yes' ? 'overtime-prompt-yes' : 'overtime-prompt-no');
    }

    noButton.addEventListener('click', () => sendDecision('no'));
    yesButton.addEventListener('click', () => sendDecision('yes'));
  </script>
</body>
</html>`;
}

function closeOvertimePromptWindow() {
    stopOvertimePromptFocusPulse();
    if (!overtimePromptWindow || overtimePromptWindow.isDestroyed()) {
        overtimePromptWindow = null;
        return;
    }
    const win = overtimePromptWindow;
    overtimePromptWindow = null;
    overtimePromptCloseAllowed = true;
    win.close();
}

function stopOvertimePromptFocusPulse() {
    if (!overtimePromptFocusInterval) return;
    clearInterval(overtimePromptFocusInterval);
    overtimePromptFocusInterval = null;
}

function raiseOvertimePromptWindow(forceNative = false) {
    if (!overtimePromptWindow || overtimePromptWindow.isDestroyed()) return false;

    const popupBounds = getOvertimePromptWindowBounds();
    console.log('[Overtime] Raising prompt window', { forceNative, popupBounds });
    overtimePromptWindow.setBounds(popupBounds, false);

    if (overtimePromptWindow.isMinimized()) {
        overtimePromptWindow.restore();
    }

    if (typeof overtimePromptWindow.setFocusable === 'function') {
        overtimePromptWindow.setFocusable(true);
    }
    overtimePromptWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    if (typeof overtimePromptWindow.setVisibleOnAllWorkspaces === 'function') {
        overtimePromptWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
    overtimePromptWindow.show();
    overtimePromptWindow.setAlwaysOnTop(false);
    overtimePromptWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    if (typeof overtimePromptWindow.moveTop === 'function') {
        overtimePromptWindow.moveTop();
    }
    if (process.platform === 'darwin') {
        app.focus({ steal: true });
    }
    overtimePromptWindow.focus();
    overtimePromptWindow.flashFrame(true);
    if (forceNative) {
        forceNativeWindowToFront(overtimePromptWindow, 'Overtime', true);
    }
    return true;
}

function focusOvertimePromptWindow() {
    if (!overtimePromptWindow || overtimePromptWindow.isDestroyed()) return false;

    stopOvertimePromptFocusPulse();
    let attempts = 0;
    const pulse = () => {
        attempts += 1;
        const shouldForceNative = attempts === 1 || attempts === 4 || attempts === 8 || attempts === 12;
        if (!raiseOvertimePromptWindow(shouldForceNative) || attempts >= 12) {
            stopOvertimePromptFocusPulse();
        }
    };

    pulse();
    overtimePromptFocusInterval = setInterval(pulse, 250);
    return true;
}

function emitOvertimePromptAction(action) {
    if (action !== 'yes' && action !== 'no') return false;
    if (overtimePromptActionEmitted) return false;

    overtimePromptActionEmitted = true;

    if (action === 'yes' && lastOvertimeStatus?.currentShiftId) {
        overtimeAcceptedShiftId = lastOvertimeStatus.currentShiftId;
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`overtime-prompt-${action}`);
    }

    closeOvertimePromptWindow();
    return true;
}

function showOvertimePromptWindow(workSecs = 28800, breakSecs = 3600) {
    lastOvertimePrompt = { workSecs, breakSecs };
    if (focusOvertimePromptWindow()) return true;

    const popupBounds = getOvertimePromptWindowBounds();
    console.log('[Overtime] Creating prompt window', { workSecs, breakSecs, popupBounds });
    overtimePromptActionEmitted = false;
    overtimePromptCloseAllowed = false;
    try {
        overtimePromptWindow = new BrowserWindow({
            ...popupBounds,
            title: 'Overtime Prompt',
            show: false,
            frame: false,
            resizable: false,
            minimizable: false,
            maximizable: false,
            fullscreenable: false,
            skipTaskbar: false,
            alwaysOnTop: true,
            focusable: true,
            acceptFirstMouse: true,
            transparent: true,
            hasShadow: true,
            backgroundColor: '#00000000',
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                sandbox: false,
                backgroundThrottling: false,
            },
        });
    } catch (err) {
        console.warn('[Overtime] Failed to create prompt window:', err);
        overtimePromptWindow = null;
        return false;
    }

    overtimePromptWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    if (typeof overtimePromptWindow.setVisibleOnAllWorkspaces === 'function') {
        overtimePromptWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }

    const promptWindow = overtimePromptWindow;
    const revealPromptWindow = () => {
        if (overtimePromptWindow !== promptWindow || promptWindow.isDestroyed()) return;
        focusOvertimePromptWindow();
    };

    promptWindow.once('ready-to-show', revealPromptWindow);
    promptWindow.webContents.once('did-finish-load', revealPromptWindow);

    promptWindow.on('close', (event) => {
        if (overtimePromptCloseAllowed) return;
        event.preventDefault();
        focusOvertimePromptWindow();
    });

    promptWindow.on('closed', () => {
        stopOvertimePromptFocusPulse();
        overtimePromptCloseAllowed = false;
        if (overtimePromptWindow === promptWindow) {
            overtimePromptWindow = null;
        }
    });

    promptWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildOvertimePromptPopupHtml(workSecs, breakSecs))}`)
        .then(revealPromptWindow)
        .catch((err) => {
            console.warn('[Overtime] Failed to load prompt window:', err);
            if (overtimePromptWindow === promptWindow && !promptWindow.isDestroyed()) {
                overtimePromptCloseAllowed = true;
                promptWindow.close();
            }
        });

    setTimeout(revealPromptWindow, 500);
    return true;
}

function updateOvertimeStatus(payload = {}) {
    const status = typeof payload.status === 'string' ? payload.status : 'stopped';
    const workLocation = typeof payload.workLocation === 'string' ? payload.workLocation : 'office';
    const currentShiftId = typeof payload.currentShiftId === 'string' && payload.currentShiftId
        ? payload.currentShiftId
        : null;
    const overtimeAccepted = payload.overtimeAccepted === true;
    const todayWorked = Number(payload.todayWorked);
    const todayBreakSecs = Number(payload.todayBreakSecs);
    const workTargetSecs = Number(payload.workTargetSecs);
    const breakTargetSecs = Number(payload.breakTargetSecs);

    lastOvertimeStatus = {
        status,
        workLocation,
        currentShiftId,
        overtimeAccepted,
        todayWorked: Number.isFinite(todayWorked) ? todayWorked : 0,
        todayBreakSecs: Number.isFinite(todayBreakSecs) ? todayBreakSecs : 0,
        workTargetSecs: Number.isFinite(workTargetSecs) && workTargetSecs > 0 ? workTargetSecs : 28800,
        breakTargetSecs: Number.isFinite(breakTargetSecs) && breakTargetSecs >= 0 ? breakTargetSecs : 3600,
    };

    if (!currentShiftId || status === 'stopped') {
        overtimePromptedShiftId = null;
        overtimeAcceptedShiftId = null;
        closeOvertimePromptWindow();
        return;
    }

    if (overtimeAccepted) {
        overtimeAcceptedShiftId = currentShiftId;
        closeOvertimePromptWindow();
        return;
    }

    if (
        (status !== 'working' && status !== 'on_break') ||
        workLocation !== 'office' ||
        overtimeAcceptedShiftId === currentShiftId ||
        lastOvertimeStatus.todayWorked < lastOvertimeStatus.workTargetSecs ||
        lastOvertimeStatus.todayBreakSecs + 1 < lastOvertimeStatus.breakTargetSecs
    ) {
        return;
    }

    if (overtimePromptedShiftId === currentShiftId) {
        if (!focusOvertimePromptWindow()) {
            console.log('[Overtime] Prompt was marked shown but no window exists. Recreating.');
            showOvertimePromptWindow(lastOvertimeStatus.workTargetSecs, lastOvertimeStatus.breakTargetSecs);
        }
        return;
    }

    if (showOvertimePromptWindow(lastOvertimeStatus.workTargetSecs, lastOvertimeStatus.breakTargetSecs)) {
        overtimePromptedShiftId = currentShiftId;
    }
}

function normalizeBreakReminderSeconds(value, fallback) {
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : fallback;
}

function clearBreakReminderTimeout(reason) {
    if (breakReminderTimeout) {
        console.log(`[BreakReminder] Clearing reminder timeout${reason ? ` (${reason})` : ''}`);
        clearTimeout(breakReminderTimeout);
        breakReminderTimeout = null;
    }
}

function clearBreakReminder(reason) {
    clearBreakReminderTimeout(reason);
    closeBreakReminderPopupWindow();
    activeBreakReminder = null;
}

function sendBreakReminderModal(breakSecs) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        console.log('[BreakReminder] Sending show-break-reminder-modal event to renderer.');
        mainWindow.webContents.send('show-break-reminder-modal', breakSecs);
    } else {
        console.warn('[BreakReminder] Main window is null or destroyed. Cannot send modal display request.');
    }
}

function scheduleNextBreakReminder() {
    if (!activeBreakReminder) return;

    clearBreakReminderTimeout('reschedule');

    const { startTimeMs, afterSecs, repeatSecs } = activeBreakReminder;
    const currentBreakSecs = Math.max(0, Math.floor((Date.now() - startTimeMs) / 1000));

    let delaySecs = 0;
    if (currentBreakSecs < afterSecs) {
        delaySecs = afterSecs - currentBreakSecs;
    } else {
        const elapsedSinceFirst = currentBreakSecs - afterSecs;
        const completedRepeats = Math.floor(elapsedSinceFirst / repeatSecs);
        const nextRepeatIndex = completedRepeats + 1;
        const nextReminderSecs = afterSecs + (nextRepeatIndex * repeatSecs);
        delaySecs = nextReminderSecs - currentBreakSecs;
    }

    delaySecs = Math.max(1, delaySecs);

    console.log(`[BreakReminder] Scheduling next reminder in ${delaySecs}s (current break duration: ${currentBreakSecs}s, afterSecs: ${afterSecs}, repeatSecs: ${repeatSecs})`);

    breakReminderTimeout = setTimeout(() => {
        breakReminderTimeout = null;

        if (!activeBreakReminder || currentShiftStatus !== 'on_break') {
            console.log(`[BreakReminder] Skipping stale reminder. status=${currentShiftStatus}`);
            return;
        }

        const updatedBreakSecs = Math.max(0, Math.floor((Date.now() - activeBreakReminder.startTimeMs) / 1000));
        console.log(`[BreakReminder] Timeout fired. updatedBreakSecs=${updatedBreakSecs}. Firing modal and notification.`);

        sendBreakReminderModal(updatedBreakSecs);
        handleBreakReminder(updatedBreakSecs);

        scheduleNextBreakReminder();
    }, delaySecs * 1000);
}

function setupBreakReminder(activeBreakStartTime, breakReminderAfterSecs, breakReminderRepeatSecs) {
    const startTimeMs = new Date(activeBreakStartTime).getTime();
    if (isNaN(startTimeMs)) {
        console.error('[BreakReminder] setupBreakReminder: invalid activeBreakStartTime date parsing:', activeBreakStartTime);
        return;
    }

    const afterSecs = normalizeBreakReminderSeconds(
        breakReminderAfterSecs,
        DEFAULT_BREAK_REMINDER_AFTER_SECS
    );
    const repeatSecs = normalizeBreakReminderSeconds(
        breakReminderRepeatSecs,
        DEFAULT_BREAK_REMINDER_REPEAT_SECS
    );

    activeBreakReminder = {
        startTimeMs,
        afterSecs,
        repeatSecs,
    };

    scheduleNextBreakReminder();
}

function dispatchAuthCallback(url) {
    if (!url) return;
    if (!mainWindow || mainWindow.isDestroyed()) {
        pendingAuthCallbackUrl = url;
        return;
    }
    mainWindow.webContents.send('auth-callback', { url });
}

function handleOvertimeDeepLink(parsed) {
    const target = parsed.hostname || parsed.pathname.replace(/^\/+/, '');
    if (target !== 'overtime') return false;

    const action = (parsed.searchParams.get('action') || '').toLowerCase();
    if (action === 'yes' || action === 'no') {
        emitOvertimePromptAction(action);
        return true;
    }

    if (action === 'open') {
        showOvertimePromptWindow(lastOvertimePrompt.workSecs, lastOvertimePrompt.breakSecs);
        return true;
    }

    return true;
}

function handleDeepLink(rawUrl) {
    if (!rawUrl) return;
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== `${DEEP_LINK_PROTOCOL}:`) return;

        if (handleOvertimeDeepLink(parsed)) return;

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
    if (!fs.existsSync(backendPath)) {
        console.warn(`[Backend] Packaged backend not found at ${backendPath}; using configured API_BASE instead.`);
        return;
    }

    backendProcess = spawn('node', [backendPath], { detached: false, stdio: 'pipe' });

    backendProcess.stdout.on('data', (d) => console.log('[Backend]', d.toString()));
    backendProcess.stderr.on('data', (d) => console.error('[Backend]', d.toString()));
    backendProcess.on('error', (err) => console.error('[Backend] Failed to start:', err));
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
        const inputIdle = idleSecs >= IDLE_THRESHOLD_SECS;
        const screenIdle = isWfhMode && wfhScreenMonitor.isScreenIdle();
        // WFH OR-mode: either input idle OR screen idle triggers.
        // Office (default): input idle alone — existing behaviour.
        const nowIdle = isWfhMode ? (inputIdle || screenIdle) : inputIdle;

        // ── Transition: Active → Idle ──────────────────────────────────────
        if (nowIdle && !isUserIdle) {
            isUserIdle = true;

            // Pick the earliest known idle start:
            //   - Input trigger: now - idleSecs (standard path)
            //   - Screen trigger: when the screen actually went static
            // Whichever happened first is the true idle start.
            const inputIdleStart = new Date(Date.now() - idleSecs * 1000);
            const screenIdleAt = isWfhMode ? (wfhScreenMonitor.getScreenIdleAt() ?? inputIdleStart) : inputIdleStart;
            const idleStartDate = screenIdleAt < inputIdleStart ? screenIdleAt : inputIdleStart;
            const idleStartTime = formatLocalIsoWithOffset(idleStartDate);

            console.log(`[Idle] User went idle. Input idle: ${idleSecs}s, screen idle: ${screenIdle} (Threshold: ${IDLE_THRESHOLD_SECS}s) started at: ${idleStartTime}`);
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
        icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
        webPreferences: {
            nodeIntegration: false,     // security: no direct Node access in renderer
            contextIsolation: true,     // security: renderer and preload have separate contexts
            preload: path.join(__dirname, 'preload.js'),
            // In dev the renderer loads from http://localhost:5173, which the production
            // backend's CORS list doesn't include. Disabling webSecurity removes the
            // browser-side CORS check so dev fetches reach the production API.
            // Production builds load from file:// (no origin) → CORS never applies there.
            webSecurity: true,
            allowRunningInsecureContent: false,
            backgroundThrottling: false,
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
        clearBreakReminder('window closed');
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
        console.error(`[OTA] Update error (suppressed in UI): ${err.message}`);
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
    ipcMain.on('show-break-reminder', (_event, breakSecs, focusWindow) => {
        handleBreakReminder(breakSecs, focusWindow !== false);
    });
    ipcMain.on('focus-break-reminder', () => {
        try {
            if (!focusBreakReminderPopupWindow()) {
                bringMainWindowToFront();
            }
        } catch (err) {
            console.warn('[BreakReminder] Failed to focus reminder popup:', err);
        }
    });
    ipcMain.on('break-reminder-popup-dismiss', () => {
        closeBreakReminderPopupWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('break-reminder-dismiss');
        }
    });
    ipcMain.on('break-reminder-popup-resume', () => {
        closeBreakReminderPopupWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('break-reminder-resume');
        }
    });
    ipcMain.on('close-break-reminder-popup', () => {
        closeBreakReminderPopupWindow();
    });
    ipcMain.on('focus-main-window', () => {
        bringMainWindowToFront();
    });
    ipcMain.on('show-overtime-prompt', (_event, workSecs, breakSecs) => {
        showOvertimePromptWindow(workSecs, breakSecs);
    });
    ipcMain.on('update-overtime-status', (_event, payload) => {
        updateOvertimeStatus(payload);
    });
    ipcMain.on('focus-overtime-prompt', () => {
        try {
            if (!focusOvertimePromptWindow()) {
                showOvertimePromptWindow(lastOvertimePrompt.workSecs, lastOvertimePrompt.breakSecs);
            }
        } catch (err) {
            console.warn('[Overtime] Failed to focus overtime prompt:', err);
        }
    });
    ipcMain.on('close-overtime-prompt', () => {
        closeOvertimePromptWindow();
    });
    ipcMain.on('overtime-prompt-no', () => {
        emitOvertimePromptAction('no');
    });
    ipcMain.on('overtime-prompt-yes', () => {
        emitOvertimePromptAction('yes');
    });

    // ── IPC: App Tracker ──────────────────────────────────────────────────────
    ipcMain.handle('get-app-usage', async () => {
        return tracker.getCurrentData();
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
        syncHeartbeatLoop();
    });

    ipcMain.on('clear-tracker-auth-token', () => {
        tracker.clearAuthToken();
        screenshotScheduler.clearAuthToken();
        sessionAuthToken = null;
        disconnectIntentSent = false;
        currentShiftStatus = 'stopped';
        clearBreakReminder('auth cleared');
        syncHeartbeatLoop();
    });

    // ── IPC: Shift Status Sync ────────────────────────────────────────────────
    // Renderer sends current shift status on every change so main.js always
    // knows whether the user is working/on_break/stopped before a suspend fires.
    ipcMain.on('update-shift-status', (_event, status, activeBreakStartTime, breakReminderAfterSecs, breakReminderRepeatSecs) => {
        if (typeof status === 'string') {
            currentShiftStatus = status;
            console.log(`[Sleep] Shift status updated to '${currentShiftStatus}'. activeBreakStartTime=${activeBreakStartTime}, breakReminderAfterSecs=${breakReminderAfterSecs}, breakReminderRepeatSecs=${breakReminderRepeatSecs}`);
            syncHeartbeatLoop();

            if (status === 'on_break' && activeBreakStartTime) {
                console.log('[BreakReminder] Conditions met. Setting up break reminder.');
                setupBreakReminder(activeBreakStartTime, breakReminderAfterSecs, breakReminderRepeatSecs);
            } else if (status === 'on_break') {
                console.warn('[BreakReminder] On break but missing activeBreakStartTime; keeping existing reminder state if present.');
            } else {
                clearBreakReminder(`status=${status}`);
                console.log(`[BreakReminder] Conditions NOT met for reminder. status=${status}, activeBreakStartTime=${activeBreakStartTime}`);
            }
        }
    });

    // ── IPC: Dynamic Idle Threshold (NEW — Admin Portal) ─────────────────────
    // Called by the renderer after login with the admin-set value for this user.
    ipcMain.on('set-idle-threshold', (_event, seconds) => {
        if (typeof seconds === 'number' && seconds >= 10) {
            IDLE_THRESHOLD_SECS = Math.round(seconds);
            console.log(`[Idle] Hardware threshold updated to ${IDLE_THRESHOLD_SECS}s`);
            // Hardware threshold change does NOT restart WFH monitor —
            // screen idle threshold is a separate independent value.
        }
    });

    ipcMain.on('set-wfh-screen-idle-threshold', (_event, seconds) => {
        if (typeof seconds === 'number' && seconds >= 10) {
            const newThreshold = Math.round(seconds);
            const changed = newThreshold !== WFH_SCREEN_IDLE_THRESHOLD_SECS;
            WFH_SCREEN_IDLE_THRESHOLD_SECS = newThreshold;
            if (isWfhMode && changed) {
                console.log(`[WFH] Screen idle threshold changed to ${WFH_SCREEN_IDLE_THRESHOLD_SECS}s — restarting monitor`);
                wfhScreenMonitor.start(
                    WFH_SCREEN_IDLE_THRESHOLD_SECS,
                    wfhConfig,
                    () => { console.log('[WFH] Screen went idle'); },
                    () => { console.log('[WFH] Screen became active — poller will re-evaluate'); }
                );
            }
        }
    });

    ipcMain.on('set-screenshot-interval', (_event, seconds) => {
        if (typeof seconds === 'number' && seconds >= 60 && seconds <= 3600) {
            screenshotScheduler.setIntervalSecs(Math.round(seconds));
        }
    });

    ipcMain.on('set-wfh-config', (_event, config) => {
        if (config && typeof config === 'object') {
            const newIntervalMs = config.intervalMs ?? wfhConfig.intervalMs;
            const newWidth      = config.width      ?? wfhConfig.width;
            const newHeight     = config.height     ?? wfhConfig.height;
            const changed = newIntervalMs !== wfhConfig.intervalMs ||
                            newWidth      !== wfhConfig.width      ||
                            newHeight     !== wfhConfig.height;
            wfhConfig.intervalMs = newIntervalMs;
            wfhConfig.width      = newWidth;
            wfhConfig.height     = newHeight;
            if (isWfhMode && changed) {
                console.log(`[WFH] Capture config changed — restarting monitor: intervalMs=${wfhConfig.intervalMs}`);
                wfhScreenMonitor.start(
                    WFH_SCREEN_IDLE_THRESHOLD_SECS,
                    wfhConfig,
                    () => { console.log('[WFH] Screen went idle'); },
                    () => { console.log('[WFH] Screen became active — poller will re-evaluate'); }
                );
            }
        }
    });

    // ── IPC: WFH Mode ─────────────────────────────────────────────────────────
    // Renderer sends this after every status poll with the active shift's
    // workLocation. 'wfh' activates the screen-change idle monitor; 'office'
    // (or no active shift) leaves the existing input-only monitor in charge.
    ipcMain.on('set-work-location', (_event, location) => {
        const wfh = location === 'wfh';
        if (wfh === isWfhMode) return; // no change — nothing to do

        isWfhMode = wfh;
        console.log(`[WFH] Mode set to '${location}'`);

        if (isWfhMode) {
            wfhScreenMonitor.start(
                WFH_SCREEN_IDLE_THRESHOLD_SECS,
                wfhConfig,
                () => { console.log('[WFH] Screen went idle'); },
                () => { console.log('[WFH] Screen became active — poller will re-evaluate'); }
            );
        } else {
            wfhScreenMonitor.stop();
            // If we were in a WFH-combined idle and switch back to office mode,
            // reset idle state cleanly so the poller re-evaluates from scratch.
            if (isUserIdle && mainWindow && !mainWindow.isDestroyed()) {
                isUserIdle = false;
                mainWindow.webContents.send('idle-end');
            }
        }
    });

    // ── IPC: Open Login in System Browser (Device Flow) ─────────────────────
    // Renderer sends the one-time deviceCode it generated.
    // We embed it as ?desktopCode=<uuid> so the website POSTs the session
    // to the backend by that code. The renderer polls the backend every 2s.
    ipcMain.on('open-login', (_event, deviceCode) => {
        const code = String(deviceCode || '').trim();
        if (!code) return;

        const now = Date.now();
        if (lastOpenedLoginCode === code && now - lastOpenedLoginAt < 3000) {
            console.log('[Auth] Ignored duplicate browser login request for deviceCode:', code);
            return;
        }
        lastOpenedLoginCode = code;
        lastOpenedLoginAt = now;

        const loginUrl = new URL('/login', WEB_APP_URL);
        loginUrl.searchParams.set('desktopCode', code);
        loginUrl.searchParams.set('returnTo', 'desktop');
        shell.openExternal(loginUrl.toString());
        console.log('[Auth] Opened browser login with deviceCode:', code);
    });

    ipcMain.on('open-dashboard', () => {
        shell.openExternal(new URL('/dashboard', WEB_APP_URL).toString());
        console.log('[Auth] Opened browser dashboard');
    });

    ipcMain.on('restart-app', () => {
        console.log('[OTA] Restart and install triggered');
        // quitAndInstall(isSilent, isForceRunAfter)
        autoUpdater.quitAndInstall(true, true);
    });

    startBackend();
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

    app.on('before-quit', (event) => {
        stopHeartbeatLoop();

        if (forceQuitAfterExitIntent || quittingForUpdate || !shouldSendExitIntent()) {
            if (quittingForUpdate) {
                void sendDisconnectIntent('before_quit_for_update', { timeoutMs: 1500 });
            }
            return;
        }

        if (event && typeof event.preventDefault === 'function') {
            event.preventDefault();
        }
        sendExitIntentThenQuit('before_quit');
    });

    app.on('before-quit-for-update', () => {
        quittingForUpdate = true;
        stopHeartbeatLoop();
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

    powerMonitor.on('shutdown', (event) => {
        if (!shouldSendExitIntent()) {
            stopHeartbeatLoop();
            return;
        }

        if (event && typeof event.preventDefault === 'function') {
            event.preventDefault();
        }
        sendExitIntentThenQuit('system_shutdown', { timeoutMs: 2500 });
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
    stopHeartbeatLoop();
    clearBreakReminder('all windows closed');
    if (backendProcess) backendProcess.kill();
    if (process.platform !== 'darwin') app.quit();
});
