import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// API_URL lets you point the dev proxy at another server (e.g. a test instance).
const apiUrl = process.env.API_URL || 'http://localhost:5000';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Source maps for the watch build used by `npm run dev`.
  build: { sourcemap: mode === 'development' },
  // Listen on every interface, so the app can be opened from another machine
  // (a VM host, a phone on the same network) at http://<this machine's IP>:3000.
  server: {
    host: true,
    port: 3000,
    proxy: {
      '/api': apiUrl,
      '/socket.io': { target: apiUrl, ws: true },
    },
  },
  preview: { host: true, port: 3000 },
}));
