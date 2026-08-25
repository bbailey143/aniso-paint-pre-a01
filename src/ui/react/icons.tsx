/*
 * Icons as drawn shapes rather than characters.
 *
 * A font decides how heavy its own glyphs are and nothing in CSS can argue with
 * it — which is why the rinse ring came out hairline-thin and barely visible on
 * an iPad. These keep their weight at any size.
 *
 * Redrawn 2026-08-25 from references the artist sent, after "the ones you have
 * built kinda don't work". The four he chose are all things anyone could name
 * without knowing the app: a bin, a bug, a ruler, a drop. That is the bar. The
 * two he did not send are drawn to sit beside those rather than to match
 * whatever was there before.
 */

export const ICON: Record<string, string> = {
  // A drop, with the sparkle of clean water off it.
  rinse:
    '<path d="M10.6 20.6a5.1 5.1 0 0 1-5.1-5.1c0-3.1 3.4-6.7 5.1-9.4 1.7 2.7 5.1 6.3 5.1 9.4a5.1 5.1 0 0 1-5.1 5.1Z"/>'
    + '<path d="M8 15.5a2.8 2.8 0 0 0 2.5 2.8"/>'
    + '<path d="M18.4 3.1c.34 2.16.88 2.7 3.04 3.04-2.16.34-2.7.88-3.04 3.04-.34-2.16-.88-2.7-3.04-3.04 2.16-.34 2.7-.88 3.04-3.04Z"/>'
    + '<path d="M20.5 11.4c.22 1.36.55 1.69 1.91 1.91-1.36.22-1.69.55-1.91 1.91-.22-1.36-.55-1.69-1.91-1.91 1.36-.22 1.69-.55 1.91-1.91Z"/>',

  // A bin. Clearing the sheet throws the painting away, and nothing says that
  // as plainly as a bin does.
  wipe:
    '<path d="M4.4 7.1h15.2"/>'
    + '<path d="M9.3 7.1V5.7A1.5 1.5 0 0 1 10.8 4.2h2.4a1.5 1.5 0 0 1 1.5 1.5v1.4"/>'
    + '<path d="M6.5 7.1 7.6 18.9a2.1 2.1 0 0 0 2.1 1.9h4.6a2.1 2.1 0 0 0 2.1-1.9L17.5 7.1"/>'
    + '<path d="M10 10.6v6.5"/><path d="M14 10.6v6.5"/>',

  // A bug. These are the debug readouts, and anyone who has used a computer
  // knows what a bug stands for.
  info:
    '<path d="M8.7 10.1V9.4a3.3 3.3 0 0 1 6.6 0v.7"/>'
    + '<path d="M12 20.6c-2.9 0-5.2-2.8-5.2-6.2s2.3-4.3 5.2-4.3 5.2.9 5.2 4.3-2.3 6.2-5.2 6.2Z"/>'
    + '<path d="M12 10.3v10.3"/>'
    + '<path d="M9.1 4.1c1.3.5 2.1 1.4 2.4 2.6"/><path d="M14.9 4.1c-1.3.5-2.1 1.4-2.4 2.6"/>'
    + '<path d="M6.9 11.6c-1.3-.3-2-1.1-2.1-2.4"/><path d="M17.1 11.6c1.3-.3 2-1.1 2.1-2.4"/>'
    + '<path d="M6.5 15.4c-1.4 0-2.3.6-2.9 1.7"/><path d="M17.5 15.4c1.4 0 2.3.6 2.9 1.7"/>'
    + '<path d="M8.1 19.3c-1.2.4-1.8 1.3-1.9 2.5"/><path d="M15.9 19.3c1.2.4 1.8 1.3 1.9 2.5"/>',

  // Heat lifting off a flat sheet. Deliberately NOT a drop any more — rinse is
  // the drop now, and two drops in one row is two buttons nobody can tell apart.
  drying:
    '<path d="M3.8 20.4h16.4"/>'
    + '<path d="M7.4 16.4c1.5-1.2 1.5-2.8 0-4s-1.5-2.8 0-4"/>'
    + '<path d="M12 16.4c1.5-1.2 1.5-2.8 0-4s-1.5-2.8 0-4"/>'
    + '<path d="M16.6 16.4c1.5-1.2 1.5-2.8 0-4s-1.5-2.8 0-4"/>',

  // A ruler set on a slope, with the arrow that swings it.
  tilt:
    '<path d="M20.4 6.6 8.3 18.7a1.3 1.3 0 0 1-1.8 0l-1.2-1.2a1.3 1.3 0 0 1 0-1.8L17.4 3.6a1.3 1.3 0 0 1 1.8 0l1.2 1.2a1.3 1.3 0 0 1 0 1.8Z"/>'
    + '<path d="M15.9 6.4 17.6 8.1"/><path d="M13.1 9.2 14.8 10.9"/><path d="M10.3 12 12 13.7"/>'
    + '<path d="M3.6 9.4A6.2 6.2 0 0 1 10.6 3.6"/>'
    + '<path d="M3 6.2 3.5 9.7 7 9"/>',

  // A palette knife over two ridges of paint: how thick it sits, which is what
  // the panel behind this button is about.
  impasto:
    '<path d="M21 3.2 16.2 8"/>'
    + '<path d="M16.7 7.2 10 13.9a3 3 0 0 1-1.5.8l-3 .6.6-3a3 3 0 0 1 .8-1.5l6.7-6.7Z"/>'
    + '<path d="M2.8 18c2.7-2.2 4.8-2.2 7.5 0s4.8 2.2 7.5 0"/>'
    + '<path d="M2.8 21.4c2.7-2.2 4.8-2.2 7.5 0s4.8 2.2 7.5 0"/>',
};

export function Icon({ name, size = 21 }: { name: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICON[name] ?? '' }}
    />
  );
}
