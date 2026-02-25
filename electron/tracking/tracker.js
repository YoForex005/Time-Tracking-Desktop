const { execFile } = require('child_process');

// ── Configuration ─────────────────────────────────────────────────────────────
const TRACKING_INTERVAL_MS = 5000; // 5 seconds (faster detection)

// ── Excluded processes (system/noise + unwanted apps) ─────────────────────────
const EXCLUDED_PROCESSES = [
    // System processes
    'svchost', 'dwm', 'csrss', 'wininit', 'winlogon', 'fontdrvhost',
    'lsass', 'services', 'registry', 'smss', 'spoolsv', 'unsecapp',
    'wmiprvse', 'dllhost', 'msiexec', 'taskhostw', 'sihost', 'ctfmon',
    
    // Windows UI
    'searchhost', 'shellexperiencehost', 'startmenuexperiencehost',
    'runtimebroker', 'applicationframehost', 'systemsettings',
    'textinputhost', 'lockapp', 'taskmgr',
    
    // Background services
    'backgroundtaskhost', 'searchindexer', 'securityhealthservice',
    'gamebarpresencewriter', 'audiodg', 'smartscreen', 'wudfhost',
    'mobsync', 'dataexchangehost', 'locationnotificationwindows',
    'monotificationux', 'm365copilot', 'widgets',
    
    // Development noise
    'node', 'git', 'npm', 'esbuild', 'language_server', 'conhost',
    'powershell', 'cmd',
    
    // Edge WebView (background)
    'msedgewebview2'
];

// ── PowerShell script: Get ONLY visible windows + real foreground ─────────────
const PS_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
public class WinAPI {
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    
    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);
    
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    
    [DllImport("user32.dll")]
    public static extern long GetWindowLong(IntPtr hWnd, int nIndex);
    
    const int GWL_STYLE = -16;
    const long WS_VISIBLE = 0x10000000L;
    const long WS_CAPTION = 0x00C00000L;

    public static List<Tuple<uint, IntPtr, string>> GetAllVisibleWindows() {
        var windows = new List<Tuple<uint, IntPtr, string>>();
        EnumWindows((hWnd, lParam) => {
            // Must be visible
            if (!IsWindowVisible(hWnd)) return true;
            
            // Get window style
            long style = GetWindowLong(hWnd, GWL_STYLE);
            
            // Must have caption (title bar) or be visible
            if ((style & WS_VISIBLE) == 0) return true;
            
            // Get title
            int length = GetWindowTextLength(hWnd);
            StringBuilder sb = new StringBuilder(length + 1);
            GetWindowText(hWnd, sb, sb.Capacity);
            string title = sb.ToString();
            
            // Get process ID
            uint procId = 0;
            GetWindowThreadProcessId(hWnd, out procId);
            
            // Add to list (even if title is empty - we'll get process name)
            windows.Add(new Tuple<uint, IntPtr, string>(procId, hWnd, title));
            return true;
        }, IntPtr.Zero);
        return windows;
    }

    public static IntPtr GetForeground() {
        return GetForegroundWindow();
    }
}
"@

$foregroundHwnd = [WinAPI]::GetForeground()
$foregroundProcId = 0
[WinAPI]::GetWindowThreadProcessId($foregroundHwnd, [ref]$foregroundProcId) | Out-Null

$windows = [WinAPI]::GetAllVisibleWindows()
$results = @()
$seenPids = @{}

foreach ($win in $windows) {
    $procId = $win.Item1
    $hwnd = $win.Item2
    $title = $win.Item3
    
    if ($seenPids.ContainsKey($procId)) { continue }
    $seenPids[$procId] = $true
    
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($proc -eq $null) { continue }
    
    # Use process description if available, otherwise process name
    $displayName = if ($proc.Description) { $proc.Description } else { $proc.ProcessName }
    
    $results += [PSCustomObject]@{
        Process      = $proc.ProcessName
        DisplayName  = $displayName
        Title        = $title
        Path         = $proc.Path
        PID          = $procId
        IsForeground = ($procId -eq $foregroundProcId)
    }
}

$results | ConvertTo-Json -Compress
`;

// ── State ─────────────────────────────────────────────────────────────────────
let trackingInterval = null;
let usageMap = new Map();
let currentApp = null;
let lastSeenPids = new Set();

// ── Fetch all visible windowed apps ───────────────────────────────────────────
function getRunningApps() {
    return new Promise((resolve) => {
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS_SCRIPT],
            { timeout: 8000 },
            (err, stdout, stderr) => {
                if (err || !stdout || !stdout.trim()) {
                    if (stderr) console.warn('[Tracker] PS stderr:', stderr.trim());
                    return resolve([]);
                }
                try {
                    let data = JSON.parse(stdout.trim());
                    if (!Array.isArray(data)) data = [data];
                    resolve(data);
                } catch (e) {
                    console.warn('[Tracker] Parse error:', e.message);
                    resolve([]);
                }
            }
        );
    });
}

function isExcluded(processName) {
    if (!processName) return true;
    const lower = processName.toLowerCase();
    return EXCLUDED_PROCESSES.some(ex => lower.includes(ex));
}

// ── Clean app name extraction (ACCEPTS ALL APPS NOW) ──────────────────────────
function getCleanAppName(processName, windowTitle, displayName) {
    const lower = processName.toLowerCase();
    
    // Chrome/Edge - extract website name
    if (lower.includes('chrome') || lower.includes('msedge')) {
        if (!windowTitle) return 'Chrome';
        
        let cleaned = windowTitle
            .replace(/ - Google Chrome$/, '')
            .replace(/ - Microsoft Edge$/, '')
            .trim();
        
        const match = cleaned.match(/^([^-|]+)/);
        if (match) {
            cleaned = match[1].trim();
        }
        
        if (cleaned.length > 50) return 'Chrome';
        return cleaned || 'Chrome';
    }
    
    // Firefox
    if (lower.includes('firefox')) {
        if (!windowTitle) return 'Firefox';
        let cleaned = windowTitle.replace(/ - Mozilla Firefox$/, '').trim();
        if (cleaned.length > 50) return 'Firefox';
        return cleaned || 'Firefox';
    }
    
    // VS Code
    if (lower === 'code') {
        return 'VS Code';
    }
    
    // Antigravity IDE
    if (lower === 'antigravity') {
        return 'Antigravity IDE';
    }
    
    // Brave browser
    if (lower.includes('brave')) {
        if (!windowTitle) return 'Brave';
        let cleaned = windowTitle.replace(/ - Brave$/, '').trim();
        if (cleaned.length > 50) return 'Brave';
        return cleaned || 'Brave';
    }
    
    // Microsoft Store
    if (lower === 'winstore.app' || lower.includes('store')) {
        return 'Microsoft Store';
    }
    
    // Common apps
    if (lower === 'discord') return 'Discord';
    if (lower === 'spotify') return 'Spotify';
    if (lower === 'slack') return 'Slack';
    if (lower === 'telegram') return 'Telegram';
    if (lower === 'whatsapp') return 'WhatsApp';
    if (lower === 'notepad') return 'Notepad';
    if (lower === 'notepad++') return 'Notepad++';
    if (lower === 'vlc') return 'VLC Media Player';
    if (lower === 'steam') return 'Steam';
    if (lower === 'obs64' || lower === 'obs32') return 'OBS Studio';
    if (lower === 'photoshop') return 'Photoshop';
    if (lower === 'illustrator') return 'Illustrator';
    if (lower === 'excel') return 'Microsoft Excel';
    if (lower === 'winword') return 'Microsoft Word';
    if (lower === 'powerpnt') return 'Microsoft PowerPoint';
    if (lower === 'outlook') return 'Microsoft Outlook';
    
    // If we have a display name (Windows description), use it
    if (displayName && displayName !== processName) {
        return displayName;
    }
    
    // If window title is short and meaningful, use it
    if (windowTitle && windowTitle.length > 0 && windowTitle.length < 60) {
        // Don't use generic titles
        const genericTitles = ['window', 'untitled', 'new', 'blank'];
        const titleLower = windowTitle.toLowerCase();
        const isGeneric = genericTitles.some(g => titleLower.includes(g));
        
        if (!isGeneric) {
            return windowTitle;
        }
    }
    
    // Last resort: capitalize process name
    return processName.charAt(0).toUpperCase() + processName.slice(1);
}

async function recordActiveWindow() {
    try {
        const apps = await getRunningApps();
        if (!apps || apps.length === 0) {
            console.log('[Tracker] No apps detected');
            return null;
        }

        const durationToAdd = TRACKING_INTERVAL_MS / 1000;
        const currentSeenPids = new Set();
        const validApps = [];
        let foregroundApp = null;

        console.log(`[Tracker] Raw apps detected: ${apps.length}`);

        // Process current apps
        apps.forEach(app => {
            if (!app.Process || !app.PID) {
                console.log(`[Tracker] Skipped (no process/PID): ${JSON.stringify(app)}`);
                return;
            }
            
            if (isExcluded(app.Process)) {
                console.log(`[Tracker] Excluded: ${app.Process}`);
                return;
            }

            currentSeenPids.add(app.PID);
            
            // Get clean app name
            const appName = getCleanAppName(app.Process, app.Title, app.DisplayName);
            const originalTitle = app.Title || '';

            console.log(`[Tracker] Detected: ${app.Process} → ${appName} (Foreground: ${app.IsForeground})`);

            // Track foreground app
            if (app.IsForeground) {
                foregroundApp = {
                    name: appName,
                    title: originalTitle,
                    path: app.Path || '',
                    owner: app.Process,
                    pid: app.PID,
                    timestamp: Date.now()
                };
                currentApp = foregroundApp;
                console.log(`[Tracker] ✓ Foreground set: ${appName}`);
            }

            // Add time to this app
            const existing = usageMap.get(appName) || { 
                seconds: 0, 
                title: originalTitle, 
                path: app.Path || '',
                lastSeen: Date.now()
            };
            
            usageMap.set(appName, {
                seconds: existing.seconds + durationToAdd,
                title: originalTitle,
                path: app.Path || '',
                lastSeen: Date.now()
            });

            validApps.push(appName);
        });

        // Clean up closed apps (not seen for 30 seconds)
        const now = Date.now();
        for (const [appName, data] of usageMap.entries()) {
            if (now - data.lastSeen > 30000) {
                console.log(`[Tracker] Removed closed app: ${appName}`);
                usageMap.delete(appName);
            }
        }

        lastSeenPids = currentSeenPids;

        if (validApps.length > 0) {
            console.log(`[Tracker] ═══════════════════════════════════`);
            console.log(`[Tracker] Open apps (${validApps.length}): ${validApps.join(', ')}`);
            console.log(`[Tracker] Foreground: ${foregroundApp ? foregroundApp.name : '❌ NONE'}`);
            console.log(`[Tracker] ═══════════════════════════════════`);
        } else {
            console.log(`[Tracker] ⚠️ No valid apps found!`);
        }

        return {
            active: currentApp,
            usage: getUsageArray()
        };

    } catch (err) {
        console.warn('[Tracker] Error:', err.message);
        return null;
    }
}

function getUsageArray() {
    return Array.from(usageMap.entries()).map(([name, data]) => ({
        name,
        title: data.title,
        path: data.path,
        seconds: data.seconds
    })).sort((a, b) => b.seconds - a.seconds);
}

function startTracking(mainWindow) {
    if (trackingInterval) return;

    console.log(`[Tracker] 🚀 Started polling every ${TRACKING_INTERVAL_MS / 1000}s`);

    recordActiveWindow().then(data => {
        if (data && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app-tracker-update', data);
        }
    });

    trackingInterval = setInterval(async () => {
        const data = await recordActiveWindow();
        if (data && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app-tracker-update', data);
        }
    }, TRACKING_INTERVAL_MS);

    console.log(`[Tracker] ✓ Interval registered`);
}

function stopTracking() {
    if (trackingInterval) {
        clearInterval(trackingInterval);
        trackingInterval = null;
        console.log('[Tracker] 🛑 Stopped.');
    }
}

function clearTrackingData() {
    usageMap.clear();
    currentApp = null;
    lastSeenPids.clear();
    console.log('[Tracker] 🗑️ Data cleared');
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