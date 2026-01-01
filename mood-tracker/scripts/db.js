// scripts/db.js
import * as SQLite from "expo-sqlite";

/**
 * Called by <SQLiteProvider onInit={...} />
 */
export async function migrateDbIfNeeded(db) {
  await db.execAsync(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
  `);

  const vRow = await db.getFirstAsync("PRAGMA user_version;");
  const version = vRow?.user_version ?? vRow?.["user_version"] ?? 0;
  if (version >= 1) return;

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS entries (
      date TEXT PRIMARY KEY NOT NULL,          -- YYYY-MM-DD
      mood INTEGER NOT NULL,                   -- 1..5
      tags_json TEXT NOT NULL DEFAULT '[]',    -- JSON array of strings
      note TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_date TEXT NOT NULL,
      uri TEXT NOT NULL,
      media_type TEXT NOT NULL,                -- 'image' | 'video' (store whatever picker returns)
      created_at INTEGER NOT NULL,
      FOREIGN KEY(entry_date) REFERENCES entries(date) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_attachments_entry_date
      ON attachments(entry_date);
  `);

  await db.execAsync("PRAGMA user_version = 1;");
}

export async function upsertEntry(db, { date, mood, tags = [], note = "" }) {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO entries (date, mood, tags_json, note, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       mood=excluded.mood,
       tags_json=excluded.tags_json,
       note=excluded.note,
       updated_at=excluded.updated_at;`,
    date,
    mood,
    JSON.stringify(tags),
    note,
    now
  );
}

export async function getEntry(db, date) {
  const entry = await db.getFirstAsync(
    `SELECT date, mood, tags_json, note, updated_at
     FROM entries
     WHERE date = ?;`,
    date
  );
  if (!entry) return null;

  const attachments = await db.getAllAsync(
    `SELECT id, uri, media_type, created_at
     FROM attachments
     WHERE entry_date = ?
     ORDER BY id DESC;`,
    date
  );

  return {
    date: entry.date,
    mood: entry.mood,
    tags: safeJsonParse(entry.tags_json, []),
    note: entry.note,
    updated_at: entry.updated_at,
    attachments,
  };
}

export async function getMonthEntries(db, yearMonth) {
  return await db.getAllAsync(
    `SELECT date, mood, tags_json, note, updated_at
     FROM entries
     WHERE date LIKE ?
     ORDER BY date ASC;`,
    `${yearMonth}%`
  );
}

export async function getEntriesBetween(db, startDate, endDate) {
  return await db.getAllAsync(
    `SELECT date, mood, tags_json, note, updated_at
     FROM entries
     WHERE date BETWEEN ? AND ?
     ORDER BY date ASC;`,
    startDate,
    endDate
  );
}

export async function addAttachments(db, date, assets) {
  const now = Date.now();
  const stmt = await db.prepareAsync(
    `INSERT INTO attachments (entry_date, uri, media_type, created_at)
     VALUES (?, ?, ?, ?);`
  );
  try {
    for (const a of assets) {
      await stmt.executeAsync([date, a.uri, a.type ?? "image", now]);
    }
  } finally {
    await stmt.finalizeAsync();
  }
}

export async function deleteAttachment(db, id) {
  await db.runAsync(`DELETE FROM attachments WHERE id = ?;`, id);
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}
