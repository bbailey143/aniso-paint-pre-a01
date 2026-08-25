import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// WGSL shaders are imported as raw strings via `?raw`.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Cloudflare assigns a new temporary subdomain for each iPad test session.
    // Keep this narrow: do not set `allowedHosts: true` for a public tunnel.
    allowedHosts: ['.trycloudflare.com'],
  },
  build: { target: 'es2022' },
});
