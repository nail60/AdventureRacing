import { v4 as uuid } from 'uuid';
import { getDb } from '../db/database.js';
import * as s3 from './s3Service.js';
import { parseIGC } from '../parsers/igcParser.js';
import { parseKMZ } from '../parsers/kmzParser.js';
import { compressTracks } from '../compression/trackSimplifier.js';
import { computeTrackMetrics } from '../compression/trackMetrics.js';
import { config } from '../config.js';
import type { TrackData, SceneMeta, SceneDetail, TracklogMeta } from '@adventure-racing/shared';

interface UploadedFile {
  originalname: string;
  buffer: Buffer;
}

export async function createScene(
  sceneName: string,
  files: UploadedFile[]
): Promise<{ sceneId: string; status: string }> {
  const db = getDb();
  const sceneId = uuid();

  // Create scene row
  db.prepare('INSERT INTO scenes (id, name, status) VALUES (?, ?, ?)').run(sceneId, sceneName, 'processing');

  // Start background processing
  processScene(sceneId, files).catch(err => {
    console.error(`Scene ${sceneId} processing failed:`, err);
    db.prepare('UPDATE scenes SET status = ? WHERE id = ?').run('error', sceneId);
  });

  return { sceneId, status: 'processing' };
}

async function processScene(sceneId: string, files: UploadedFile[]) {
  const db = getDb();
  const allTracks: { tracklogId: string; track: TrackData }[] = [];

  // Parse each file and store full-res tracklogs
  for (const file of files) {
    const ext = file.originalname.toLowerCase().split('.').pop();
    let tracks: TrackData[];

    try {
      if (ext === 'igc') {
        tracks = parseIGC(file.buffer.toString('utf-8'), file.originalname);
      } else if (ext === 'kmz') {
        tracks = await parseKMZ(file.buffer, file.originalname);
      } else if (ext === 'kml') {
        const { parseKML } = await import('../parsers/kmzParser.js');
        tracks = parseKML(file.buffer.toString('utf-8'), file.originalname);
      } else {
        console.warn(`Skipping unsupported file: ${file.originalname}`);
        continue;
      }
    } catch (parseErr: any) {
      console.warn(`Skipping file ${file.originalname}: ${parseErr.message}`);
      continue;
    }

    for (const track of tracks) {
      const tracklogId = uuid();
      const s3Key = `tracklogs/${tracklogId}.json`;
      const rawS3Key = `tracklogs/${tracklogId}/raw/${file.originalname}`;

      // Store full-res in S3
      await s3.putObject(s3Key, JSON.stringify(track));
      await s3.putRawFile(rawS3Key, file.buffer);

      // Insert tracklog row
      const fileSize = Buffer.byteLength(JSON.stringify(track));
      db.prepare(`
        INSERT INTO tracklogs (id, pilot_name, point_count, start_time, end_time, file_size, original_filename, s3_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        tracklogId,
        track.pilotName,
        track.positions.length,
        track.timestamps[0],
        track.timestamps[track.timestamps.length - 1],
        fileSize,
        file.originalname,
        s3Key
      );

      // Insert scene_tracks join
      db.prepare(`
        INSERT INTO scene_tracks (scene_id, tracklog_id)
        VALUES (?, ?)
      `).run(sceneId, tracklogId);

      allTracks.push({ tracklogId, track });
    }
  }

  // Compress all tracks for the scene and compute metrics
  const rawTracks = allTracks.map(t => t.track);
  const compressed = compressTracks(rawTracks, config.maxSceneSize);
  const withMetrics = compressed.map(t => computeTrackMetrics(t));

  // Store compressed tracks in S3
  for (let i = 0; i < allTracks.length; i++) {
    const { tracklogId } = allTracks[i];
    const compressedTrack = withMetrics[i];
    const compressedKey = `scenes/${sceneId}/tracks/${tracklogId}.json`;

    await s3.putObject(compressedKey, JSON.stringify(compressedTrack));

    db.prepare(`
      UPDATE scene_tracks SET compressed_s3_key = ?, compressed_point_count = ?
      WHERE scene_id = ? AND tracklog_id = ?
    `).run(compressedKey, compressedTrack.positions.length, sceneId, tracklogId);
  }

  // Mark scene as ready
  db.prepare('UPDATE scenes SET status = ? WHERE id = ?').run('ready', sceneId);
  console.log(`Scene ${sceneId} processing complete`);
}

export function listScenes(): SceneMeta[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT s.id, s.name, s.status, s.created_at,
      (SELECT COUNT(*) FROM scene_tracks WHERE scene_id = s.id) as track_count
    FROM scenes s
    ORDER BY s.created_at DESC
  `).all() as any[];

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    status: row.status,
    trackCount: row.track_count,
    createdAt: row.created_at,
  }));
}

export function getSceneDetail(sceneId: string): SceneDetail | null {
  const db = getDb();
  const scene = db.prepare(`
    SELECT s.id, s.name, s.status, s.created_at,
      (SELECT COUNT(*) FROM scene_tracks WHERE scene_id = s.id) as track_count
    FROM scenes s WHERE s.id = ?
  `).get(sceneId) as any;

  if (!scene) return null;

  const tracks = db.prepare(`
    SELECT st.tracklog_id, t.pilot_name,
      COALESCE(st.compressed_point_count, t.point_count) as point_count,
      t.start_time, t.end_time
    FROM scene_tracks st
    JOIN tracklogs t ON t.id = st.tracklog_id
    WHERE st.scene_id = ?
  `).all(sceneId) as any[];

  return {
    id: scene.id,
    name: scene.name,
    status: scene.status,
    trackCount: scene.track_count,
    createdAt: scene.created_at,
    tracks: tracks.map(t => ({
      tracklogId: t.tracklog_id,
      pilotName: t.pilot_name,
      pointCount: t.point_count,
      startTime: t.start_time,
      endTime: t.end_time,
    })),
  };
}

export async function getCompressedTrack(sceneId: string, tracklogId: string): Promise<TrackData | null> {
  const db = getDb();
  const row = db.prepare(`
    SELECT compressed_s3_key FROM scene_tracks
    WHERE scene_id = ? AND tracklog_id = ?
  `).get(sceneId, tracklogId) as any;

  if (!row?.compressed_s3_key) return null;

  const data = await s3.getObject(row.compressed_s3_key);
  return JSON.parse(data);
}

export async function deleteScene(sceneId: string): Promise<boolean> {
  const db = getDb();
  const scene = db.prepare('SELECT id FROM scenes WHERE id = ?').get(sceneId) as any;
  if (!scene) return false;

  // Delete compressed S3 files
  await s3.deletePrefix(`scenes/${sceneId}/`);

  // Delete from DB (cascade deletes scene_tracks)
  db.prepare('DELETE FROM scenes WHERE id = ?').run(sceneId);
  return true;
}

export function listTracklogs(): TracklogMeta[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM tracklogs ORDER BY uploaded_at DESC').all() as any[];
  return rows.map(row => ({
    id: row.id,
    pilotName: row.pilot_name,
    pointCount: row.point_count,
    startTime: row.start_time,
    endTime: row.end_time,
    fileSize: row.file_size,
    originalFilename: row.original_filename,
    uploadedAt: row.uploaded_at,
  }));
}

export function getTracklog(tracklogId: string): TracklogMeta | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM tracklogs WHERE id = ?').get(tracklogId) as any;
  if (!row) return null;
  return {
    id: row.id,
    pilotName: row.pilot_name,
    pointCount: row.point_count,
    startTime: row.start_time,
    endTime: row.end_time,
    fileSize: row.file_size,
    originalFilename: row.original_filename,
    uploadedAt: row.uploaded_at,
  };
}
