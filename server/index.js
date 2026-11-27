// Garage server: serves the web app and a small JSON API backed by SQLite.
//   GET  /api/state          the garage (PINs left out) and who this browser is signed in as
//   PUT  /api/state          save garage data; needs a session; users and auth are not taken from here
//   POST /api/login          { userId, pin?, newPin? } → session cookie
//   POST /api/logout
//   POST /api/users          { name, color, pin? } add a person (only while sign-ins are off)
//   POST /api/files          raw body, X-File-Name header → { id, name, type, size, src, at }; needs a session
//   GET  /api/files/:id      the file; needs a session
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const PORT = +(process.env.PORT || 3000);
const DATA_DIR = resolve(process.env.DATA_DIR || join(here, '..', 'data'));
const STATIC_DIR = resolve(process.env.STATIC_DIR || join(here, '..', 'web', 'dist'));
const MAX_BODY = 5 * 1024 * 1024;
const MAX_FILE = 25 * 1024 * 1024;
// Served inline; anything else downloads, so an uploaded HTML or SVG file can never run as a page.
const INLINE = /^(image\/(jpeg|png|gif|webp)|application\/pdf)$/;
const COOKIE = 'garage_session';
// Collections the browser may save. Users and auth change only through their own routes.
const DATA_KEYS = ['vehicles', 'records', 'reminders', 'parts', 'boards', 'notes', 'shelf', 'settings', 'log'];

export function hashPin(pin) { const salt = randomBytes(16); return salt.toString('hex') + ':' + scryptSync(pin, salt, 32).toString('hex'); }
export function checkPin(pin, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const a = scryptSync(String(pin), Buffer.from(salt, 'hex'), 32), b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
const validPin = p => typeof p === 'string' && /^\d{4,8}$/.test(p);

export function createApp(db, dataDir = DATA_DIR) {
  const filesDir = join(dataDir, 'files');
  // Lock a profile for a minute after 5 wrong PINs. In memory: a restart clears it.
  const fails = new Map();
  const locked = id => { const f = fails.get(id); return f && f.n >= 5 && Date.now() - f.at < 60_000; };
  const failed = id => { const f = fails.get(id); fails.set(id, { n: f && Date.now() - f.at < 60_000 ? f.n + 1 : 1, at: Date.now() }); };

  const state = () => {
    const g = Object.fromEntries(DATA_KEYS.map(k => [k, db.read(k, null)]));
    g.users = db.read('users', []).map(u => ({ ...u, hasPin: db.hasPin(u.id) }));
    g.auth = db.read('auth', { signins: false });
    return g;
  };
  const version = () => db.read('version', 0);

  const send = (res, code, body, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers }); res.end(JSON.stringify(body)); };
  const body = req => new Promise((ok, fail) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { fail(Object.assign(new Error('Too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { fail(Object.assign(new Error('Bad JSON'), { code: 400 })); } });
    req.on('error', fail);
  });
  const raw = (req, limit) => new Promise((ok, fail) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { fail(Object.assign(new Error(`Files can be up to ${limit / 1048576} MB.`), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => ok(Buffer.concat(chunks)));
    req.on('error', fail);
  });
  const token = req => (req.headers.cookie || '').split(/;\s*/).map(c => c.split('=')).find(([k]) => k === COOKIE)?.[1] || '';
  const userOf = req => { const t = token(req), id = t && db.session(t), u = id && db.read('users', []).find(x => x.id === id && !x.removed); return u || null; };
  const startSession = (res, id, req) => {
    const t = randomBytes(32).toString('hex'); db.addSession(t, id);
    const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    return { 'set-cookie': `${COOKIE}=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${secure}` };
  };

  async function api(req, res, path) {
    if (path === '/api/state' && req.method === 'GET') { const me = userOf(req); return send(res, 200, { garage: state(), version: version(), me: me ? me.id : null, empty: db.read('users', null) == null }); }

    if (path === '/api/state' && req.method === 'PUT') {
      const b = await body(req), empty = db.read('users', null) == null;
      if (empty) {
        // First run: the browser sends the starting garage, including its first admin profile.
        const users = (b.garage?.users || []).slice(0, 20).map(u => ({ id: String(u.id), name: String(u.name || 'You').slice(0, 60), color: String(u.color || '#5b84ff'), role: u.role === 'admin' ? 'admin' : 'member' }));
        if (!users.some(u => u.role === 'admin')) return send(res, 400, { error: 'The first profile must be an admin.' });
        db.write({ ...Object.fromEntries(DATA_KEYS.map(k => [k, b.garage?.[k] ?? null])), users, auth: { signins: false }, version: 1 });
        return send(res, 200, { version: 1 });
      }
      if (!userOf(req)) return send(res, 401, { error: 'Sign in first.' });
      if (b.version !== version()) return send(res, 409, { error: 'Someone else saved changes. Reloading.', version: version() });
      const v = version() + 1, patch = { version: v };
      for (const k of DATA_KEYS) if (b.garage && k in b.garage) patch[k] = b.garage[k];
      db.write(patch);
      return send(res, 200, { version: v });
    }

    if (path === '/api/login' && req.method === 'POST') {
      const b = await body(req), users = db.read('users', []), auth = db.read('auth', { signins: false });
      const u = users.find(x => x.id === b.userId && !x.removed);
      if (!u) return send(res, 404, { error: 'No such person.' });
      if (locked(u.id)) return send(res, 429, { error: 'Too many tries. Wait a minute.' });
      const stored = db.pinHash(u.id);
      if (stored) {
        if (!checkPin(b.pin || '', stored)) { failed(u.id); return send(res, 401, { error: 'Wrong PIN' }); }
      } else if (u.role === 'admin' || auth.signins) {
        // A profile that needs a PIN and has none sets it on first sign-in.
        if (!validPin(b.newPin)) return send(res, 400, { error: 'Use 4–8 digits' });
        db.setPin(u.id, hashPin(b.newPin));
      }
      fails.delete(u.id);
      return send(res, 200, { me: u.id }, startSession(res, u.id, req));
    }

    if (path === '/api/logout' && req.method === 'POST') { const t = token(req); if (t) db.dropSession(t); return send(res, 200, {}, { 'set-cookie': `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` }); }

    if (path === '/api/files' && req.method === 'POST') {
      const me = userOf(req);
      if (!me) return send(res, 401, { error: 'Sign in first.' });
      const data = await raw(req, MAX_FILE);
      const name = decodeURIComponent(String(req.headers['x-file-name'] || 'file')).replace(/[\\/\0]/g, '_').slice(0, 200) || 'file';
      const type = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].trim().slice(0, 100);
      const f = { id: randomBytes(12).toString('hex'), name, type, size: data.length, at: new Date().toISOString(), by: me.id };
      await mkdir(filesDir, { recursive: true });
      await writeFile(join(filesDir, f.id), data);
      db.addFile(f);
      return send(res, 200, { id: f.id, name, type, size: f.size, at: f.at, src: '/api/files/' + f.id });
    }

    const fm = path.match(/^\/api\/files\/([0-9a-f]{24})$/);
    if (fm && req.method === 'GET') {
      if (!userOf(req)) return send(res, 401, { error: 'Sign in first.' });
      const f = db.file(fm[1]), data = f && await readFile(join(filesDir, f.id)).catch(() => null);
      if (!data) return send(res, 404, { error: 'Not found' });
      const inline = INLINE.test(f.type);
      res.writeHead(200, {
        'content-type': inline ? f.type : 'application/octet-stream', 'content-length': data.length,
        'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox", 'cache-control': 'private, max-age=31536000, immutable',
      });
      return res.end(data);
    }

    if (path === '/api/users' && req.method === 'POST') {
      const b = await body(req), users = db.read('users', []), auth = db.read('auth', { signins: false });
      if (auth.signins) return send(res, 403, { error: 'Ask an admin to add you.' });
      const name = String(b.name || '').trim().slice(0, 60);
      if (!name) return send(res, 400, { error: 'Enter a name.' });
      if (b.pin && !validPin(b.pin)) return send(res, 400, { error: 'PINs need at least 4 digits' });
      const u = { id: 'u' + randomBytes(5).toString('hex'), name, color: /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '#5b84ff', role: users.some(x => x.role === 'admin' && !x.removed) ? 'member' : 'admin' };
      if (u.role === 'admin' && !validPin(b.pin)) return send(res, 400, { error: 'Admins need a PIN.' });
      db.write({ users: [...users, u], version: version() + 1 });
      if (b.pin) db.setPin(u.id, hashPin(b.pin));
      return send(res, 200, { me: u.id, version: version() }, startSession(res, u.id, req));
    }

    return send(res, 404, { error: 'Not found' });
  }

  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  async function file(req, res, path) {
    let p = normalize(join(STATIC_DIR, decodeURIComponent(path)));
    if (p !== STATIC_DIR && !p.startsWith(STATIC_DIR + sep)) { res.writeHead(403); return res.end(); }
    const s = await stat(p).catch(() => null);
    if (!s || s.isDirectory()) p = join(STATIC_DIR, 'index.html'); // app routes fall back to the shell
    const data = await readFile(p).catch(() => null);
    if (!data) { res.writeHead(404); return res.end('Build the web app first: cd web && npm run build'); }
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream', 'cache-control': p.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache' });
    res.end(data);
  }

  return createServer(async (req, res) => {
    const path = new URL(req.url || '/', 'http://x').pathname;
    try { if (path.startsWith('/api/')) await api(req, res, path); else await file(req, res, path); }
    catch (e) { if (!res.headersSent) send(res, e.code === 413 || e.code === 400 ? e.code : 500, { error: e.code ? e.message : 'Server error' }); if (!e.code) console.error(e); }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = openDb(DATA_DIR);
  createApp(db).listen(PORT, () => console.log(`Garage on http://localhost:${PORT} (data in ${DATA_DIR})`));
}
