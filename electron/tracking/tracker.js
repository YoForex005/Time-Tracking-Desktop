const activeWin = require('active-win');

// ── Configuration ─────────────────────────────────────────────────────────────
const TRACKING_INTERVAL_MS = 10000; // 10 seconds (per user request)

// ── State ─────────────────────────────────────────────────────────────────────
let trackingInterval = null;
let currentApp = null;
let usageMap = new Map(); // Key: appName/title, Value: total seconds

/**
 * Extracts a cleaner domain or app name from the window title, 
 * especially useful for browsers.
 */
function extractWebsiteOrAppName(ownerName, windowTitle) {
    if (!windowTitle) return ownerName;

    const lowerOwner = ownerName.toLowerCase();
    const isBrowser = lowerOwner.includes('chrome') ||
        lowerOwner.includes('edge') ||
        lowerOwner.includes('firefox') ||
        lowerOwner.includes('brave') ||
        lowerOwner.includes('opera') ||
        lowerOwner.includes('safari');

    if (isBrowser) {
        // e.g. "YouTube - Google Chrome" -> "YouTube"
        const titleParts = windowTitle.split(/ - | \| /);
        if (titleParts.length > 1) {
            // Usually the first part is the actual site title
            return titleParts[0].trim();
        }
        return windowTitle.trim();
    }

    return ownerName; // Fallback to executable owner name
}

// ── Core Logic ────────────────────────────────────────────────────────────────

async function recordActiveWindow() {
    try {
        const win = await activeWin();
        if (!win || !win.owner || !win.owner.name) return null;

        const ownerName = win.owner.name;
        const windowTitle = win.title || '';

        // Extract a more human-readable name, particularly separating websites if it's a browser
        const appName = extractWebsiteOrAppName(ownerName, windowTitle);

        // Update current app reference for immediate status
        currentApp = {
            name: appName,
            title: windowTitle,
            path: win.owner.path || '',
            owner: ownerName,
            timestamp: Date.now()
        };

        // Increment duration in map (adding 10 seconds per interval)
        const durationToAdd = TRACKING_INTERVAL_MS / 1000;
        const existing = usageMap.get(appName) || { seconds: 0, title: windowTitle };

        usageMap.set(appName, {
            seconds: existing.seconds + durationToAdd,
            title: windowTitle // Keep latest title
        });

        return {
            active: currentApp,
            usage: getUsageArray()
        };
    } catch (err) {
        // active-win may fail on certain permission issues, fail silently but log in dev
        console.warn('[Tracker] Error fetching active window:', err.message);
        return null;
    }
}

function getUsageArray() {
    return Array.from(usageMap.entries()).map(([name, data]) => ({
        name,
        title: data.title,
        seconds: data.seconds
    })).sort((a, b) => b.seconds - a.seconds); // Highest usage first
}

// ── Exports ───────────────────────────────────────────────────────────────────

function startTracking(mainWindow) {
    if (trackingInterval) return;

    console.log(`[Tracker] Started polling active window every ${TRACKING_INTERVAL_MS / 1000}s`);

    // Immediate first tick
    recordActiveWindow().then(data => {
        if (data && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app-tracker-update', data);
        }
    });

    trackingInterval = setInterval(async () => {
        const data = await recordActiveWindow();
        if (data && mainWindow && !mainWindow.isDestroyed()) {
            // Push live update to renderer
            mainWindow.webContents.send('app-tracker-update', data);
        }
    }, TRACKING_INTERVAL_MS);
}

function stopTracking() {
    if (trackingInterval) {
        clearInterval(trackingInterval);
        trackingInterval = null;
        console.log('[Tracker] Stopped polling.');
    }
}

function clearTrackingData() {
    usageMap.clear();
    currentApp = null;
}

function getCurrentData() {
    return {
        active: currentApp,
        usage: getUsageArray()
    };
}

module.exports = {
    startTracking,
    stopTracking,
    clearTrackingData,
    getCurrentData
};
