import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Required for Electron: use relative paths so assets load correctly
  // via file:// protocol. Without this, /assets/... resolves from the
  // filesystem root instead of the app directory → blank white/black screen.
  base: './',
})
