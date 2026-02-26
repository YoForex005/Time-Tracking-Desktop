const API_BASE = 'http://localhost:5000/api';

function getToken(): string | null {
    return localStorage.getItem('wf_token');
}

function authHeaders() {
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
    };
}

export async function login(email: string, password: string) {
    const res = await fetch(`${API_BASE}/auth/login`, {
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
    const res = await fetch(`${API_BASE}/time/status`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to get status');
    return data as {
        status: 'stopped' | 'working' | 'on_break';
        shift: unknown;
        idleThresholdSecs:  number; // live value — updated by admin in real time
        expectedWorkSecs:   number; // org-wide expected shift duration
        expectedActiveSecs: number; // org-wide expected active (non-idle) duration
    };
}


export async function startShift() {
    const res = await fetch(`${API_BASE}/time/start`, {
        method: 'POST',
        headers: authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start shift');
    return data;
}

export async function toggleBreak() {
    const res = await fetch(`${API_BASE}/time/break`, {
        method: 'POST',
        headers: authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to toggle break');
    return data;
}

export async function stopShift() {
    const res = await fetch(`${API_BASE}/time/stop`, {
        method: 'POST',
        headers: authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to stop shift');
    return data;
}

export async function getHistory() {
    const res = await fetch(`${API_BASE}/time/history`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to get history');
    return data.shifts as Array<{
        id: string;
        startTime: string;
        endTime: string | null;
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
    const res = await fetch(`${API_BASE}/time/idle/start`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ startTime }),
    });
    const data = await res.json();
    // 409 means an idle session is already open — not an error for the client
    if (!res.ok && res.status !== 409) throw new Error(data.error || 'Failed to start idle session');
    return data;
}

/**
 * Notify the server that the user is active again (idle period ended).
 */
export async function endIdleSession() {
    const res = await fetch(`${API_BASE}/time/idle/end`, {
        method: 'POST',
        headers: authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to end idle session');
    return data;
}

/**
 * Fetch today's total idle seconds for the dashboard pie chart.
 */
export async function getTodayIdleSecs(): Promise<number> {
    const res = await fetch(`${API_BASE}/time/idle/today`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to get idle data');
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
