import type { TrackData } from '@adventure-racing/shared';

const ALT_SCALE = 1 / 100000;

/**
 * 3D perpendicular distance from a point to a line segment.
 * Altitude is normalized (÷100000) to be proportional to degree-based lat/lon.
 */
function perpDist3D(
  positions: [number, number, number][],
  idx: number,
  startIdx: number,
  endIdx: number
): number {
  const px = positions[idx][0], py = positions[idx][1], pz = positions[idx][2] * ALT_SCALE;
  const ax = positions[startIdx][0], ay = positions[startIdx][1], az = positions[startIdx][2] * ALT_SCALE;
  const bx = positions[endIdx][0], by = positions[endIdx][1], bz = positions[endIdx][2] * ALT_SCALE;

  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const lenSq = dx * dx + dy * dy + dz * dz;

  if (lenSq === 0) {
    const ex = px - ax, ey = py - ay, ez = pz - az;
    return Math.sqrt(ex * ex + ey * ey + ez * ez);
  }

  const t = Math.max(0, Math.min(1,
    ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / lenSq
  ));

  const ex = px - (ax + t * dx);
  const ey = py - (ay + t * dy);
  const ez = pz - (az + t * dz);
  return Math.sqrt(ex * ex + ey * ey + ez * ez);
}

/**
 * Iterative stack-based RDP. Returns a boolean array marking which indices to keep.
 * Zero intermediate array allocations — operates on the original array by index.
 */
function rdp3D(positions: [number, number, number][], epsilon: number): boolean[] {
  const n = positions.length;
  const keep = new Array<boolean>(n).fill(false);
  keep[0] = true;
  if (n > 1) keep[n - 1] = true;
  if (n <= 2) return keep;

  // Use a flat stack of pairs [start, end]
  const stack: number[] = [0, n - 1];

  while (stack.length > 0) {
    const end = stack.pop()!;
    const start = stack.pop()!;

    let maxDist = 0;
    let maxIdx = start;

    for (let i = start + 1; i < end; i++) {
      const dist = perpDist3D(positions, i, start, end);
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }

    if (maxDist > epsilon) {
      keep[maxIdx] = true;
      if (maxIdx - start > 1) { stack.push(start, maxIdx); }
      if (end - maxIdx > 1) { stack.push(maxIdx, end); }
    }
  }

  return keep;
}

function simplifyTrack(track: TrackData, epsilon: number): TrackData {
  const keep = rdp3D(track.positions, epsilon);
  const positions: [number, number, number][] = [];
  const timestamps: number[] = [];

  for (let i = 0; i < keep.length; i++) {
    if (keep[i]) {
      positions.push(track.positions[i]);
      timestamps.push(track.timestamps[i]);
    }
  }

  return { pilotName: track.pilotName, timestamps, positions };
}

function totalPoints(tracks: TrackData[]): number {
  let n = 0;
  for (const t of tracks) n += t.positions.length;
  return n;
}

/**
 * Compress tracks to fit under maxBytes total.
 * Uses binary search on epsilon to find the minimum simplification needed.
 * Point-count-based estimation avoids repeated JSON.stringify (memory-safe).
 */
export function compressTracks(tracks: TrackData[], maxBytes: number): TrackData[] {
  const origPoints = totalPoints(tracks);
  const sampleTrack = tracks.reduce((a, b) => a.positions.length > b.positions.length ? a : b);
  const sampleBytes = Buffer.byteLength(JSON.stringify(sampleTrack));
  const bytesPerPoint = sampleBytes / sampleTrack.positions.length;
  const estimatedSize = origPoints * bytesPerPoint;

  if (estimatedSize <= maxBytes) {
    return tracks;
  }

  const targetPoints = Math.floor(origPoints * (maxBytes / estimatedSize));

  let lo = 0.000001;
  let hi = 1.0;
  let bestTracks = tracks;

  for (let iter = 0; iter < 15; iter++) {
    const mid = (lo + hi) / 2;
    const simplified = tracks.map(t => simplifyTrack(t, mid));
    const pts = totalPoints(simplified);

    if (pts <= targetPoints) {
      bestTracks = simplified;
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return bestTracks;
}
