export interface TrackData {
  pilotName: string;
  timestamps: number[];       // Unix epoch ms
  positions: [number, number, number][];  // [lat, lon, alt]
  speed?: (number | null)[];          // km/h per point
  lift?: (number | null)[];           // m/s per point (positive = climbing)
  glideRatio?: (number | null)[];     // L/D; null when climbing or near-level
  optimizedDistance?: number[];        // FAI 3-point free distance in meters
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
  trackCount: number;
  createdAt: string;
}

export interface SceneDetail extends SceneMeta {
  tracks: SceneTrackInfo[];
}

export interface SceneTrackInfo {
  tracklogId: string;
  pilotName: string;
  pointCount: number;
  startTime: number;
  endTime: number;
}
