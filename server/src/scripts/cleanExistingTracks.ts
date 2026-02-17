/**
 * Migration script: clean all existing tracklogs and recompress scenes.
 *
 * Usage:
 *   npx tsx server/src/scripts/cleanExistingTracks.ts                # all scenes
 *   npx tsx server/src/scripts/cleanExistingTracks.ts "RBXA D4"      # single scene by name
 */
import { getDb } from '../db/database.js';
import * as s3 from '../services/s3Service.js';
import { cleanTrack } from '../parsers/trackCleaner.js';
import { compressTracks } from '../compression/trackSimplifier.js';
import { computeTrackMetrics } from '../compression/trackMetrics.js';
import { config } from '../config.js';
import type { TrackData } from '@adventure-racing/shared';

async function main() {
  const db = getDb();
  const sceneFilter = process.argv[2] || null;

  // Determine which tracklogs to clean
  let tracklogs: any[];
  if (sceneFilter) {
    const scene = db.prepare("SELECT id FROM scenes WHERE name = ?").get(sceneFilter) as any;
    if (!scene) {
      console.error(`Scene "${sceneFilter}" not found`);
      process.exit(1);
    }
    console.log(`Filtering to scene: "${sceneFilter}" (${scene.id})\n`);
    tracklogs = db.prepare(`
      SELECT DISTINCT t.id, t.s3_key, t.pilot_name, t.point_count
      FROM tracklogs t
      JOIN scene_tracks st ON st.tracklog_id = t.id
      WHERE st.scene_id = ?
    `).all(scene.id) as any[];
  } else {
    tracklogs = db.prepare('SELECT id, s3_key, pilot_name, point_count FROM tracklogs').all() as any[];
  }

  // Step 1: Clean full-res tracklogs
  console.log('=== Step 1: Cleaning full-resolution tracklogs ===');
  console.log(`Found ${tracklogs.length} tracklogs to clean\n`);

  let totalRemoved = 0;
  let totalPoints = 0;

  for (const tl of tracklogs) {
    let raw: string;
    try {
      raw = await s3.getObject(tl.s3_key);
    } catch (err: any) {
      if (err.Code === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        console.log(`  ${tl.pilot_name}: SKIPPED (S3 object missing)`);
        continue;
      }
      throw err;
    }

    const track: TrackData = JSON.parse(raw);
    const originalCount = track.positions.length;
    totalPoints += originalCount;

    const cleaned = cleanTrack(track);
    const removedCount = originalCount - cleaned.positions.length;
    totalRemoved += removedCount;

    if (removedCount > 0) {
      // Re-upload cleaned track to S3
      await s3.putObject(tl.s3_key, JSON.stringify(cleaned));

      // Update DB
      const fileSize = Buffer.byteLength(JSON.stringify(cleaned));
      db.prepare(`
        UPDATE tracklogs SET point_count = ?, file_size = ?,
          start_time = ?, end_time = ?
        WHERE id = ?
      `).run(
        cleaned.positions.length,
        fileSize,
        cleaned.timestamps[0],
        cleaned.timestamps[cleaned.timestamps.length - 1],
        tl.id
      );

      console.log(`  ${tl.pilot_name}: ${originalCount} → ${cleaned.positions.length} (removed ${removedCount})`);
    } else {
      console.log(`  ${tl.pilot_name}: ${originalCount} points — clean`);
    }
  }

  const pct = totalPoints > 0 ? (totalRemoved / totalPoints * 100).toFixed(1) : '0.0';
  console.log(`\nTotal: removed ${totalRemoved}/${totalPoints} points (${pct}%)\n`);

  // Step 2: Recompress scenes
  console.log('=== Step 2: Recompressing scenes ===');
  let scenes: any[];
  if (sceneFilter) {
    scenes = db.prepare("SELECT id, name FROM scenes WHERE name = ? AND status = 'ready'").all(sceneFilter) as any[];
  } else {
    scenes = db.prepare("SELECT id, name FROM scenes WHERE status = 'ready'").all() as any[];
  }
  console.log(`Found ${scenes.length} scenes to recompress\n`);

  for (const scene of scenes) {
    const sceneTracks = db.prepare(`
      SELECT st.tracklog_id, t.s3_key
      FROM scene_tracks st
      JOIN tracklogs t ON t.id = st.tracklog_id
      WHERE st.scene_id = ?
    `).all(scene.id) as any[];

    // Fetch all cleaned full-res tracks
    const trackData: { tracklogId: string; track: TrackData }[] = [];
    let skipped = false;
    for (const st of sceneTracks) {
      try {
        const raw = await s3.getObject(st.s3_key);
        trackData.push({ tracklogId: st.tracklog_id, track: JSON.parse(raw) });
      } catch (err: any) {
        if (err.Code === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
          console.log(`  ${scene.name}: SKIPPED (missing tracklog ${st.tracklog_id})`);
          skipped = true;
          break;
        }
        throw err;
      }
    }
    if (skipped || trackData.length === 0) continue;

    // Compress and compute metrics
    const rawTracks = trackData.map(t => t.track);
    const compressed = compressTracks(rawTracks, config.maxSceneSize);
    const withMetrics = compressed.map(t => computeTrackMetrics(t));

    // Store compressed and update DB
    for (let i = 0; i < trackData.length; i++) {
      const { tracklogId } = trackData[i];
      const compressedTrack = withMetrics[i];
      const compressedKey = `scenes/${scene.id}/tracks/${tracklogId}.json`;

      await s3.putObject(compressedKey, JSON.stringify(compressedTrack));

      db.prepare(`
        UPDATE scene_tracks SET compressed_s3_key = ?, compressed_point_count = ?
        WHERE scene_id = ? AND tracklog_id = ?
      `).run(compressedKey, compressedTrack.positions.length, scene.id, tracklogId);
    }

    const totalCompressed = compressed.reduce((sum, t) => sum + t.positions.length, 0);
    console.log(`  ${scene.name}: ${sceneTracks.length} tracks, ${totalCompressed} compressed points`);
  }

  console.log('\nDone!');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
