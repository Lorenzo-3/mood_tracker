// scripts/db.js

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

  // scripts/db.js (add inside migrateDbIfNeeded)
if (version < 2) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS tag_defs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      color TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  // Optional: seed tag_defs from existing entries.tags_json (if you have old typed tags)
  const rows = await db.getAllAsync(`SELECT tags_json FROM entries;`);
  const palette = ["#D64545","#E07A3F","#D9B44A","#4BAA6A","#2F8F83","#4A6FE3","#B04AE3"];

  const pickColor = (name) => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  };

  for (const r of rows) {
    let arr = [];
    try { arr = JSON.parse(r.tags_json ?? "[]"); } catch {}
    if (!Array.isArray(arr)) continue;
    for (const t of arr) {
      if (typeof t !== "string") continue;
      const name = t.trim();
      if (!name) continue;
      await db.runAsync(
        `INSERT OR IGNORE INTO tag_defs (name, color, created_at) VALUES (?, ?, ?);`,
        name,
        pickColor(name),
        Date.now()
      );
    }
  }

  await db.execAsync("PRAGMA user_version = 2;");
}


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

export async function getAllTagDefs(db) {
  return await db.getAllAsync(
    `SELECT id, name, color FROM tag_defs ORDER BY name COLLATE NOCASE;`
  );
}

export async function addTagDef(db, { name, color }) {
  const n = (name ?? "").trim();
  if (!n) throw new Error("Tag name is empty");
  await db.runAsync(
    `INSERT INTO tag_defs (name, color, created_at) VALUES (?, ?, ?);`,
    n,
    color,
    Date.now()
  );
}

export async function deleteTagDef(db, name) {
  const n = (name ?? "").trim();
  await db.runAsync(`DELETE FROM tag_defs WHERE name = ?;`, n);

  // keep entries consistent: remove this tag from every entry.tags_json (no JSON1 dependency)
  const entries = await db.getAllAsync(`SELECT date, tags_json FROM entries;`);
  for (const e of entries) {
    let tags = [];
    try { tags = JSON.parse(e.tags_json ?? "[]"); } catch {}
    if (!Array.isArray(tags)) continue;
    const next = tags.filter(t => typeof t === "string" && t.trim().toLowerCase() !== n.toLowerCase());
    if (next.length !== tags.length) {
      await db.runAsync(`UPDATE entries SET tags_json = ? WHERE date = ?;`, JSON.stringify(next), e.date);
    }
  }
}
