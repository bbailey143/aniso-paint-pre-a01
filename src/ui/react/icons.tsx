/*
 * Icons as drawn shapes rather than characters.
 *
 * A font decides how heavy its own glyphs are and nothing in CSS can argue with
 * it — which is why the rinse ring came out hairline-thin and barely visible on
 * an iPad. These keep their weight at any size.
 */

export const ICON: Record<string, string> = {
  // A waterpot with a ripple in it.
  rinse:
    '<path d="M5 8h14l-1.4 10.2A2.4 2.4 0 0 1 15.2 20H8.8a2.4 2.4 0 0 1-2.4-1.8Z"/>'
    + '<path d="M7.6 13.2c1.2-1 2.4-1 3.6 0s2.4 1 3.6 0"/>'
    + '<path d="M9 8V5.4A1.4 1.4 0 0 1 10.4 4h3.2A1.4 1.4 0 0 1 15 5.4V8"/>',
  // A cloth sweeping the sheet clean, with the wipe trailing behind it.
  wipe:
    '<path d="M20 6.6 12.4 14.2a2.6 2.6 0 0 1-1.5.75l-3.6.5.5-3.6a2.6 2.6 0 0 1 .75-1.5L16.1 3"/>'
    + '<path d="M14.4 4.7 18.3 8.6"/>'
    + '<path d="M4 20h9"/><path d="M4 16.6h4"/>',
  info:
    '<circle cx="12" cy="12" r="8.4"/><path d="M12 11v5.2"/><path d="M12 7.6v.1"/>',
  // A drop with the heat rising off it.
  drying:
    '<path d="M12 21a5.2 5.2 0 0 1-5.2-5.2c0-3.1 3.4-6.6 5.2-9.3 1.8 2.7 5.2 6.2 5.2 9.3A5.2 5.2 0 0 1 12 21Z"/>'
    + '<path d="M19.4 8.4c.9-.8.9-1.9 0-2.7"/><path d="M21.8 10c1.5-1.5 1.5-4 0-5.5"/>',
  // A board propped on a slope, with the downhill arrow.
  tilt:
    '<path d="M3.4 17.6 15.8 5.2a1.6 1.6 0 0 1 2.3 0l2.7 2.7a1.6 1.6 0 0 1 0 2.3L8.4 22.6"/>'
    + '<path d="M3 20.8h4.2"/><path d="M12.6 8.4l3 3"/>',
};

export function Icon({ name, size = 21 }: { name: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICON[name] ?? '' }}
    />
  );
}
