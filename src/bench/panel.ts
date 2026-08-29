/**
 * Shared result panel for the benches.
 *
 * Bartford's rule, 2026-08-29: **when a test succeeds, the result reads green.**
 * A wall of identical monospace numbers is exactly where a bad run hides, and
 * this file has six recorded instrument traps that were caught only by an eye
 * on the screen. Colour makes the verdict the first thing seen, not something
 * reconstructed by comparing digits against a reference line further down.
 *
 * Green means a stated criterion was met — reproduced, passed, clean. It never
 * means "a number was produced". Anything with no criterion stays plain, and
 * anything that fails one goes red. A diagnostic figure with no pass/fail
 * attached to it must NOT be green, or green stops meaning anything.
 */

/** Escape before anything reaches innerHTML. Panels carry `->` and `<`. */
export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string
  ));
}

const GREEN = '#7ddc8a';
const RED = '#ff8f7a';
const AMBER = '#f0c674';

/** A passing result. */
export const ok = (text: string): string =>
  `<span style="color:${GREEN}">${esc(text)}</span>`;

/** A failing result. */
export const bad = (text: string): string =>
  `<span style="color:${RED}">${esc(text)}</span>`;

/** Neither: worth a look, but not a verdict. */
export const warn = (text: string): string =>
  `<span style="color:${AMBER}">${esc(text)}</span>`;

/** Green when `passed`, red when not. */
export const verdict = (passed: boolean, text: string): string =>
  (passed ? ok : bad)(text);

/**
 * A headline: green on success, red on failure, plain while still running.
 * `state` is deliberately three-valued so an in-progress panel is never green.
 */
export function headline(state: 'running' | 'pass' | 'fail', text: string): string {
  if (state === 'running') return esc(text);
  return `<b>${(state === 'pass' ? ok : bad)(text)}</b>`;
}

/** Build the standard bench panel element. */
export function makePanel(id: string, width: string, running: string): HTMLDivElement {
  const panel = document.createElement('div');
  panel.id = id;
  panel.style.cssText =
    'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:9999;' +
    `width:min(${width},96vw);padding:14px 16px;border-radius:10px;` +
    'background:rgba(12,12,14,.96);color:#e8e6e3;font:12px/1.5 ui-monospace,monospace;' +
    'box-shadow:0 8px 30px rgba(0,0,0,.5);white-space:pre-wrap;pointer-events:none';
  panel.textContent = running;
  return panel;
}
