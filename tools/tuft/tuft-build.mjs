/* Inline the carrier and the generator into the page. One source of truth: the
   same tuft-fill.js the node measurements ran against goes into the page. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const P = (f) => path.join(HERE, f);
const strip = (p) => fs.readFileSync(P(p), 'utf8')
  .replace(/^export function /gm, 'function ')
  .replace(/^export const /gm, 'const ');
let html = fs.readFileSync(P('tuft-bench.template.html'), 'utf8');
html = html.replace('/*__CARRIER__*/', fs.readFileSync(P('tuft-carrier.json'), 'utf8'));
html = html.replace('/*__FILL__*/', strip('tuft-fill.js'));
html = html.replace('/*__SPECS__*/', strip('tuft-specs.js'));
if (html.includes('__CARRIER__') || html.includes('__FILL__') || html.includes('__SPECS__')) {
  throw new Error('a placeholder survived');
}
if (/export\s/.test(html.split('<script>')[1] || '')) throw new Error('an export survived');
fs.writeFileSync(P('tuft-bench.html'), html);
console.log('tuft-bench.html', (html.length / 1024).toFixed(0) + 'KB');
