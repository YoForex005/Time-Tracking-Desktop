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
