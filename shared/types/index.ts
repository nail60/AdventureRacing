export interface TrackData {
  pilotName: string;
  timestamps: number[];       // Unix epoch ms
  positions: [number, number, number][];  // [lat, lon, alt]
  speed?: (number | null)[];          // km/h per point
  lift?: (number | null)[];           // m/s per point (positive = climbing)
  glideRatio?: (number | null)[];     // L/D; null when climbing or near-level
  optimizedDistance?: number[];        // FAI 3-point free distance in meters
  flights?: [number, number][];        // [startIndex, endIndex] pairs for flight segments
}

export interface TracklogMeta {
  id: string;
  pilotName: string;
  pointCount: number;
  startTime: number;
  endTime: number;
  fileSize: number;
  originalFilename: string;
  uploadedAt: string;
}

export interface SceneMeta {
  id: string;
  name: string;
  status: 'processing' | 'ready' | 'error';
  processingStep?: string | null;
  trackCount: number;
  createdAt: string;
}

export interface SceneDetail extends SceneMeta {
  tracks: SceneTrackInfo[];
  task?: TaskData | null;
}

export type TurnpointType = 'SSS' | 'ESS' | 'TURNPOINT';

export interface TaskTurnpoint {
  name: string;
  description?: string;
  lat: number;
  lon: number;
  alt: number;
  radius: number;
  type: TurnpointType;
}

export interface TaskStartGate {
  type: string;
  direction: string;
  timeGates: string[];
}

export interface TaskData {
  taskType: string;
  turnpoints: TaskTurnpoint[];
  sss?: TaskStartGate;
  goalDeadline?: string;
  earthModel?: string;
  optimizedDistance?: number;
  optimizedPoints?: [number, number][];
}

export interface SceneTrackInfo {
  tracklogId: string;
  pilotName: string;
  pointCount: number;
  startTime: number;
  endTime: number;
}
