import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dbPath =
  process.env.DB_PATH && process.env.DB_PATH.length > 0
    ? process.env.DB_PATH
    : path.join(process.cwd(), "data", "commute.db");

mkdirSync(path.dirname(dbPath), { recursive: true });

const store = globalThis as unknown as { __commuteDb?: DatabaseSync };

export const db = store.__commuteDb ?? new DatabaseSync(dbPath);

if (!store.__commuteDb) {
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      origin_label TEXT NOT NULL,
      origin_lat REAL NOT NULL,
      origin_lng REAL NOT NULL,
      dest_label TEXT NOT NULL,
      dest_lat REAL NOT NULL,
      dest_lng REAL NOT NULL,
      via_label TEXT,
      via_lat REAL,
      via_lng REAL,
      arrival_target TEXT NOT NULL DEFAULT '09:30',
      refresh_minutes INTEGER NOT NULL DEFAULT 3,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
      captured_at TEXT NOT NULL,
      duration_s INTEGER NOT NULL,
      freeflow_s INTEGER NOT NULL,
      historic_s INTEGER,
      distance_m INTEGER NOT NULL,
      source TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_route_time
      ON snapshots(route_id, captured_at);
  `);

  const routeColumns = db.prepare("PRAGMA table_info(routes)").all() as { name: string }[];
  if (!routeColumns.some((column) => column.name === "paired_route_id")) {
    db.exec(
      "ALTER TABLE routes ADD COLUMN paired_route_id INTEGER REFERENCES routes(id) ON DELETE SET NULL",
    );
  }
  if (!routeColumns.some((column) => column.name === "via_label")) {
    db.exec("ALTER TABLE routes ADD COLUMN via_label TEXT");
  }
  if (!routeColumns.some((column) => column.name === "via_lat")) {
    db.exec("ALTER TABLE routes ADD COLUMN via_lat REAL");
  }
  if (!routeColumns.some((column) => column.name === "via_lng")) {
    db.exec("ALTER TABLE routes ADD COLUMN via_lng REAL");
  }

  store.__commuteDb = db;
}
