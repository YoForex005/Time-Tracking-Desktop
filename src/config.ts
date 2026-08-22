/**
 * src/config.ts — Centralized configuration for the Desktop App (Renderer)
 * ─────────────────────────────────────────────────────────────────────────
 * Single source of truth for the backend API URL.
 * Uses Vite's env variable system (import.meta.env).
 */

const PRODUCTION_API_BASE = 'http://127.0.0.1:3005/api';
const PRODUCTION_WEB_APP_URL = 'http://localhost:3001';


export const API_BASE = import.meta.env.PROD
    ? PRODUCTION_API_BASE
    : import.meta.env.VITE_API_BASE ?? 'http://localhost:3005/api';

export const WEB_APP_URL = import.meta.env.PROD
    ? PRODUCTION_WEB_APP_URL
    : import.meta.env.VITE_WEB_APP_URL ?? 'http://localhost:3001';
