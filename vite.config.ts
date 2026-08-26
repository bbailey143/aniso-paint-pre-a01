import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// WGSL shaders are imported as raw strings via `?raw`.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // 5174, period. Every session note in docs/HANDOFF.md records a "fresh 5174
    // reload", so this is where the work actually happens; 5173 was a leftover
    // that kept reappearing because `tools/start-ipad.ps1` passed it on the
    // command line, which OVERRIDES this file.
    port: 5174,
    // Fail loudly on a collision rather than drifting to the next free port and
    // leaving two servers up, one of them stale.
    strictPort: true,
    // Cloudflare assigns a new temporary subdomain for each iPad test session.
    // Keep this narrow: do not set `allowedHosts: true` for a public tunnel.
    allowedHosts: ['.trycloudflare.com'],
  },
  build: { target: 'es2022' },
});
