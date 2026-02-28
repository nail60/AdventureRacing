/**
 * Detect takeoff/landing events from AGL data.
 *
 * Pipeline:
 * 1. Heavy median filter on AGL to kill GPS/SRTM noise
 * 2. Classify each point: AGL >= threshold → flight (speed ignored — hikers run fast)
 * 3. Extract contiguous runs
 * 4. Drop flights shorter than MIN_FLIGHT_DURATION
 * 5. Drop flights with altitude gain below MIN_ALT_GAIN
 * 6. Merge flights separated by short ground gaps
 */

const AGL_THRESHOLD = 30;             // meters — high to tolerate SRTM error on ridges
const SPEED_OVERRIDE = 20;           // km/h — above this, always classify as flying (ridge soaring)
const MIN_FLIGHT_DURATION = 300_000;  // 5 min
const MIN_GROUND_DURATION = 180_000;  // 3 min — merge flights across shorter ground touches
const MIN_ALT_GAIN = 75;             // meters — flight must gain this much above start altitude
const MEDIAN_RADIUS = 15;            // ±15 points (31-point median window)

/** Median filter for a numeric array with nulls. */
function medianFilter(arr: (number | null)[], radius: number): (number | null)[] {
  const n = arr.length;
  const out: (number | null)[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (arr[i] === null) { out[i] = null; continue; }
    const window: number[] = [];
    for (let j = Math.max(0, i - radius); j <= Math.min(n - 1, i + radius); j++) {
      if (arr[j] !== null) window.push(arr[j]!);
    }
    window.sort((a, b) => a - b);
    out[i] = window[Math.floor(window.length / 2)];
  }
  return out;
}

export function detectFlights(
  timestamps: number[],
  agl: (number | null)[],
  speed: (number | null)[] | undefined,
): [number, number][] {
  const n = timestamps.length;
  if (n === 0) return [];

  // Step 1: heavy median filter on AGL and speed
  const smoothAgl = medianFilter(agl, MEDIAN_RADIUS);
  const smoothSpeed = speed ? medianFilter(speed, MEDIAN_RADIUS) : undefined;

  // Step 2: classify — AGL primary, speed override for ridge soaring
  const isFlightPt: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const a = smoothAgl[i];
    const s = smoothSpeed?.[i];
    // Flying if high enough OR moving fast (ridge soaring near terrain)
    const highEnough = a !== null && a >= AGL_THRESHOLD;
    const fastEnough = s !== null && s !== undefined && s >= SPEED_OVERRIDE;
    isFlightPt.push(highEnough || fastEnough);
  }

  // Step 3: extract contiguous runs
  type Run = { start: number; end: number; isFlight: boolean };
  const runs: Run[] = [];
  let runStart = 0;
  for (let i = 1; i < n; i++) {
    if (isFlightPt[i] !== isFlightPt[runStart]) {
      runs.push({ start: runStart, end: i - 1, isFlight: isFlightPt[runStart] });
      runStart = i;
    }
  }
  runs.push({ start: runStart, end: n - 1, isFlight: isFlightPt[runStart] });

  // Step 4: drop short flights & low altitude gain flights
  let merged: Run[] = [];
  for (const run of runs) {
    if (run.isFlight) {
      const duration = timestamps[run.end] - timestamps[run.start];
      // Check altitude gain (max alt in segment - start alt)
      let maxAlt = -Infinity;
      for (let i = run.start; i <= run.end; i++) {
        if (agl[i] !== null && agl[i]! > maxAlt) maxAlt = agl[i]!;
      }

      if (duration < MIN_FLIGHT_DURATION || maxAlt < MIN_ALT_GAIN) {
        // Not a real flight — absorb into ground
        const prev = merged[merged.length - 1];
        if (prev && !prev.isFlight) {
          prev.end = run.end;
        } else {
          merged.push({ ...run, isFlight: false });
        }
        continue;
      }
    }
    // Merge consecutive same-type runs
    const prev = merged[merged.length - 1];
    if (prev && prev.isFlight === run.isFlight) {
      prev.end = run.end;
    } else {
      merged.push({ ...run });
    }
  }

  // Step 5: merge flights across short ground gaps
  const final: Run[] = [];
  for (const run of merged) {
    const prev = final[final.length - 1];
    if (prev && prev.isFlight && !run.isFlight) {
      const gapDuration = timestamps[run.end] - timestamps[run.start];
      if (gapDuration < MIN_GROUND_DURATION) {
        // Short ground gap — absorb into flight
        prev.end = run.end;
        continue;
      }
    }
    // Merge consecutive flights (from absorbed gaps)
    if (prev && prev.isFlight && run.isFlight) {
      prev.end = run.end;
      continue;
    }
    final.push({ ...run });
  }

  const flights: [number, number][] = [];
  for (const run of final) {
    if (run.isFlight) {
      flights.push([run.start, run.end]);
    }
  }

  console.log(`Flight detector: ${n} points → ${flights.length} flight(s)`);
  return flights;
}
