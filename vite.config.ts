import { defineConfig } from 'vite';

// WGSL shaders are imported as raw strings via `?raw`.
export default defineConfig({
  server: {
    host: true,
    port: 5173,
    // WebGPU is only exposed in a secure context, so a plain http://192.168.x.x
    // address gives an iPad no `navigator.gpu` at all and the app reports
    // "WebGPU unavailable" — which looks like a device problem and is not one.
    // A tunnel supplies the https origin. Vite rejects requests whose Host it
    // does not know, so the tunnel's hostname has to be allowed or every
    // request comes back "Blocked request".
    allowedHosts: ['.trycloudflare.com'],
  },
  build: { target: 'es2022' },
});
