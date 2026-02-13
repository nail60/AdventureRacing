import IGCParser from 'igc-parser';
import type { TrackData } from '@adventure-racing/shared';

export function parseIGC(content: string, filename: string): TrackData[] {
  const result = IGCParser.parse(content, { lenient: true });

  const pilotName = result.pilot || result.copilot || filename.replace(/\.igc$/i, '');

  const timestamps: number[] = [];
  const positions: [number, number, number][] = [];

  for (const fix of result.fixes) {
    if (!Number.isFinite(fix.timestamp)) continue;
    timestamps.push(fix.timestamp);
    positions.push([
      fix.latitude,
      fix.longitude,
      fix.gpsAltitude ?? fix.pressureAltitude ?? 0,
    ]);
  }

  if (timestamps.length === 0) {
    throw new Error(`No fixes found in IGC file: ${filename}`);
  }

  return [{
    pilotName,
    timestamps,
    positions,
  }];
}
