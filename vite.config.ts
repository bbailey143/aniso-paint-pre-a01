import { defineConfig } from 'vite';

// WGSL shaders are imported as raw strings via `?raw`.
export default defineConfig({
  server: { host: true, port: 5173 },
  build: { target: 'es2022' },
});
