/**
 * src/config.ts — Centralized configuration for the Desktop App (Renderer)
 * ─────────────────────────────────────────────────────────────────────────
 * Single source of truth for the backend API URL.
 * Uses Vite's env variable system (import.meta.env).
 */

export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:5000/api';
