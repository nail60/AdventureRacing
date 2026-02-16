import type { TrackData } from '@adventure-racing/shared';

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS = 6371000; // meters

/** Haversine distance in meters between two lat/lon points. */
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** 3D distance between two track points (haversine horizontal + altitude delta). */
function dist3D(p1: [number, number, number], p2: [number, number, number]): number {
  const horiz = haversineM(p1[0], p1[1], p2[0], p2[1]);
  const dAlt = p2[2] - p1[2];
  return Math.sqrt(horiz * horiz + dAlt * dAlt);
}

/**
 * Compute per-point metrics and return a new TrackData with metric arrays populated.
 *
 * - speed (km/h): 3D distance / time between consecutive points
 * - lift (m/s): altitude delta / time
 * - glideRatio (L/D): horizontal distance / |altitude loss|; null when climbing or near-level
 * - optimizedDistance (m): FAI 3-point free distance — max of d(start,j) + d(j,i) for j in [0..i]
 */
export function computeTrackMetrics(track: TrackData): TrackData {
  const n = track.positions.length;
  if (n === 0) return { ...track, speed: [], lift: [], glideRatio: [], optimizedDistance: [] };

  const speed: (number | null)[] = [null];
  const lift: (number | null)[] = [null];
  const glideRatio: (number | null)[] = [null];
  const optimizedDistance: number[] = [0];

  // Precompute cumulative distance from start for optimized distance
  const distFromStart: number[] = [0];
  for (let i = 1; i < n; i++) {
    distFromStart[i] = haversineM(
      track.positions[0][0], track.positions[0][1],
      track.positions[i][0], track.positions[i][1]
    );
  }

  for (let i = 1; i < n; i++) {
    const dt = (track.timestamps[i] - track.timestamps[i - 1]) / 1000; // seconds

    if (dt <= 0) {
      speed.push(i > 1 ? speed[i - 1] : null);
      lift.push(i > 1 ? lift[i - 1] : null);
      glideRatio.push(null);
    } else {
      const horiz = haversineM(
        track.positions[i - 1][0], track.positions[i - 1][1],
        track.positions[i][0], track.positions[i][1]
      );
      const dAlt = track.positions[i][2] - track.positions[i - 1][2];
      const d3d = Math.sqrt(horiz * horiz + dAlt * dAlt);

      speed.push((d3d / dt) * 3.6); // m/s → km/h
      lift.push(dAlt / dt);

      if (dAlt < -0.01) {
        // Descending — glide ratio is horizontal / |alt loss|
        glideRatio.push(horiz / Math.abs(dAlt));
      } else {
        glideRatio.push(null);
      }
    }

    // Optimized distance: max of d(start,j) + d(j,i) for j in [0..i]
    let best = distFromStart[i]; // j=0: d(start,0) + d(0,i) = 0 + distFromStart[i]
    for (let j = 1; j <= i; j++) {
      const candidate = distFromStart[j] + haversineM(
        track.positions[j][0], track.positions[j][1],
        track.positions[i][0], track.positions[i][1]
      );
      if (candidate > best) best = candidate;
    }
    optimizedDistance.push(best);
  }

  return { ...track, speed, lift, glideRatio, optimizedDistance };
}
