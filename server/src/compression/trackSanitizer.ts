import type { TrackData } from '@adventure-racing/shared';

/**
 * Maximum physically plausible vertical speed (m/s).
 * ~50 m/s ≈ 180 km/h vertical — well beyond any paraglider or sailplane.
 */
const MAX_VERTICAL_SPEED = 50;

/**
 * Minimum altitude change (meters) to consider a point an outlier candidate.
 * Small fluctuations are left alone even if they exceed the vertical speed limit
 * (e.g. 1-second GPS jitter of a few meters).
 */
const MIN_SPIKE_MAGNITUDE = 100;

/**
 * Maximum plausible horizontal speed (m/s) for position-jump detection.
 * ~500 km/h ≈ 139 m/s — generous for any human-powered or paraglider flight.
 */
const MAX_HORIZONTAL_SPEED = 139;

/**
 * Approximate meters-per-degree of latitude (equator-scale, good enough for outlier detection).
 */
const DEG_TO_M = 111_320;

/**
 * Sanitize a track by fixing GPS altitude dropouts and removing position teleportation.
 *
 * Altitude fix: replaces points whose altitude change rate exceeds physical limits
 * with linearly interpolated values from the nearest clean neighbours.
 *
 * Position fix: removes points that teleport beyond plausible horizontal speed,
 * unless the time gap is large enough that the movement is realistic.
 */
export function sanitizeTrack(track: TrackData): TrackData {
  if (track.positions.length < 3) return track;

  const positions = track.positions.map(p => [...p] as [number, number, number]);
  const timestamps = [...track.timestamps];

  // --- Pass 1: fix altitude outliers ---
  fixAltitudeOutliers(positions, timestamps);

  // --- Pass 2: remove position teleportations ---
  const keepMask = detectPositionJumps(positions, timestamps);

  // Filter out removed points
  const filteredPositions: [number, number, number][] = [];
  const filteredTimestamps: number[] = [];
  for (let i = 0; i < positions.length; i++) {
    if (keepMask[i]) {
      filteredPositions.push(positions[i]);
      filteredTimestamps.push(timestamps[i]);
    }
  }

  return {
    pilotName: track.pilotName,
    timestamps: filteredTimestamps,
    positions: filteredPositions,
  };
}

/**
 * Window radius for the local median used in outlier detection.
 * 7 → uses up to 15 surrounding points for the median.
 */
const MEDIAN_RADIUS = 7;

/**
 * In-place altitude outlier correction combining two strategies:
 *
 * 1. Rate-based edge detection — catches fast spikes (rate > MAX_VERTICAL_SPEED)
 *    and marks entire glitch runs from entry to exit edge.
 *
 * 2. Median-based deviation — catches slower glitches (e.g. 900m→0m over 50s)
 *    by comparing each point to the local median of its neighbours.  A point
 *    deviating more than MIN_SPIKE_MAGNITUDE from the median is marked.
 *
 * Both passes mark into the same outlier array, then all outliers are replaced
 * with linear interpolation from the nearest clean neighbours.
 */
function fixAltitudeOutliers(
  positions: [number, number, number][],
  timestamps: number[]
): void {
  const n = positions.length;
  const isOutlier = new Uint8Array(n);

  // --- Pass A: rate-based edge detection (handles fast spikes and runs) ---
  let i = 1;
  while (i < n) {
    const dtPrev = (timestamps[i] - timestamps[i - 1]) / 1000;
    if (dtPrev <= 0) { i++; continue; }

    const altPrev = positions[i - 1][2];
    const altCurr = positions[i][2];
    const ratePrev = Math.abs(altCurr - altPrev) / dtPrev;
    const magPrev = Math.abs(altCurr - altPrev);

    if (ratePrev > MAX_VERTICAL_SPEED && magPrev > MIN_SPIKE_MAGNITUDE) {
      const runStart = i;
      let j = i + 1;
      while (j < n) {
        const dt = (timestamps[j] - timestamps[j - 1]) / 1000;
        if (dt <= 0) { j++; continue; }

        const rateBack = Math.abs(positions[j][2] - positions[runStart - 1][2]) / ((timestamps[j] - timestamps[runStart - 1]) / 1000);
        const magBack = Math.abs(positions[j][2] - positions[runStart - 1][2]);

        if (rateBack <= MAX_VERTICAL_SPEED || magBack <= MIN_SPIKE_MAGNITUDE) {
          break;
        }
        j++;
      }

      for (let k = runStart; k < j && k < n; k++) {
        isOutlier[k] = 1;
      }
      i = j;
    } else {
      i++;
    }
  }

  // --- Pass B: median-based deviation (handles slower glitches) ---
  // Build altitude array for median computation
  const alts = positions.map(p => p[2]);

  for (let idx = 1; idx < n - 1; idx++) {
    if (isOutlier[idx]) continue; // already caught by pass A

    // Collect altitudes of neighbours (excluding already-marked outliers)
    const window: number[] = [];
    for (let w = Math.max(0, idx - MEDIAN_RADIUS); w <= Math.min(n - 1, idx + MEDIAN_RADIUS); w++) {
      if (w !== idx && !isOutlier[w]) {
        window.push(alts[w]);
      }
    }

    if (window.length < 3) continue; // not enough context
    window.sort((a, b) => a - b);
    const median = window[Math.floor(window.length / 2)];

    const deviation = Math.abs(alts[idx] - median);
    // Must deviate by both an absolute amount AND a large fraction of the median.
    // GPS dropouts to 0m deviate by ~100% of the median; legitimate thermals
    // deviate by maybe 10-20%.
    if (deviation > MIN_SPIKE_MAGNITUDE && deviation > median * 0.5) {
      isOutlier[idx] = 1;
    }
  }

  // --- Interpolation: replace all outliers from nearest clean neighbours ---
  for (let idx = 1; idx < n - 1; idx++) {
    if (!isOutlier[idx]) continue;

    let prev = idx - 1;
    while (prev > 0 && isOutlier[prev]) prev--;

    let next = idx + 1;
    while (next < n - 1 && isOutlier[next]) next++;

    const tRange = timestamps[next] - timestamps[prev];
    if (tRange <= 0) continue;
    const t = (timestamps[idx] - timestamps[prev]) / tRange;
    positions[idx][2] = positions[prev][2] + t * (positions[next][2] - positions[prev][2]);
  }
}

/**
 * Detect position teleportation points (single or multi-point runs).
 * Returns a boolean array: true = keep, false = remove.
 *
 * Uses edge-detection: when a point jumps implausibly far from the last clean
 * point, it starts a glitch run.  The run continues until a point returns
 * close to the pre-glitch position (plausible speed back to the last clean point).
 */
function detectPositionJumps(
  positions: [number, number, number][],
  timestamps: number[]
): boolean[] {
  const n = positions.length;
  const keep = new Array<boolean>(n).fill(true);

  let i = 1;
  while (i < n) {
    const dtPrev = (timestamps[i] - timestamps[i - 1]) / 1000;
    if (dtPrev <= 0) { i++; continue; }

    const distPrev = horizontalDist(positions[i - 1], positions[i]);
    const speedPrev = distPrev / dtPrev;

    // Entry edge: implausible jump from last clean point
    if (speedPrev > MAX_HORIZONTAL_SPEED) {
      const runStart = i;
      const anchorIdx = i - 1; // last known-good point
      let j = i + 1;

      // Scan forward to find exit: a point that's plausibly close to the anchor
      while (j < n) {
        const dtFromAnchor = (timestamps[j] - timestamps[anchorIdx]) / 1000;
        if (dtFromAnchor <= 0) { j++; continue; }

        const distFromAnchor = horizontalDist(positions[anchorIdx], positions[j]);
        const speedFromAnchor = distFromAnchor / dtFromAnchor;

        if (speedFromAnchor <= MAX_HORIZONTAL_SPEED) {
          break; // this point is back near the anchor — end of glitch
        }
        j++;
      }

      // Only remove the run if we found an exit (i.e. it's a round-trip glitch,
      // not a genuine position change at the end of the track)
      if (j < n) {
        for (let k = runStart; k < j; k++) {
          keep[k] = false;
        }
      }
      i = j;
    } else {
      i++;
    }
  }

  return keep;
}

/** Approximate horizontal distance in meters between two [lat, lon, alt] positions. */
function horizontalDist(
  a: [number, number, number],
  b: [number, number, number]
): number {
  const dLat = (b[0] - a[0]) * DEG_TO_M;
  const avgLat = ((a[0] + b[0]) / 2) * (Math.PI / 180);
  const dLon = (b[1] - a[1]) * DEG_TO_M * Math.cos(avgLat);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}
