import type { TrackData } from '@adventure-racing/shared';

/**
 * 3D Ramer-Douglas-Peucker simplification.
 * Altitude is normalized (÷100000) to be proportional to degree-based lat/lon.
 */
function perpendicularDistance3D(
  point: [number, number, number],
  lineStart: [number, number, number],
  lineEnd: [number, number, number]
): number {
  const altScale = 1 / 100000;

  const px = point[0], py = point[1], pz = point[2] * altScale;
  const ax = lineStart[0], ay = lineStart[1], az = lineStart[2] * altScale;
  const bx = lineEnd[0], by = lineEnd[1], bz = lineEnd[2] * altScale;

  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const lenSq = dx * dx + dy * dy + dz * dz;

  if (lenSq === 0) {
    const ex = px - ax, ey = py - ay, ez = pz - az;
    return Math.sqrt(ex * ex + ey * ey + ez * ez);
  }

  const t = Math.max(0, Math.min(1,
    ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / lenSq
  ));

  const projX = ax + t * dx;
  const projY = ay + t * dy;
  const projZ = az + t * dz;

  const ex = px - projX, ey = py - projY, ez = pz - projZ;
  return Math.sqrt(ex * ex + ey * ey + ez * ez);
}

function rdp3D(
  positions: [number, number, number][],
  timestamps: number[],
  epsilon: number
): { positions: [number, number, number][]; timestamps: number[] } {
  if (positions.length <= 2) {
    return { positions: [...positions], timestamps: [...timestamps] };
  }

  let maxDist = 0;
  let maxIdx = 0;
  const first = positions[0];
  const last = positions[positions.length - 1];

  for (let i = 1; i < positions.length - 1; i++) {
    const dist = perpendicularDistance3D(positions[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdp3D(
      positions.slice(0, maxIdx + 1),
      timestamps.slice(0, maxIdx + 1),
      epsilon
    );
    const right = rdp3D(
      positions.slice(maxIdx),
      timestamps.slice(maxIdx),
      epsilon
    );

    return {
      positions: [...left.positions.slice(0, -1), ...right.positions],
      timestamps: [...left.timestamps.slice(0, -1), ...right.timestamps],
    };
  }

  return {
    positions: [first, last],
    timestamps: [timestamps[0], timestamps[timestamps.length - 1]],
  };
}

function simplifyTrack(track: TrackData, epsilon: number): TrackData {
  const result = rdp3D(track.positions, track.timestamps, epsilon);
  return {
    pilotName: track.pilotName,
    timestamps: result.timestamps,
    positions: result.positions,
  };
}

function estimateSize(tracks: TrackData[]): number {
  return Buffer.byteLength(JSON.stringify(tracks));
}

/**
 * Compress tracks to fit under maxBytes total.
 * Uses binary search on epsilon to find the minimum simplification needed.
 */
export function compressTracks(tracks: TrackData[], maxBytes: number): TrackData[] {
  const currentSize = estimateSize(tracks);
  if (currentSize <= maxBytes) {
    return tracks;
  }

  let lo = 0.000001;
  let hi = 1.0;
  let bestTracks = tracks;

  for (let iter = 0; iter < 30; iter++) {
    const mid = (lo + hi) / 2;
    const simplified = tracks.map(t => simplifyTrack(t, mid));
    const size = estimateSize(simplified);

    if (size <= maxBytes) {
      bestTracks = simplified;
      hi = mid;
    } else {
      lo = mid;
    }
  }

  // Final pass with hi epsilon to ensure we're under the limit
  const finalTracks = tracks.map(t => simplifyTrack(t, hi));
  const finalSize = estimateSize(finalTracks);
  if (finalSize <= maxBytes) {
    return finalTracks;
  }

  return bestTracks;
}
