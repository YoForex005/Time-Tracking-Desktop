/**
 * inputActivityMonitor.js — Suspicious Activity Detection
 * ─────────────────────────────────────────────────────────
 * Detects suspicious input patterns that indicate the user may NOT be
 * genuinely working despite the OS reporting them as "active":
 *
 *   - Mouse jigglers (USB or software)
 *   - Passive video watching with no interaction
 *   - Any scenario where OS idle resets but no meaningful work occurs
 *
 * How it works:
 *   A persistent PowerShell process polls Win32 APIs every POLL_INTERVAL_MS:
 *     - GetCursorPos()       → mouse X/Y position
 *     - GetForegroundWindow() → active window PID + title
 *     - GetAsyncKeyState()   → keyboard key-down state (high bit)
 *     - GetAsyncKeyState()   → mouse button-down state
 *
 *   Results are pushed into a rolling circular buffer (5 minutes).
 *   On each poll, the buffer is analysed for suspicious patterns:
 *
 *     1. Total cursor travel distance (real user: 1000s of px; jiggler: <200px)
 *     2. Cursor bounding box area (real user: large; jiggler: tiny)
 *     3. Movement regularity score (jiggler: >0.85; real user: <0.5)
 *     4. Keyboard hits detected (real user: many; jiggler: zero)
 *     5. Mouse click hits detected (real user: some; jiggler: zero)
 *
 *   Suspicious flag requires ALL of these to be true simultaneously AND
 *   the pattern must persist for >= THRESHOLD_SECS (default 300s = 5 min).
 *
 * IMPORTANT — Safety:
 *   This module is OBSERVE-ONLY. It does NOT feed into the idle detection
 *   formula. Suspicious activity is recorded separately so admins can
 *   review it before deciding whether to enforce it.
 *
 * Public API:
 *   start(thresholdSecs, onStart, onEnd)  — begin monitoring
 *   stop()                                 — stop monitoring, clear state
 *   isSuspicious()                         — boolean
 *   getSuspiciousStartedAt()               — Date | null
 *   getSuspiciousDurationSecs()            — number
 *   getLastMetrics()                       — metrics object for dashboard/logging
 *   reset()                                — clear buffer (on break-end, clock-in)
 */

const { spawn } = require('child_process');
const { screen } = require('electron');

// ── Configurable ──────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5000;  // 5 seconds between samples
const BUFFER_DURATION_MS = 5 * 60 * 1000; // 5-minute rolling window
const MAX_BUFFER_SIZE = Math.ceil(BUFFER_DURATION_MS / POLL_INTERVAL_MS) + 5; // ~65 samples

// Detection thresholds (tuned to minimize false positives)
const DISTANCE_THRESHOLD = 500;    // px total travel over the window — jiggler: ~50-200, real: 2000+
const BBOX_AREA_THRESHOLD = 10000; // px² (100×100) — jiggler: <625 (25×25), real: huge
const MOVEMENT_REGULARITY_THRESHOLD = 0.85; // ratio — jiggler: >0.9 (identical deltas), real: <0.5

// ── PowerShell Persistent Process ─────────────────────────────────────────────

const PS_ADD_TYPE = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class ActivityMon {
    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);
    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X; public int Y; }
}
"@
`;

const RESPONSE_DELIMITER = '<<<ACTMON_END>>>';
const PS_POLL = `
$p = New-Object ActivityMon+POINT
[ActivityMon]::GetCursorPos([ref]$p) | Out-Null
$fg = [ActivityMon]::GetForegroundWindow()
$outPid = [uint32]0
[ActivityMon]::GetWindowThreadProcessId($fg, [ref]$outPid) | Out-Null
$sb = New-Object System.Text.StringBuilder(512)
[ActivityMon]::GetWindowText($fg, $sb, 512) | Out-Null
$kb = $false
for ($vk = 0x08; $vk -le 0x5A; $vk++) {
    if (([ActivityMon]::GetAsyncKeyState($vk) -band 0x8000) -ne 0) { $kb = $true; break }
}
$cl = (([ActivityMon]::GetAsyncKeyState(0x01) -band 0x8000) -ne 0) -or (([ActivityMon]::GetAsyncKeyState(0x02) -band 0x8000) -ne 0) -or (([ActivityMon]::GetAsyncKeyState(0x04) -band 0x8000) -ne 0)
[PSCustomObject]@{X=$p.X;Y=$p.Y;Pid=[int]$outPid;Title=$sb.ToString();Kb=$kb;Cl=$cl} | ConvertTo-Json -Compress
Write-Output '${RESPONSE_DELIMITER}'
`;

// ── Module state ──────────────────────────────────────────────────────────────

let _timer = null;
let _psProcess = null;
let _pendingResolve = null;
let _stdoutBuffer = '';
let _buffer = [];           // circular buffer of samples
let _suspicious = false;
let _suspiciousAt = null;    // Date when suspicious period started
let _thresholdSecs = 300;    // how long suspicious patterns must persist before flagging
let _onSuspiciousStart = null;
let _onSuspiciousEnd = null;
let _lastMetrics = null;     // last computed metrics (for debugging / dashboard)
let _psStarting = false;
let _pollInFlight = false;

// ── PowerShell Process Management ─────────────────────────────────────────────

function startPsProcess() {
    if (_psProcess || _psStarting) return;
    if (process.platform !== 'win32') return;

    _psStarting = true;
    _stdoutBuffer = '';

    try {
        _psProcess = spawn('powershell.exe', [
            '-NoProfile', '-NoLogo', '-NonInteractive',
            '-ExecutionPolicy', 'Bypass',
            '-Command', '-'
        ], {
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        });

        _psProcess.stdout.on('data', handleStdout);

        _psProcess.stderr.on('data', (data) => {
            const msg = data.toString().trim();
            if (msg) console.warn('[InputMonitor] PS stderr:', msg);
        });

        _psProcess.on('error', (err) => {
            console.warn('[InputMonitor] PS process error:', err.message);
            _psProcess = null;
            _psStarting = false;
        });

        _psProcess.on('exit', (code) => {
            console.log(`[InputMonitor] PS process exited (code=${code})`);
            _psProcess = null;
            _psStarting = false;
            if (_pendingResolve) {
                _pendingResolve(null);
                _pendingResolve = null;
            }
        });

        // Send the Add-Type declaration once (compiles the C# types)
        _psProcess.stdin.write(PS_ADD_TYPE + '\n');

        // Send a warmup poll to flush type compilation output
        _psProcess.stdin.write(PS_POLL + '\n');

        _pendingResolve = () => {
            _psStarting = false;
            console.log('[InputMonitor] PS process ready');
        };
    } catch (err) {
        console.warn('[InputMonitor] Failed to start PS process:', err.message);
        _psProcess = null;
        _psStarting = false;
    }
}

function stopPsProcess() {
    if (!_psProcess) return;
    try {
        _psProcess.stdin.end();
        _psProcess.kill();
    } catch { /* ignore */ }
    _psProcess = null;
    _psStarting = false;
    _pendingResolve = null;
    _stdoutBuffer = '';
}

function handleStdout(data) {
    _stdoutBuffer += data.toString();

    const delimIdx = _stdoutBuffer.indexOf(RESPONSE_DELIMITER);
    if (delimIdx === -1) return;

    const responseText = _stdoutBuffer.substring(0, delimIdx).trim();
    _stdoutBuffer = _stdoutBuffer.substring(delimIdx + RESPONSE_DELIMITER.length);

    const hasMore = _stdoutBuffer.indexOf(RESPONSE_DELIMITER) !== -1;

    if (_pendingResolve) {
        const resolve = _pendingResolve;
        _pendingResolve = null;
        try {
            resolve(JSON.parse(responseText));
        } catch {
            resolve(null);
        }
    }

    if (hasMore) handleStdout(Buffer.alloc(0));
}

function queryInputState() {
    return new Promise((resolve) => {
        if (!_psProcess || _psStarting) {
            resolve(null);
            return;
        }

        // Safety timeout
        const timeout = setTimeout(() => {
            if (_pendingResolve === wrappedResolve) {
                _pendingResolve = null;
                resolve(null);
            }
        }, 4000);

        const wrappedResolve = (value) => {
            clearTimeout(timeout);
            resolve(value);
        };
        _pendingResolve = wrappedResolve;

        try {
            _psProcess.stdin.write(PS_POLL + '\n');
        } catch {
            clearTimeout(timeout);
            _pendingResolve = null;
            resolve(null);
        }
    });
}

// ── Sample Collection ─────────────────────────────────────────────────────────

async function collectSample() {
    if (_pollInFlight) return;
    _pollInFlight = true;

    try {
        const cursorPoint = screen.getCursorScreenPoint();
        const psResult = await queryInputState();

        const sample = {
            x: cursorPoint.x,
            y: cursorPoint.y,
            fgPid: psResult?.Pid ?? 0,
            fgTitle: psResult?.Title ?? '',
            kbDown: psResult?.Kb === true,
            clickDown: psResult?.Cl === true,
            ts: Date.now(),
        };

        _buffer.push(sample);

        // Trim buffer to rolling window
        const cutoff = Date.now() - BUFFER_DURATION_MS;
        while (_buffer.length > 0 && _buffer[0].ts < cutoff) {
            _buffer.shift();
        }
        if (_buffer.length > MAX_BUFFER_SIZE) {
            _buffer = _buffer.slice(-MAX_BUFFER_SIZE);
        }

        evaluate();
    } catch (err) {
        console.warn('[InputMonitor] Sample collection error:', err.message);
    } finally {
        _pollInFlight = false;
    }
}

// ── Detection Algorithm ───────────────────────────────────────────────────────

function computeMetrics(samples) {
    let totalDistance = 0;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let keyboardHits = 0;
    let clickHits = 0;
    const titles = new Set();
    const pids = new Set();
    const deltas = [];

    for (let i = 0; i < samples.length; i++) {
        const s = samples[i];

        minX = Math.min(minX, s.x);
        maxX = Math.max(maxX, s.x);
        minY = Math.min(minY, s.y);
        maxY = Math.max(maxY, s.y);

        if (i > 0) {
            const prev = samples[i - 1];
            const dx = s.x - prev.x;
            const dy = s.y - prev.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            totalDistance += dist;
            deltas.push(dist);
        }

        if (s.kbDown) keyboardHits++;
        if (s.clickDown) clickHits++;
        if (s.fgTitle) titles.add(s.fgTitle);
        if (s.fgPid) pids.add(s.fgPid);
    }

    // Movement regularity: how uniform are the per-poll deltas?
    // Jiggler: near-identical deltas → high regularity (~0.95)
    // Real user: highly varied deltas → low regularity (~0.2-0.5)
    let movementRegularity = 0;
    if (deltas.length > 2) {
        const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        if (mean > 0.5) {
            const variance = deltas.reduce((acc, d) => acc + (d - mean) * (d - mean), 0) / deltas.length;
            const stddev = Math.sqrt(variance);
            movementRegularity = Math.max(0, 1 - (stddev / mean));
        }
    }

    const bboxW = Math.max(0, maxX - minX);
    const bboxH = Math.max(0, maxY - minY);

    return {
        totalDistance: Math.round(totalDistance),
        bboxWidth: bboxW,
        bboxHeight: bboxH,
        bboxArea: bboxW * bboxH,
        movementRegularity: Math.round(movementRegularity * 100) / 100,
        keyboardHits,
        clickHits,
        uniqueTitles: titles.size,
        uniquePids: pids.size,
        sampleCount: samples.length,
    };
}

function evaluate() {
    const minSamples = Math.ceil((_thresholdSecs * 1000) / POLL_INTERVAL_MS);
    if (_buffer.length < Math.min(minSamples, 12)) return;

    const windowMs = _thresholdSecs * 1000;
    const now = Date.now();
    const windowSamples = _buffer.filter(s => (now - s.ts) <= windowMs);

    if (windowSamples.length < Math.min(minSamples, 12)) return;

    const metrics = computeMetrics(windowSamples);
    _lastMetrics = metrics;

    // ── Suspicious when ALL of these are true: ───────────────────────────────
    const lowDistance = metrics.totalDistance < DISTANCE_THRESHOLD;
    const tinyBbox = metrics.bboxArea < BBOX_AREA_THRESHOLD;
    const regularMovement = metrics.movementRegularity > MOVEMENT_REGULARITY_THRESHOLD
        && metrics.totalDistance > 10; // only meaningful if mouse IS moving (jiggler)

    const movementSuspicious = lowDistance || tinyBbox || regularMovement;
    const noKeyboard = metrics.keyboardHits === 0;
    const noClicks = metrics.clickHits === 0;

    const isSuspiciousNow = movementSuspicious && noKeyboard && noClicks;

    // ── State transitions ────────────────────────────────────────────────────

    if (isSuspiciousNow && !_suspicious) {
        _suspicious = true;
        _suspiciousAt = new Date(now - windowMs);
        console.log(
            `[InputMonitor] ⚠️ Suspicious activity detected.` +
            ` distance=${metrics.totalDistance}px` +
            ` bbox=${metrics.bboxWidth}×${metrics.bboxHeight}` +
            ` regularity=${metrics.movementRegularity}` +
            ` kbHits=${metrics.keyboardHits}` +
            ` clickHits=${metrics.clickHits}` +
            ` titles=${metrics.uniqueTitles}` +
            ` samples=${metrics.sampleCount}`
        );
        if (_onSuspiciousStart) {
            _onSuspiciousStart({
                startedAt: _suspiciousAt,
                metrics,
            });
        }
    } else if (!isSuspiciousNow && _suspicious) {
        const durationSecs = Math.floor((now - _suspiciousAt.getTime()) / 1000);
        console.log(`[InputMonitor] ✓ Suspicious activity ended after ${durationSecs}s`);
        const startedAt = _suspiciousAt;
        _suspicious = false;
        _suspiciousAt = null;
        if (_onSuspiciousEnd) {
            _onSuspiciousEnd({
                startedAt,
                durationSecs,
                endedAt: new Date(now),
            });
        }
    }

    // Periodic debug log (every ~30 seconds when not suspicious)
    if (!_suspicious && _buffer.length % 6 === 0) {
        console.log(
            `[InputMonitor] Activity: dist=${metrics.totalDistance}px` +
            ` bbox=${metrics.bboxWidth}×${metrics.bboxHeight}` +
            ` reg=${metrics.movementRegularity}` +
            ` kb=${metrics.keyboardHits} click=${metrics.clickHits}` +
            ` titles=${metrics.uniqueTitles}`
        );
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

function start(thresholdSecs, onSuspiciousStart, onSuspiciousEnd) {
    stop();

    if (process.platform !== 'win32') {
        console.log('[InputMonitor] Skipped — only available on Windows');
        return;
    }

    _thresholdSecs = typeof thresholdSecs === 'number' && thresholdSecs >= 60
        ? Math.round(thresholdSecs)
        : 300;
    _onSuspiciousStart = onSuspiciousStart || null;
    _onSuspiciousEnd = onSuspiciousEnd || null;
    _buffer = [];
    _suspicious = false;
    _suspiciousAt = null;
    _lastMetrics = null;
    _pollInFlight = false;

    startPsProcess();

    _timer = setInterval(() => {
        if (!_psProcess && !_psStarting) {
            startPsProcess();
        }
        void collectSample();
    }, POLL_INTERVAL_MS);

    console.log(
        `[InputMonitor] Started — suspicious threshold ${_thresholdSecs}s` +
        ` (poll every ${POLL_INTERVAL_MS / 1000}s, window ${BUFFER_DURATION_MS / 1000}s)`
    );
}

function stop() {
    if (_timer) {
        clearInterval(_timer);
        _timer = null;
    }
    stopPsProcess();

    const wasSuspicious = _suspicious;
    _buffer = [];
    _suspicious = false;
    _suspiciousAt = null;
    _lastMetrics = null;
    _pollInFlight = false;

    if (wasSuspicious) {
        console.log('[InputMonitor] Stopped while suspicious — clearing state');
    }
    if (_onSuspiciousStart || _onSuspiciousEnd) {
        console.log('[InputMonitor] Stopped');
    }
    _onSuspiciousStart = null;
    _onSuspiciousEnd = null;
}

function isSuspicious() {
    return _suspicious;
}

function getSuspiciousStartedAt() {
    return _suspiciousAt;
}

function getSuspiciousDurationSecs() {
    if (!_suspicious || !_suspiciousAt) return 0;
    return Math.floor((Date.now() - _suspiciousAt.getTime()) / 1000);
}

function getLastMetrics() {
    return _lastMetrics;
}

function reset() {
    _buffer = [];
    if (_suspicious) {
        _suspicious = false;
        _suspiciousAt = null;
        console.log('[InputMonitor] Buffer reset — suspicious state cleared');
    }
    _lastMetrics = null;
}

module.exports = {
    start,
    stop,
    isSuspicious,
    getSuspiciousStartedAt,
    getSuspiciousDurationSecs,
    getLastMetrics,
    reset,
};
