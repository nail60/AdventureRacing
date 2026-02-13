/**
 * Golden-angle HSL distribution for maximum color separation across many tracks.
 */
const GOLDEN_ANGLE = 137.508;

export function getTrackColor(index: number): string {
  const hue = (index * GOLDEN_ANGLE) % 360;
  return `hsl(${hue}, 85%, 60%)`;
}

export function getTrackColorCesium(index: number): [number, number, number, number] {
  const hue = (index * GOLDEN_ANGLE) % 360;
  const s = 0.85;
  const l = 0.6;

  // HSL to RGB
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; }
  else if (hue < 120) { r = x; g = c; }
  else if (hue < 180) { g = c; b = x; }
  else if (hue < 240) { g = x; b = c; }
  else if (hue < 300) { r = x; b = c; }
  else { r = c; b = x; }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
    255,
  ];
}
