// Bundle the bench for node. The engine imports WGSL with Vite's `?raw`
// suffix; node has no idea what that means, and the bench never builds a
// pipeline, so the shader text can safely be an empty string.
import { build } from 'esbuild';
const wgsl = {
  name: 'wgsl-raw',
  setup(b) {
    b.onResolve({ filter: /\.wgsl\?raw$/ }, (a) => ({ path: a.path, namespace: 'wgsl' }));
    b.onLoad({ filter: /.*/, namespace: 'wgsl' }, () => ({ contents: 'export default ""', loader: 'js' }));
  },
};
await build({
  entryPoints: ['tools/brush-bench.ts'], bundle: true, platform: 'node', format: 'esm',
  outfile: 'tools/brush-bench.mjs', plugins: [wgsl], logLevel: 'error',
});
