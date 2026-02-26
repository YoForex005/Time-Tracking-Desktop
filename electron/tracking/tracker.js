const { execFile } = require('child_process');
const axios = require('axios');

const TRACKING_INTERVAL_MS = 5000;
const SYNC_INTERVAL_MS = 10000;
const API_BASE = 'http://localhost:5000/api';

const EXCLUDED_PROCESSES = [
    'svchost', 'dwm', 'csrss', 'wininit', 'winlogon', 'fontdrvhost',
    'lsass', 'services', 'registry', 'smss', 'spoolsv', 'unsecapp',
    'wmiprvse', 'dllhost', 'msiexec', 'taskhostw', 'sihost', 'ctfmon',
    'searchhost', 'shellexperiencehost', 'startmenuexperiencehost',
    'runtimebroker', 'applicationframehost', 'systemsettings',
    'textinputhost', 'lockapp', 'taskmgr',
    'backgroundtaskhost', 'searchindexer', 'securityhealthservice',
    'gamebarpresencewriter', 'audiodg', 'smartscreen', 'wudfhost',
    'mobsync', 'dataexchangehost', 'locationnotificationwindows',
    'monotificationux', 'm365copilot', 'widgets',
    'node', 'git', 'npm', 'esbuild', 'language_server', 'conhost',
    'powershell', 'cmd',
    'msedgewebview2'
];

const PS_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
public class WinAPI {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

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

    public static List<Tuple<uint, IntPtr, string>> GetAllVisibleWindows() {
        var windows = new List<Tuple<uint, IntPtr, string>>();
        EnumWindows((hWnd, lParam) => {
            if (!IsWindowVisible(hWnd)) return true;

            int length = GetWindowTextLength(hWnd);
            StringBuilder sb = new StringBuilder(length + 1);
            GetWindowText(hWnd, sb, sb.Capacity);
            string title = sb.ToString();

            uint procId = 0;
            GetWindowThreadProcessId(hWnd, out procId);

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

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Get-WindowUrl {
    param([IntPtr]$Hwnd)
    try {
        $root = [System.Windows.Automation.AutomationElement]::FromHandle($Hwnd)
        if ($null -eq $root) { return $null }

        $condEdit = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
            [System.Windows.Automation.ControlType]::Edit
        )

        $edits = $root.FindAll([System.Windows.Automation.TreeScope]::Subtree, $condEdit)
        foreach ($e in $edits) {
            $name = $e.Current.Name
            $aid = $e.Current.AutomationId

            $candidate = $false
            if ($aid -and $aid -match '(?i)address|urlbar') { $candidate = $true }
            if (-not $candidate -and $name) {
                if ($name -match '(?i)Address and search bar|Search or enter address|Address bar|Search with|Search or enter web address') { $candidate = $true }
            }
            if (-not $candidate) { continue }

            $value = $null
            try {
                $vp = $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                if ($vp) { $value = $vp.Current.Value }
            } catch {}

            if (-not $value) {
                try {
                    $tp = $e.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
                    if ($tp) { $value = $tp.DocumentRange.GetText(-1) }
                } catch {}
            }

            if ($value) {
                $value = $value.Trim()
                if ($value.Length -gt 0) { return $value }
            }
        }
    } catch {}

    return $null
}

$foregroundHwnd = [WinAPI]::GetForeground()
$foregroundProcId = 0
[WinAPI]::GetWindowThreadProcessId($foregroundHwnd, [ref]$foregroundProcId) | Out-Null

$windows = [WinAPI]::GetAllVisibleWindows()
$results = @()

foreach ($win in $windows) {
    $procId = $win.Item1
    $hwnd = $win.Item2
    $title = $win.Item3

    if ($procId -eq 0) { continue }

    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($null -eq $proc) { continue }

    $path = $null
    try { $path = $proc.Path } catch {}

    $displayName = $null
    if ($path) {
        try {
            $fvi = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($path)
            if ($fvi.ProductName) { $displayName = $fvi.ProductName }
            elseif ($fvi.FileDescription) { $displayName = $fvi.FileDescription }
        } catch {}
    }

    if (-not $displayName) {
        try { if ($proc.Description) { $displayName = $proc.Description } } catch {}
    }

    if (-not $displayName) { $displayName = $proc.ProcessName }

    $pname = $proc.ProcessName
    $url = $null
    if ($pname -match '^(chrome|msedge|brave|firefox)$') {
        $url = Get-WindowUrl -Hwnd $hwnd
    }

    $results += [PSCustomObject]@{
        Process      = $pname
        DisplayName  = $displayName
        Title        = $title
        Url          = $url
        Path         = $path
        PID          = [int]$procId
        HWND         = $hwnd.ToInt64()
        IsForeground = ($procId -eq $foregroundProcId)
    }
}

$results | ConvertTo-Json -Compress -Depth 4
`;

const APP_NAME_OVERRIDES = {
    'code': 'VS Code',
    'winword': 'Microsoft Word',
    'excel': 'Microsoft Excel',
    'powerpnt': 'Microsoft PowerPoint',
    'outlook': 'Microsoft Outlook',
    'notepad': 'Notepad',
    'notepad++': 'Notepad++',
    'vlc': 'VLC Media Player',
    'steam': 'Steam',
    'discord': 'Discord',
    'spotify': 'Spotify',
    'slack': 'Slack',
    'telegram': 'Telegram',
    'whatsapp': 'WhatsApp',
    'obs64': 'OBS Studio',
    'obs32': 'OBS Studio',
    'photoshop': 'Adobe Photoshop',
    'illustrator': 'Adobe Illustrator',
    'explorer': 'File Explorer',
    'chrome': 'Google Chrome',
    'msedge': 'Microsoft Edge',
    'brave': 'Brave',
    'firefox': 'Firefox'
};

let trackingInterval = null;
let usageMap = new Map();
let currentApp = null;
let lastSeenPids = new Set();
let lastSyncTime = Date.now();

function normalizeProcessName(processName) {
    if (!processName) return '';
    return String(processName).replace(/\.exe$/i, '').toLowerCase();
}

function isExcluded(processName) {
    const lower = normalizeProcessName(processName);
    if (!lower) return true;
    return EXCLUDED_PROCESSES.some(ex => lower.includes(ex));
}

function cleanDesktopName(name) {
    if (!name) return '';
    let n = String(name);
    n = n.replace(/[®™©]/g, '');
    n = n.replace(/\((32|64)\s*bit\)/ig, '');
    n = n.replace(/\s+/g, ' ').trim();
    n = n.replace(/\s+(19|20)\d{2}\b$/g, '').trim();
    n = n.replace(/\s+v?\d+(?:\.\d+){1,4}\b$/ig, '').trim();
    n = n.replace(/\s+/g, ' ').trim();
    return n;
}

function getDesktopAppName(processName, displayName) {
    const p = normalizeProcessName(processName);
    if (APP_NAME_OVERRIDES[p]) return APP_NAME_OVERRIDES[p];
    const cleaned = cleanDesktopName(displayName || processName);
    if (cleaned) return cleaned;
    if (!p) return 'Unknown';
    return p.charAt(0).toUpperCase() + p.slice(1);
}

function isBrowserProcess(processName) {
    const p = normalizeProcessName(processName);
    return p === 'chrome' || p === 'msedge' || p === 'brave' || p === 'firefox';
}

function getBrowserFallback(processName) {
    const p = normalizeProcessName(processName);
    return APP_NAME_OVERRIDES[p] || 'Browser';
}

function normalizeUrl(rawUrl) {
    if (!rawUrl) return '';
    let s = String(rawUrl).trim();
    if (!s) return '';

    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) {
        if (/^[^\s]+\.[^\s]+$/.test(s) || /^localhost(?::\d+)?(\/|$)/i.test(s)) {
            s = `https://${s}`;
        }
    }

    try {
        const u = new URL(s);
        u.hash = '';
        u.search = '';
        return u.toString();
    } catch (_) {
        return s;
    }
}

function getRunningApps() {
    return new Promise(resolve => {
        execFile(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-STA', '-Command', PS_SCRIPT],
            { timeout: 12000, windowsHide: true, maxBuffer: 1024 * 1024 * 4 },
            (err, stdout, stderr) => {
                if (err || !stdout || !stdout.trim()) {
                    if (stderr && String(stderr).trim()) console.log('[Tracker] PowerShell stderr:', String(stderr).trim());
                    if (err) console.log('[Tracker] PowerShell error:', err.message);
                    return resolve([]);
                }
                try {
                    let data = JSON.parse(stdout.trim());
                    if (!Array.isArray(data)) data = [data];
                    resolve(data);
                } catch (e) {
                    console.log('[Tracker] PowerShell JSON parse error:', e.message);
                    resolve([]);
                }
            }
        );
    });
}

function getKeyForApp(app) {
    const proc = normalizeProcessName(app.Process);
    if (isBrowserProcess(proc)) {
        const url = normalizeUrl(app.Url);
        return url || getBrowserFallback(proc);
    }
    return getDesktopAppName(proc, app.DisplayName);
}

async function recordActiveWindow() {
    try {
        const apps = await getRunningApps();
        if (!apps || apps.length === 0) {
            console.log('[Tracker] No windows detected');
            return null;
        }

        console.log('[Tracker] Windows detected:', apps.length);

        const durationToAdd = TRACKING_INTERVAL_MS / 1000;
        const now = Date.now();

        const currentSeenPids = new Set();
        const seenKeysThisPoll = new Set();
        const openKeys = [];

        let foregroundApp = null;

        for (const app of apps) {
            if (!app || !app.Process || !app.PID) continue;
            if (isExcluded(app.Process)) continue;

            const key = getKeyForApp(app);
            if (!key) continue;

            currentSeenPids.add(app.PID);

            if (app.IsForeground && !foregroundApp) {
                foregroundApp = {
                    name: key,
                    title: app.Title || '',
                    path: app.Path || '',
                    owner: normalizeProcessName(app.Process),
                    pid: app.PID,
                    timestamp: now
                };
            }

            if (seenKeysThisPoll.has(key)) continue;
            seenKeysThisPoll.add(key);
            openKeys.push(key);

            const existing = usageMap.get(key) || {
                seconds: 0,
                title: app.Title || '',
                path: app.Path || '',
                lastSeen: now
            };

            usageMap.set(key, {
                seconds: existing.seconds + durationToAdd,
                title: app.Title || existing.title || '',
                path: app.Path || existing.path || '',
                lastSeen: now
            });

            if (isBrowserProcess(app.Process) && !app.Url) {
                console.log('[Tracker] Browser URL missing:', normalizeProcessName(app.Process), 'Title:', app.Title || '');
            }
        }

        currentApp = foregroundApp;

        for (const [key, data] of usageMap.entries()) {
            if (now - data.lastSeen > 30000) usageMap.delete(key);
        }

        lastSeenPids = currentSeenPids;

        console.log('[Tracker] Open items:', openKeys.length);
        if (openKeys.length) console.log('[Tracker] Items:', openKeys.join(', '));
        console.log('[Tracker] Foreground:', foregroundApp ? foregroundApp.name : 'NONE');

        return {
            active: currentApp,
            usage: getUsageArray()
        };
    } catch (err) {
        console.log('[Tracker] Error:', err.message);
        return null;
    }
}

async function syncDataToBackend(data) {
    if (!data || !data.usage) return;

    console.log('[Tracker] Syncing to backend');

    try {
        await axios.post(
            `${API_BASE}/usage/sync`,
            { active: data.active, usage: data.usage },
            { headers: { 'Content-Type': 'application/json' } }
        );
        console.log('[Tracker] Sync success');
    } catch (err) {
        console.log('[Tracker] Sync failed:', err.message);
    }
}

function getUsageArray() {
    return Array.from(usageMap.entries())
        .map(([name, data]) => ({
            name,
            title: data.title,
            path: data.path,
            seconds: data.seconds
        }))
        .sort((a, b) => b.seconds - a.seconds);
}

function startTracking(mainWindow) {
    if (trackingInterval) return;

    console.log('[Tracker] Started polling every', TRACKING_INTERVAL_MS / 1000, 'seconds');

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

        const now = Date.now();
        if (now - lastSyncTime >= SYNC_INTERVAL_MS) {
            lastSyncTime = now;
            if (data && data.usage && data.usage.length > 0) syncDataToBackend(data);
        }
    }, TRACKING_INTERVAL_MS);

    console.log('[Tracker] Interval registered');
}

function stopTracking() {
    if (!trackingInterval) return;
    clearInterval(trackingInterval);
    trackingInterval = null;
    console.log('[Tracker] Stopped');
}

function clearTrackingData() {
    usageMap.clear();
    currentApp = null;
    lastSeenPids.clear();
    console.log('[Tracker] Data cleared');
}

function getCurrentData() {
    return { active: currentApp, usage: getUsageArray() };
}

module.exports = {
    startTracking,
    stopTracking,
    clearTrackingData,
    getCurrentData
};