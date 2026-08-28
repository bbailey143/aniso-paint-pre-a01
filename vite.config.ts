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
    /* Keep this narrow: never `allowedHosts: true` while a public tunnel can be
       running.

       `.ts.net` is the Tailscale tailnet, which is the better iPad route and
       should become the only one: the hostname is stable instead of rotating
       every session, nothing is exposed to the public internet, and there is no
       DNS propagation wait. Two things must be true for it to work, and the
       second one bites silently:

         1. The iPad is signed into the same tailnet.
         2. HTTPS certificates are ENABLED for the tailnet (admin console → DNS →
            HTTPS Certificates), and the server is published with
            `tailscale serve --bg 5174`.

       Without (2) the iPad gets plain http://…ts.net, which Safari does not
       treat as a secure context, so `navigator.gpu` is simply absent and the app
       fails at startup rather than falling back. That reads as "the app is
       broken on the iPad" and has nothing to do with the app. */
    allowedHosts: ['.trycloudflare.com', '.ts.net'],
  },
  build: { target: 'es2022' },
});
