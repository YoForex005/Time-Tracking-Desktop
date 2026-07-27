/**
 * screenshotCapture.js — Full-screen capture of the monitor under the cursor
 * ─────────────────────────────────────────────────────────────────────────────
 * Uses Electron's desktopCapturer on every platform.
 *
 * Previously Windows shelled out to PowerShell (System.Windows.Forms +
 * Graphics.CopyFromScreen). That process is DPI-unaware, so Screen.Bounds
 * reported logical (scaled) coordinates while CopyFromScreen read physical
 * pixels — on any display not set to 100% scaling the result was a top-left
 * crop of the desktop, which looks like a zoomed screenshot. macOS and Linux
 * additionally captured the main/primary display rather than the one the user
 * was actually working on.
 *
 * Electron is DPI-aware, so a single implementation fixes all of the above.
 * Note that Display.bounds is expressed in DIP (device-independent pixels);
 * multiplying by scaleFactor is what yields true native resolution.
 */

const { desktopCapturer, screen, systemPreferences } = require('electron');

// Longest edge permitted in a capture. 1080p, 1440p and 4K pass through
// untouched; anything larger is scaled down proportionally — the whole screen
// is always present, never cropped. This keeps the base64 upload inside the
// backend's 25 MB JSON body limit and 20 MB decoded-image limit.
const MAX_CAPTURE_EDGE_PX = 3840;

// Mirrors the timeout the old execFile() call carried. Without it a wedged
// capture would leave the scheduler's tickInFlight latched and silently stop
// all future screenshots for that session.
const CAPTURE_TIMEOUT_MS = 15000;

function withTimeout(promise, ms, label) {
    let timer = null;
    const timeout = new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}

function fitWithinMaxEdge(width, height) {
    const longest = Math.max(width, height);
    if (longest <= MAX_CAPTURE_EDGE_PX) return { width, height };

    const ratio = MAX_CAPTURE_EDGE_PX / longest;
    return {
        width: Math.max(1, Math.round(width * ratio)),
        height: Math.max(1, Math.round(height * ratio)),
    };
}

/**
 * macOS gates screen capture behind TCC. Without this check a denied
 * permission surfaces as a black or empty frame rather than an actionable
 * error, which is very hard to diagnose from the server side.
 */
function assertScreenRecordingPermission() {
    if (process.platform !== 'darwin') return;

    const status = systemPreferences.getMediaAccessStatus('screen');
    if (status !== 'granted') {
        throw new Error(
            `Screen Recording permission is '${status}'. Grant it under ` +
            'System Settings > Privacy & Security > Screen Recording.'
        );
    }
}

/** The display the user is actually working on, not the primary one. */
function getTargetDisplay() {
    const cursorPoint = screen.getCursorScreenPoint();
    return screen.getDisplayNearestPoint(cursorPoint);
}

function pickSourceForDisplay(sources, display) {
    // source.display_id is a string; Display.id is a number.
    const targetId = String(display.id);
    const match = sources.find((source) => String(source.display_id) === targetId);
    if (match) return match;

    // Some Linux/Wayland sessions report an empty display_id. Fall back to the
    // display's ordinal position, then to whatever screen is available.
    const index = screen.getAllDisplays().findIndex((item) => item.id === display.id);
    return sources[index] ?? sources[0];
}

async function captureCurrentMonitorPng() {
    assertScreenRecordingPermission();

    const display = getTargetDisplay();
    const scaleFactor = display.scaleFactor || 1;
    const bounds = display.bounds;

    // bounds is DIP — scale up to physical pixels so scaled displays are not
    // captured at reduced resolution.
    const nativeWidth = Math.max(1, Math.round(bounds.width * scaleFactor));
    const nativeHeight = Math.max(1, Math.round(bounds.height * scaleFactor));
    const requested = fitWithinMaxEdge(nativeWidth, nativeHeight);

    const sources = await withTimeout(
        desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: requested,
            fetchWindowIcons: false,
        }),
        CAPTURE_TIMEOUT_MS,
        'Screen capture'
    );

    if (!sources || sources.length === 0) {
        throw new Error('No screen sources available for capture');
    }

    const source = pickSourceForDisplay(sources, display);
    if (!source || !source.thumbnail || source.thumbnail.isEmpty()) {
        throw new Error('Screen capture returned an empty frame');
    }

    const imageBuffer = source.thumbnail.toPNG();
    if (!imageBuffer || imageBuffer.length === 0) {
        throw new Error('Screen capture produced an empty PNG buffer');
    }

    // desktopCapturer preserves aspect ratio and may land a pixel off the
    // requested size, so report what was actually produced.
    const size = source.thumbnail.getSize();

    return {
        imageBuffer,
        display: {
            // Physical pixel dimensions of the image being uploaded.
            width: size.width,
            height: size.height,
            x: bounds.x,
            y: bounds.y,
            // Diagnostics — surfaced in Screenshot.displayMeta so any future
            // scaling mismatch is visible directly in the database.
            scaleFactor,
            displayId: String(display.id),
            dipWidth: bounds.width,
            dipHeight: bounds.height,
            nativeWidth,
            nativeHeight,
            downscaled: size.width !== nativeWidth || size.height !== nativeHeight,
        },
    };
}

module.exports = {
    captureCurrentMonitorPng,
};
