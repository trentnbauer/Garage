// SQLite storage. The garage is kept as one JSON document per top-level collection, plus
// tables for PIN hashes and sessions, which never go to the browser.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function openDb(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, 'garage.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS doc (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pins (user_id TEXT PRIMARY KEY, hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, size INTEGER NOT NULL, at TEXT NOT NULL, by TEXT);
  `);
  const get = db.prepare('SELECT value FROM doc WHERE key = ?');
  const put = db.prepare('INSERT INTO doc (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const tx = fn => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };

  return {
    read(key, fallback) { const row = get.get(key); return row ? JSON.parse(row.value) : fallback; },
    write(entries) { tx(() => { for (const [k, v] of Object.entries(entries)) put.run(k, JSON.stringify(v)); }); },
    pinHash: id => db.prepare('SELECT hash FROM pins WHERE user_id = ?').get(id)?.hash || null,
    setPin: (id, hash) => db.prepare('INSERT INTO pins (user_id, hash) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET hash = excluded.hash').run(id, hash),
    clearPin: id => db.prepare('DELETE FROM pins WHERE user_id = ?').run(id),
    hasPin: id => !!db.prepare('SELECT 1 FROM pins WHERE user_id = ?').get(id),
    session: token => db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token)?.user_id || null,
    addSession: (token, id) => db.prepare('INSERT INTO sessions (token, user_id, created) VALUES (?, ?, ?)').run(token, id, new Date().toISOString()),
    dropSession: token => db.prepare('DELETE FROM sessions WHERE token = ?').run(token),
    addFile: f => db.prepare('INSERT INTO files (id, name, type, size, at, by) VALUES (?, ?, ?, ?, ?, ?)').run(f.id, f.name, f.type, f.size, f.at, f.by),
    file: id => db.prepare('SELECT * FROM files WHERE id = ?').get(id) || null,
    close: () => db.close(),
  };
}
