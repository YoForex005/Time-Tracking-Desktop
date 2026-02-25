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

export interface AppUsageData {
    name: string;
    title: string;
    seconds: number;
}

/**
 * Placeholder API call to sync application usage to the backend.
 * This is currently pushing to a mock/future endpoint.
 */
export async function syncUsageData(usage: AppUsageData[]) {
    try {
        const res = await fetch(`${API_BASE}/usage/sync`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ usage }),
        });

        // Don't throw errors for the silent background sync to avoid polluting the UI
        if (!res.ok) {
            console.warn('[Sync] Usage sync received non-OK response (expected if endpoint missing)', res.status);
        }
        return res;
    } catch (e) {
        // Will fail gracefully if the backend doesn't have the endpoint yet.
        console.warn('[Sync] Usage sync failed. Backend endpoint might not exist yet.');
    }
}
