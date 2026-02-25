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
    return data as { token: string; user: { id: string; name: string; email: string } };
}

export async function getStatus() {
    const res = await fetch(`${API_BASE}/time/status`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to get status');
    return data as { status: 'stopped' | 'working' | 'on_break'; shift: unknown };
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

