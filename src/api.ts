import { API_BASE } from './config';

/**
 * Thrown whenever the backend returns 401 Unauthorized.
 * App.tsx listens for the custom 'wf:session-expired' event to
 * clear state and redirect to the login screen automatically.
 */
export class SessionExpiredError extends Error {
    constructor() {
        super('Session expired — please log in again.');
        this.name = 'SessionExpiredError';
    }
}

/**
 * Central response handler for all authenticated API calls.
 * - 401 → clears localStorage, fires 'wf:session-expired', throws SessionExpiredError
 * - Other errors → throws with the server's error message
 */
async function handleResponse(res: Response) {
    const data = await res.json();
    if (res.status === 401) {
        localStorage.removeItem('wf_token');
        localStorage.removeItem('wf_user');
        localStorage.removeItem('wf_idle_threshold');
        window.dispatchEvent(new Event('wf:session-expired'));
        throw new SessionExpiredError();
    }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

function getNetworkError(error: unknown): Error {
    if (error instanceof TypeError) {
        return new Error(`Backend is not reachable at ${API_BASE}. Make sure the backend server is running.`);
    }

    return error instanceof Error ? error : new Error('Network request failed');
}

async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    try {
        return await fetch(input, init);
    } catch (error) {
        throw getNetworkError(error);
    }
}

function getToken(): string | null {
    return localStorage.getItem('wf_token');
}

function authHeaders() {
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
    };
}

export function formatLocalIsoWithOffset(date = new Date()): string {
    const pad = (value: number, size = 2) => String(value).padStart(size, '0');
    const offsetMinutes = -date.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absOffset = Math.abs(offsetMinutes);
    const offsetHours = Math.floor(absOffset / 60);
    const offsetMins = absOffset % 60;

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
        `.${pad(date.getMilliseconds(), 3)}${sign}${pad(offsetHours)}:${pad(offsetMins)}`;
}

function clientTimestampPayload(date = new Date()) {
    return {
        clientLocalTime: formatLocalIsoWithOffset(date),
        clientTimezoneOffsetMinutes: date.getTimezoneOffset(),
        clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
}

function clientTimestampQuery(date = new Date()): string {
    const params = new URLSearchParams();
    const payload = clientTimestampPayload(date);
    params.set('clientLocalTime', payload.clientLocalTime);
    params.set('clientTimezoneOffsetMinutes', String(payload.clientTimezoneOffsetMinutes));
    params.set('clientTimeZone', payload.clientTimeZone);
    return params.toString();
}


export async function login(email: string, password: string) {
    const res = await apiFetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    // NOTE: idleThresholdSecs is now returned by the backend (set by admin per user).
    // We persist it to localStorage so useAppTracker.ts can read it on every poll.
    if (data.user?.idleThresholdSecs !== undefined) {
        localStorage.setItem('wf_idle_threshold', String(data.user.idleThresholdSecs));
    }

    return data as { token: string; user: { id: string; name: string; email: string; idleThresholdSecs: number } };
}

export async function getStatus() {
    const res = await apiFetch(`${API_BASE}/time/status`, { headers: authHeaders() });
    const data = await handleResponse(res);
    return data as {
        status: 'stopped' | 'working' | 'on_break';
        shift: {
            id: string;
            startTime: string;
            regularEndTime?: string | null;
            regularWorkSecs?: number | null;
            regularBreakSecs?: number | null;
            overtimeAccepted?: boolean | null;
            overtimeDecisionAt?: string | null;
            overtimeStartTime?: string | null;
            overtimeEndTime?: string | null;
            overtimeStatus?: 'none' | 'active' | 'completed' | string;
            breaks: Array<{ id: string; startTime: string; endTime: string | null }>;
            workLocation?: string;
            graceAppliedSecs?: number;
            timeAdjustmentSecs?: number;
        } | null;
        idleThresholdSecs: number;
        expectedWorkSecs: number;
        expectedBreakSecs: number;
        expectedActiveSecs: number;
        maxBreaks: number;
        screenshotIntervalSecs: number;
        breakReminderAfterSecs?: number;
        breakReminderRepeatSecs?: number;
        wfhCaptureIntervalMs?: number;
        wfhScreenIdleThresholdSecs?: number;
        wfhThumbWidth?: number;
        wfhThumbHeight?: number;
    };
}

export async function startShift(workLocation: 'wfh' | 'office') {
    const res = await apiFetch(`${API_BASE}/time/start`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ work_location: workLocation, ...clientTimestampPayload() }),
    });
    return handleResponse(res);
}

export async function toggleBreak() {
    const res = await apiFetch(`${API_BASE}/time/break`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(clientTimestampPayload()),
    });
    return handleResponse(res);
}

export async function stopShift(options: { overtimeAccepted?: boolean } = {}) {
    const res = await apiFetch(`${API_BASE}/time/stop`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            ...clientTimestampPayload(),
            ...(typeof options.overtimeAccepted === 'boolean'
                ? { overtimeAccepted: options.overtimeAccepted, overtime_accepted: options.overtimeAccepted }
                : {}),
        }),
    });
    return handleResponse(res);
}

export async function startOvertime() {
    const res = await apiFetch(`${API_BASE}/time/overtime/start`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(clientTimestampPayload()),
    });
    return handleResponse(res);
}

export async function sendHeartbeat() {
    const res = await apiFetch(`${API_BASE}/time/heartbeat`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(clientTimestampPayload()),
    });
    return handleResponse(res);
}

export async function rolloverMidnight(options: { rolloverAt?: Date; continueIdle?: boolean } = {}) {
    const rolloverAt = options.rolloverAt ?? new Date();
    const res = await apiFetch(`${API_BASE}/time/rollover-midnight`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            ...clientTimestampPayload(rolloverAt),
            rolloverAt: formatLocalIsoWithOffset(rolloverAt),
            continueIdle: options.continueIdle === true,
        }),
    });
    return handleResponse(res);
}

export async function getHistory() {
    const res = await apiFetch(`${API_BASE}/time/history`, { headers: authHeaders() });
    const data = await handleResponse(res);
    return data.shifts as Array<{
        id: string;
        startTime: string;
        endTime: string | null;
        regularEndTime?: string | null;
        regularWorkSecs?: number | null;
        regularBreakSecs?: number | null;
        overtimeAccepted?: boolean | null;
        overtimeDecisionAt?: string | null;
        overtimeStartTime?: string | null;
        overtimeEndTime?: string | null;
        overtimeStatus?: 'none' | 'active' | 'completed' | string;
        checkoutType?: 'manual' | 'auto_shutdown' | 'midnight_rollover';
        checkoutReason?: string | null;
        graceAppliedSecs?: number;
        timeAdjustmentSecs?: number;
        breaks: Array<{ id: string; startTime: string; endTime: string | null }>;
    }>;
}


// ─────────────────────────────────────────────────────────────────────────────
// Idle Session API
// The desktop calls these when it detects inactivity / activity resumption.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Notify the server that the user has gone idle.
 * @param startTime - The exact ISO timestamp when idleness began
 *                    (i.e., 60 seconds before this call is made).
 */
export async function startIdleSession(startTime: string) {
    const res = await apiFetch(`${API_BASE}/time/idle/start`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ startTime, ...clientTimestampPayload() }),
    });
    // 409 = idle session already open — not a client error
    if (res.status === 409) return res.json();
    return handleResponse(res);
}

export async function endIdleSession() {
    const res = await apiFetch(`${API_BASE}/time/idle/end`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(clientTimestampPayload()),
    });
    return handleResponse(res);
}

export async function getTodayIdleSecs(): Promise<number> {
    const res = await apiFetch(`${API_BASE}/time/idle/today?${clientTimestampQuery()}`, { headers: authHeaders() });
    const data = await handleResponse(res);
    return (data as { totalIdleSecs: number }).totalIdleSecs;
}


/**
 * Open a Server-Sent Events connection to receive real-time threshold changes.
 *
 * The backend pushes an `idle-threshold-changed` event every time an admin
 * saves a new idleThresholdSecs for this user — arrives in milliseconds.
 *
 * EventSource does NOT support custom Authorization headers, so we pass the
 * token as a query param. The backend auth middleware already accepts this.
 * EventSource auto-reconnects on network drops.
 *
 * @param onThresholdChange  Called with the new threshold (seconds) on change
 * @returns                  Cleanup function — call on component unmount
 */
export function subscribeToThresholdEvents(
    onThresholdChange: (secs: number) => void
): () => void {
    const token = getToken();
    if (!token) return () => { }; // not logged in

    const url = `${API_BASE}/time/events?token=${encodeURIComponent(token)}`;
    const source = new EventSource(url);

    source.addEventListener('idle-threshold-changed', (e: MessageEvent) => {
        try {
            const { idleThresholdSecs } = JSON.parse(e.data) as { idleThresholdSecs: number };
            if (typeof idleThresholdSecs === 'number') {
                onThresholdChange(idleThresholdSecs);
            }
        } catch { /* malformed event — ignore */ }
    });

    source.onerror = () => {
        // EventSource will auto-reconnect; no action needed
    };

    return () => source.close();
}
