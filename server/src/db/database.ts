import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = config.database.path;
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
  }
  return db;
}

function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracklogs (
      id TEXT PRIMARY KEY,
      pilot_name TEXT NOT NULL,
      point_count INTEGER NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      file_size INTEGER NOT NULL,
      original_filename TEXT NOT NULL,
      s3_key TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'processing',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scene_tracks (
      scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
      tracklog_id TEXT NOT NULL REFERENCES tracklogs(id),
      compressed_s3_key TEXT,
      compressed_point_count INTEGER,
      PRIMARY KEY (scene_id, tracklog_id)
    );
  `);
}
