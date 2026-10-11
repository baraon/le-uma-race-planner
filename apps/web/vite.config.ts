import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In dev, the browser talks only to Vite (one origin, so session cookies just work); Vite
// forwards /api and /auth to the Fastify API. In Docker the API is at http://api:3000.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/auth': { target: apiTarget, changeOrigin: false },
    },
    // File-change events don't cross some Docker bind mounts (e.g. Windows folders); poll instead.
    watch: process.env.VITE_POLL === 'true' ? { usePolling: true, interval: 300 } : undefined,
  },
});
