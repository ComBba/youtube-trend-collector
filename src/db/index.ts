import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

const dbPath = process.env.DATABASE_PATH || './data/trends.db';

// 디렉토리 생성
const dir = dirname(dbPath);
if (dir !== '.') {
  mkdirSync(dir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

// 초기화 함수
export function initDb() {
  // 테이블 생성 (Drizzle 마이그레이션 없이 직접 생성)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      category TEXT,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id TEXT UNIQUE NOT NULL,
      keyword_id INTEGER REFERENCES keywords(id),
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      channel_name TEXT,
      view_count INTEGER,
      like_count INTEGER,
      duration TEXT,
      thumbnail TEXT,
      published_at INTEGER,
      collected_at INTEGER DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS trends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword_id INTEGER REFERENCES keywords(id),
      date INTEGER NOT NULL,
      period TEXT DEFAULT 'daily',
      video_count INTEGER DEFAULT 0,
      total_views INTEGER DEFAULT 0,
      avg_views INTEGER DEFAULT 0,
      top_video_id INTEGER REFERENCES videos(id),
      created_at INTEGER DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS collection_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at INTEGER,
      completed_at INTEGER,
      keyword_count INTEGER,
      video_count INTEGER,
      status TEXT,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_videos_keyword ON videos(keyword_id);
    CREATE INDEX IF NOT EXISTS idx_videos_collected ON videos(collected_at);
    CREATE INDEX IF NOT EXISTS idx_trends_keyword_date ON trends(keyword_id, date);
  `);
}

export default db;
