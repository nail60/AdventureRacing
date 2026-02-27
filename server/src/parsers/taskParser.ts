import { DOMParser } from '@xmldom/xmldom';
import type { TaskData, TaskTurnpoint, TurnpointType, TaskStartGate } from '@adventure-racing/shared';

/**
 * Parse a CIVL/CompCheck .xctsk JSON file.
 */
export function parseXCTSK(json: string): TaskData {
  const raw = JSON.parse(json);

  const turnpoints: TaskTurnpoint[] = (raw.turnpoints || []).map((tp: any) => {
    const wp = tp.waypoint || {};
    let tpType: TurnpointType = 'TURNPOINT';
    if (tp.type === 'SSS' || tp.type === 'sss') tpType = 'SSS';
    else if (tp.type === 'ESS' || tp.type === 'ess') tpType = 'ESS';

    return {
      name: wp.name || 'Unnamed',
      description: wp.description || undefined,
      lat: wp.lat ?? 0,
      lon: wp.lon ?? 0,
      alt: wp.altSmooth ?? wp.alt ?? 0,
      radius: tp.radius ?? 400,
      type: tpType,
    };
  });

  let sss: TaskStartGate | undefined;
  if (raw.sss) {
    sss = {
      type: raw.sss.type || 'RACE',
      direction: raw.sss.direction || 'EXIT',
      timeGates: raw.sss.timeGates || [],
    };
  }

  const optimized = computeOptimizedCourseLine(turnpoints);

  return {
    taskType: raw.taskType || 'CLASSIC',
    turnpoints,
    sss,
    goalDeadline: raw.goal?.deadline || undefined,
    earthModel: raw.earthModel || undefined,
    optimizedDistance: optimized.distance,
    optimizedPoints: optimized.points,
  };
}

/**
 * Parse an XCSoar .tsk XML file.
 */
export function parseTSK(xml: string): TaskData {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const taskEl = doc.getElementsByTagName('Task')[0];

  const taskType = taskEl?.getAttribute('type') || 'CLASSIC';
  const turnpoints: TaskTurnpoint[] = [];

  const points = doc.getElementsByTagName('Point');
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const pointType = point.getAttribute('type') || '';

    const wp = point.getElementsByTagName('Waypoint')[0];
    const loc = wp?.getElementsByTagName('Location')[0];
    const oz = point.getElementsByTagName('ObservationZone')[0];

    const lat = parseFloat(loc?.getAttribute('latitude') || '0');
    const lon = parseFloat(loc?.getAttribute('longitude') || '0');
    const alt = parseFloat(wp?.getAttribute('altitude') || loc?.getAttribute('altitude') || '0');
    const name = wp?.getAttribute('name') || `TP${i}`;
    const radius = parseFloat(oz?.getAttribute('radius') || '400');

    let tpType: TurnpointType = 'TURNPOINT';
    if (pointType === 'Start') tpType = 'SSS';
    else if (pointType === 'Finish') tpType = 'ESS';

    turnpoints.push({ name, lat, lon, alt, radius, type: tpType });
  }

  const optimized = computeOptimizedCourseLine(turnpoints);

  return {
    taskType: taskType.toUpperCase(),
    turnpoints,
    optimizedDistance: optimized.distance,
    optimizedPoints: optimized.points,
  };
}

/**
 * Detect format by extension and parse.
 */
export function parseTaskFile(buffer: Buffer, filename: string): TaskData {
  const ext = filename.toLowerCase().split('.').pop();
  const content = buffer.toString('utf-8');

  if (ext === 'xctsk') {
    return parseXCTSK(content);
  } else if (ext === 'tsk') {
    return parseTSK(content);
  } else {
    throw new Error(`Unsupported task file format: ${filename}`);
  }
}

// --- Optimized course line computation ---

const EARTH_RADIUS = 6371000; // meters

function toRad(deg: number): number {
  return deg * Math.PI / 180;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Project a point onto a cylinder boundary (circle in lat/lon space)
 * toward a target point. Returns the point on the circle closest to target.
 */
function projectOntoCircle(
  centerLat: number, centerLon: number, radiusMeters: number,
  targetLat: number, targetLon: number
): [number, number] {
  // Convert radius to approximate degrees
  const radiusLat = radiusMeters / 111320;
  const radiusLon = radiusMeters / (111320 * Math.cos(toRad(centerLat)));

  // Direction from center to target
  const dLat = targetLat - centerLat;
  const dLon = targetLon - centerLon;
  const dist = Math.sqrt((dLat / radiusLat) ** 2 + (dLon / radiusLon) ** 2);

  if (dist < 1e-10) {
    // Target is at center; pick arbitrary direction
    return [centerLat + radiusLat, centerLon];
  }

  // Normalize and scale to radius
  return [
    centerLat + (dLat / dist) * radiusLat,
    centerLon + (dLon / dist) * radiusLon,
  ];
}

/**
 * Compute the shortest path through all turnpoint cylinder boundaries.
 * Uses iterative projection (standard FAI/CIVL scoring approach).
 */
export function computeOptimizedCourseLine(
  turnpoints: TaskTurnpoint[]
): { distance: number; points: [number, number][] } {
  if (turnpoints.length < 2) {
    return {
      distance: 0,
      points: turnpoints.map(tp => [tp.lat, tp.lon] as [number, number]),
    };
  }

  // Initialize path at turnpoint centers
  const points: [number, number][] = turnpoints.map(tp => [tp.lat, tp.lon]);
  const n = points.length;

  // Iterate until convergence
  for (let iter = 0; iter < 50; iter++) {
    let maxShift = 0;

    // For the first point (SSS): project onto boundary toward next point
    {
      const tp = turnpoints[0];
      const [newLat, newLon] = projectOntoCircle(
        tp.lat, tp.lon, tp.radius,
        points[1][0], points[1][1]
      );
      maxShift = Math.max(maxShift, Math.abs(newLat - points[0][0]) + Math.abs(newLon - points[0][1]));
      points[0] = [newLat, newLon];
    }

    // Intermediate turnpoints: project onto boundary toward line between neighbors
    for (let i = 1; i < n - 1; i++) {
      const tp = turnpoints[i];
      // Midpoint of neighbors as target direction
      const targetLat = (points[i - 1][0] + points[i + 1][0]) / 2;
      const targetLon = (points[i - 1][1] + points[i + 1][1]) / 2;

      // Actually we want the closest point on the boundary to the line from prev to next.
      // A good approximation: project toward the line between prev and next.
      // Find closest point on line segment (prev, next) to center, then project center toward that.
      const closestOnLine = closestPointOnSegment(
        points[i - 1][0], points[i - 1][1],
        points[i + 1][0], points[i + 1][1],
        tp.lat, tp.lon
      );

      const [newLat, newLon] = projectOntoCircle(
        tp.lat, tp.lon, tp.radius,
        closestOnLine[0], closestOnLine[1]
      );
      maxShift = Math.max(maxShift, Math.abs(newLat - points[i][0]) + Math.abs(newLon - points[i][1]));
      points[i] = [newLat, newLon];
    }

    // Last point (ESS/goal): project onto boundary toward previous point
    {
      const tp = turnpoints[n - 1];
      const [newLat, newLon] = projectOntoCircle(
        tp.lat, tp.lon, tp.radius,
        points[n - 2][0], points[n - 2][1]
      );
      maxShift = Math.max(maxShift, Math.abs(newLat - points[n - 1][0]) + Math.abs(newLon - points[n - 1][1]));
      points[n - 1] = [newLat, newLon];
    }

    // Convergence check (< ~1cm shift)
    if (maxShift < 1e-7) break;
  }

  // Compute total distance
  let distance = 0;
  for (let i = 1; i < n; i++) {
    distance += haversineDistance(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
  }

  return { distance, points };
}

function closestPointOnSegment(
  ax: number, ay: number, bx: number, by: number,
  px: number, py: number
): [number, number] {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 1e-12) return [ax, ay];

  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  return [ax + t * dx, ay + t * dy];
}
