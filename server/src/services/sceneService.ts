import { v4 as uuid } from 'uuid';
import { Worker } from 'worker_threads';
import { getDb } from '../db/database.js';
import * as s3 from './s3Service.js';
import { parseIGC } from '../parsers/igcParser.js';
import { parseKMZ } from '../parsers/kmzParser.js';
import { compressTracks } from '../compression/trackSimplifier.js';
import { computeTrackMetrics } from '../compression/trackMetrics.js';
import { config } from '../config.js';
import { AppError } from '../middleware/errorHandler.js';
import { parseTaskFile } from '../parsers/taskParser.js';
import { computeAGL } from './elevationService.js';
import { detectFlights } from './flightDetector.js';
import type { TrackData, TaskData, SceneMeta, SceneDetail, TracklogMeta } from '@adventure-racing/shared';

interface UploadedFile {
  originalname: string;
  buffer: Buffer;
}

const workerUrl = new URL('../workers/compressionWorker.js', import.meta.url);

function compressInWorker(tracks: TrackData[], maxBytes: number): Promise<TrackData[]> {
  return new Promise<TrackData[]>((resolve, reject) => {
    let settled = false;
    const worker = new Worker(workerUrl, {
      workerData: { tracks, maxBytes },
    });
    worker.on('message', (result: TrackData[]) => { settled = true; resolve(result); });
    worker.on('error', (err) => { if (!settled) { settled = true; reject(err); } });
    worker.on('exit', (code) => {
      if (!settled && code !== 0) {
        settled = true;
        reject(new Error(`Compression worker exited with code ${code}`));
      }
    });
  }).catch((err) => {
    // Fallback to main-thread compression (e.g. during dev with tsx)
    console.warn('Worker thread failed, falling back to main thread:', err.message);
    const compressed = compressTracks(tracks, maxBytes);
    return compressed.map(t => computeTrackMetrics(t));
  });
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

function setStep(sceneId: string, step: string) {
  getDb().prepare('UPDATE scenes SET processing_step = ? WHERE id = ?').run(step, sceneId);
}

async function processScene(sceneId: string, files: UploadedFile[]) {
  const db = getDb();
  const allTracks: { tracklogId: string; track: TrackData }[] = [];

  // Separate task files from track files
  const taskFiles = files.filter(f => /\.(xctsk|tsk)$/i.test(f.originalname));
  const trackFiles = files.filter(f => !/\.(xctsk|tsk)$/i.test(f.originalname));

  // Process task file (max 1)
  if (taskFiles.length > 1) {
    throw new Error('Only one task file per scene is allowed');
  }
  if (taskFiles.length === 1) {
    setStep(sceneId, 'Parsing task file');
    const taskFile = taskFiles[0];
    const taskData = parseTaskFile(taskFile.buffer, taskFile.originalname);
    const taskS3Key = `scenes/${sceneId}/task.json`;
    await s3.putObject(taskS3Key, JSON.stringify(taskData));
    db.prepare('UPDATE scenes SET task_s3_key = ? WHERE id = ?').run(taskS3Key, sceneId);
  }

  // Parse each file and store full-res tracklogs
  for (let fi = 0; fi < trackFiles.length; fi++) {
    const file = trackFiles[fi];
    setStep(sceneId, `Parsing track ${fi + 1} of ${trackFiles.length}`);

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
      const trackJson = JSON.stringify(track);
      await s3.putObject(s3Key, trackJson);
      await s3.putRawFile(rawS3Key, file.buffer);

      // Insert tracklog row
      const fileSize = Buffer.byteLength(trackJson);
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

    // Release file buffer to free memory before compression
    file.buffer = Buffer.alloc(0);
  }

  // Compress all tracks for the scene and compute metrics (in worker thread to avoid blocking event loop)
  setStep(sceneId, `Compressing ${allTracks.length} tracks`);
  const rawTracks = allTracks.map(t => t.track);
  const withMetrics = await compressInWorker(rawTracks, config.maxSceneSize);

  // Detect flight segments (takeoff/landing) using SRTM terrain data
  setStep(sceneId, 'Detecting flights');
  for (const track of withMetrics) {
    const agl = await computeAGL(track.positions);
    track.flights = detectFlights(track.timestamps, agl, track.speed);
  }

  // Store compressed tracks in S3
  setStep(sceneId, 'Saving compressed tracks');
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
  db.prepare('UPDATE scenes SET status = ?, processing_step = NULL WHERE id = ?').run('ready', sceneId);
  console.log(`Scene ${sceneId} processing complete`);
}

export function listScenes(): SceneMeta[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT s.id, s.name, s.status, s.processing_step, s.created_at,
      (SELECT COUNT(*) FROM scene_tracks WHERE scene_id = s.id) as track_count
    FROM scenes s
    ORDER BY s.created_at DESC
  `).all() as any[];

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    status: row.status,
    processingStep: row.processing_step ?? null,
    trackCount: row.track_count,
    createdAt: row.created_at,
  }));
}

export async function getSceneDetail(sceneId: string): Promise<SceneDetail | null> {
  const db = getDb();
  const scene = db.prepare(`
    SELECT s.id, s.name, s.status, s.processing_step, s.created_at, s.task_s3_key,
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

  let task: TaskData | null = null;
  if (scene.task_s3_key) {
    try {
      const taskJson = await s3.getObject(scene.task_s3_key);
      task = JSON.parse(taskJson);
    } catch {
      // Task file missing from S3 — treat as no task
    }
  }

  return {
    id: scene.id,
    name: scene.name,
    status: scene.status,
    processingStep: scene.processing_step ?? null,
    trackCount: scene.track_count,
    createdAt: scene.created_at,
    tracks: tracks.map(t => ({
      tracklogId: t.tracklog_id,
      pilotName: t.pilot_name,
      pointCount: t.point_count,
      startTime: t.start_time,
      endTime: t.end_time,
    })),
    task,
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

export async function addTaskToScene(sceneId: string, file: UploadedFile): Promise<TaskData> {
  const db = getDb();
  const scene = db.prepare('SELECT id, task_s3_key FROM scenes WHERE id = ?').get(sceneId) as any;
  if (!scene) throw new AppError(404, 'Scene not found');
  if (scene.task_s3_key) throw new AppError(409, 'Scene already has a task. Delete it first.');

  const taskData = parseTaskFile(file.buffer, file.originalname);
  const taskS3Key = `scenes/${sceneId}/task.json`;
  await s3.putObject(taskS3Key, JSON.stringify(taskData));
  db.prepare('UPDATE scenes SET task_s3_key = ? WHERE id = ?').run(taskS3Key, sceneId);

  return taskData;
}

export async function deleteTaskFromScene(sceneId: string): Promise<boolean> {
  const db = getDb();
  const scene = db.prepare('SELECT id, task_s3_key FROM scenes WHERE id = ?').get(sceneId) as any;
  if (!scene) return false;
  if (!scene.task_s3_key) return false;

  await s3.deleteObject(scene.task_s3_key);
  db.prepare('UPDATE scenes SET task_s3_key = NULL WHERE id = ?').run(sceneId);
  return true;
}
