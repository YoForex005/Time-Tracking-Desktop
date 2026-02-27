const { captureCurrentMonitorPng } = require('./screenshotCapture');
const { getDefaultDeviceId, getWorkStatus, uploadScreenshot } = require('./screenshotUploader');

const IS_DEV = process.env.NODE_ENV === 'development';
const SCREENSHOT_INTERVAL_MS = IS_DEV ? 30_000 : 20 * 60 * 1000;

let authToken = null;
let timer = null;
let running = false;
let tickInFlight = false;

const deviceId = getDefaultDeviceId();

function describeInterval(ms) {
    if (ms >= 60_000) return `${Math.round(ms / 60_000)} minute(s)`;
    return `${Math.round(ms / 1000)} second(s)`;
}

function clearTimer() {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
}

function scheduleNextTick() {
    clearTimer();
    if (!running) return;
    console.log(`[Screenshot] Next capture in ${describeInterval(SCREENSHOT_INTERVAL_MS)}`);

    timer = setTimeout(async () => {
        await runCaptureCycle();
        scheduleNextTick();
    }, SCREENSHOT_INTERVAL_MS);
}

async function runCaptureCycle() {
    if (tickInFlight) {
        console.log('[Screenshot] Skipping cycle: previous cycle still running');
        return;
    }
    if (!authToken) {
        console.log('[Screenshot] Skipping cycle: auth token missing');
        return;
    }

    tickInFlight = true;
    try {
        console.log(`[Screenshot] Cycle started at ${new Date().toISOString()}`);
        const status = await getWorkStatus(authToken);
        console.log(`[Screenshot] Current work status: ${status ?? 'unknown'}`);
        if (status !== 'working') {
            console.log('[Screenshot] Skipped capture: user is not in working status');
            return;
        }

        const capture = await captureCurrentMonitorPng();
        console.log(
            `[Screenshot] Captured monitor ${capture.display.width}x${capture.display.height} (${capture.imageBuffer.length} bytes PNG)`
        );
        const payload = {
            capturedAt: new Date().toISOString(),
            deviceId,
            display: capture.display,
            imageBase64: capture.imageBuffer.toString('base64'),
        };

        const response = await uploadScreenshot(authToken, payload);
        const screenshotId = response?.data?.screenshot?.id;
        console.log(
            screenshotId
                ? `[Screenshot] Upload success. Backend screenshot id: ${screenshotId}`
                : '[Screenshot] Upload success.'
        );
    } catch (err) {
        const statusCode = err?.response?.status;
        const backendMessage = err?.response?.data?.error;
        if (statusCode === 503) {
            console.log('[Screenshot] Upload rejected: admin drive is disconnected');
        } else if (statusCode === 401) {
            console.log('[Screenshot] Upload skipped: auth token expired');
        } else {
            const msg = err instanceof Error ? err.message : 'Unknown screenshot error';
            console.log('[Screenshot] Capture/upload failed:', backendMessage || msg);
        }
    } finally {
        tickInFlight = false;
    }
}

function setAuthToken(token) {
    if (typeof token !== 'string') {
        authToken = null;
        return;
    }
    const normalized = token.trim().replace(/^Bearer\s+/i, '');
    authToken = normalized || null;

    // Restart interval timing after login so the first capture aligns with current interval.
    if (running) scheduleNextTick();
}

function clearAuthToken() {
    authToken = null;
}

function start() {
    if (running) return;
    running = true;
    scheduleNextTick();
    console.log(`[Screenshot] Scheduler started (${describeInterval(SCREENSHOT_INTERVAL_MS)} interval, mode=${IS_DEV ? 'dev' : 'prod'})`);
}

function stop() {
    running = false;
    clearTimer();
    console.log('[Screenshot] Scheduler stopped');
}

module.exports = {
    start,
    stop,
    setAuthToken,
    clearAuthToken,
};
