/**
 * wfhScreenMonitor.js — WFH Screen Activity Monitor
 * ─────────────────────────────────────────────────────
 * ONLY active when the user clocks in as "Work From Home".
 * In-Office shifts use the existing input-only idle detector — this file
 * is completely dormant for them.
 *
 * How it works:
 *   Every CAPTURE_INTERVAL_MS milliseconds, grab a tiny 160×90 thumbnail of
 *   the primary display using Electron's desktopCapturer API and compute a
 *   lightweight pixel checksum. If the checksum hasn't changed for
 *   `idleThresholdSecs` worth of captures → screen is idle.
 *   Once the screen changes again → screen is active.
 *
 *   The main idle poller in main.js consults isScreenIdle() and uses AND logic:
 *     WFH idle  = input idle  AND  screen idle
 *     WFH active = input active OR  screen active
 *
 * Public API:
 *   start(idleThresholdSecs, onScreenIdle, onScreenActive)
 *   stop()
 *   isScreenIdle()  → boolean
 */

const { desktopCapturer } = require('electron');

// Default values (overridden by start config)
let CAPTURE_INTERVAL_MS = 15000;
let THUMB_W = 160;
let THUMB_H = 90;

// ── Module state ──────────────────────────────────────────────────────────────

let _timer            = null;
let _screenIdle       = false;
let _screenIdleAt     = null;    // timestamp (Date) when screen first went idle
let _lastHash         = null;
let _staticCount      = 0;       // consecutive unchanged frames
let _framesForIdle    = 4;       // how many static frames = idle (recalculated on start)
let _onScreenIdle     = null;    // fired once when screen goes idle
let _onScreenActive   = null;    // fired once when screen becomes active

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Fast pixel checksum: sum every 4th byte of the bitmap buffer.
 * Sampling reduces work ~4× while preserving enough sensitivity.
 */
function pixelHash(buffer) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 4) {
        sum = (sum + buffer[i] + buffer[i + 1] + buffer[i + 2]) & 0x7fffffff;
    }
    return sum;
}

// ── Core capture loop ─────────────────────────────────────────────────────────

async function captureAndCheck() {
    try {
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: THUMB_W, height: THUMB_H },
        });

        if (!sources || sources.length === 0) return;

        const buffer = sources[0].thumbnail.toBitmap();
        const hash   = pixelHash(buffer);

        if (_lastHash !== null && hash === _lastHash) {
            // Screen unchanged
            _staticCount++;
            if (!_screenIdle && _staticCount >= _framesForIdle) {
                _screenIdle  = true;
                _screenIdleAt = new Date();
                console.log(`[WFH Monitor] Screen idle (${_staticCount} static frames)`);
                if (_onScreenIdle) _onScreenIdle();
            }
        } else {
            // Screen changed
            _lastHash    = hash;
            _staticCount = 0;

            if (_screenIdle) {
                _screenIdle   = false;
                _screenIdleAt = null;
                console.log('[WFH Monitor] Screen active again');
                if (_onScreenActive) _onScreenActive();
            }
        }
    } catch (err) {
        // desktopCapturer can fail if no display is attached (headless / RDP edge case)
        console.warn('[WFH Monitor] Capture failed:', err.message);
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start the screen monitor.
 * Safe to call multiple times — stops any previous run first.
 *
 * @param {number}   screenIdleThresholdSecs  How long screen must be static before it's idle (independent of input idle threshold)
 * @param {object}   config                   wfhConfig { intervalMs, width, height }
 * @param {Function} onScreenIdle             Called once when screen becomes idle
 * @param {Function} onScreenActive           Called once when screen becomes active again
 */
function start(screenIdleThresholdSecs, config, onScreenIdle, onScreenActive) {
    stop();

    if (config) {
        CAPTURE_INTERVAL_MS = Math.min(60000, Math.max(5000, config.intervalMs || 15000));
        THUMB_W = config.width || 160;
        THUMB_H = config.height || 90;
    }

    _framesForIdle  = Math.max(1, Math.ceil((screenIdleThresholdSecs * 1000) / CAPTURE_INTERVAL_MS));
    _onScreenIdle   = onScreenIdle;
    _onScreenActive = onScreenActive;
    _screenIdle     = false;
    _screenIdleAt   = null;
    _lastHash       = null;
    _staticCount    = 0;

    _timer = setInterval(captureAndCheck, CAPTURE_INTERVAL_MS);
    console.log(`[WFH Monitor] Started — threshold ${screenIdleThresholdSecs}s = ${_framesForIdle} static frames @ ${CAPTURE_INTERVAL_MS}ms interval`);
}

/** Stop the monitor and reset all state. */
function stop() {
    if (_timer) {
        clearInterval(_timer);
        _timer = null;
    }
    _screenIdle   = false;
    _screenIdleAt = null;
    _lastHash     = null;
    _staticCount  = 0;
    // Only log if it was actually running
    if (_onScreenIdle) {
        console.log('[WFH Monitor] Stopped');
    }
    _onScreenIdle   = null;
    _onScreenActive = null;
}

/** Returns true when the screen has been static for >= idleThresholdSecs. */
function isScreenIdle() {
    return _screenIdle;
}

/** Returns the Date when screen went idle, or null if screen is active. */
function getScreenIdleAt() {
    return _screenIdleAt;
}

module.exports = { start, stop, isScreenIdle, getScreenIdleAt };
