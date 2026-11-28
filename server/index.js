// Garage server: serves the web app and a small JSON API backed by SQLite.
//   GET  /api/state          the garage (PINs left out) and who this browser is signed in as
//   PUT  /api/state          save garage data; needs a session; users and auth are not taken from here
//   POST /api/login          { userId, pin?, newPin? } → session cookie
//   POST /api/logout
//   POST /api/users          { name, color, pin? } add a person (only while sign-ins are off)
//   POST /api/files          raw body, X-File-Name header → { id, name, type, size, src, at }; needs a session
//   GET  /api/files/:id      the file; needs a session
//   POST /api/login/totp     { ticket, code } second step when the profile has an authenticator app
//   POST /api/me             { name?, color? }       POST|DELETE /api/pin { pin }
//   POST /api/totp/start → { secret, uri }; POST /api/totp/verify { code }; DELETE /api/totp
//   Passkeys: POST /api/passkeys/options, POST /api/passkeys { response, name }, DELETE /api/passkeys/:id (your own);
//   POST /api/passkey/login/options { ticket? }, POST /api/passkey/login { response, ticket? }
//   PUT  /api/admin/auth { signins?, tfaTotp?, tfaPasskey?, tfaRequire? }; POST /api/admin/users { name, role };
//   PATCH /api/admin/users/:id { role?, removed?, resetPin? }   (admins only)
//   PUT  /api/admin/ai {…, apiKey?: string|null}; POST /api/admin/ai/test
//   PUT  /api/admin/smtp {…, pass?: string|null}; POST /api/admin/smtp/test { to }
//   POST /api/ai { prompt } → { text }   (anyone signed in, while AI help is on)
//   POST /api/admin/import/scan {mode:'volume', path} | {mode:'api', url, key | user+pass} → { token, dump, files: {name: size}, label }
//   POST /api/admin/import/files { token, names } → { name: file }   (copies LubeLogger attachments into Garage's file store)
//   GET  /api/admin/env?secrets=1 → { text, count }   (settings as a .env file; variables set in the environment lock their fields)
//   GET  /api/admin/tunnel → status and log; PUT /api/admin/tunnel {accountId?, token?: string|null, appUrl?, allow?, enabled?}
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { newSecret, verify as totpOk } from './totp.js';
import { askAI } from './ai.js';
import { sendMail } from './smtp.js';
import { applyTunnel, hostOf, runner } from './tunnel.js';
import { fromEnv, lockedVars, lockOf, toEnv } from './env.js';
import { fromApi, fromVolume } from './lube.js';
import { createMailer } from './mailer.js';
import { createPasskeys } from './passkeys.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const PORT = +(process.env.PORT || 3000);
const DATA_DIR = resolve(process.env.DATA_DIR || join(here, '..', 'data'));
const STATIC_DIR = resolve(process.env.STATIC_DIR || join(here, '..', 'web', 'dist'));
const MAX_BODY = 5 * 1024 * 1024;
const MAX_FILE = 100 * 1024 * 1024; // workshop manuals run large
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

export function createApp(db, dataDir = DATA_DIR, { tunnel = runner(), cfFetch, env = process.env, lubeFetch, mail = true, mailSend } = {}) {
  const filesDir = join(dataDir, 'files');
  // Lock a profile for a minute after 5 wrong PINs. In memory: a restart clears it.
  const fails = new Map();
  const locked = id => { const f = fails.get(id); return f && f.n >= 5 && Date.now() - f.at < 60_000; };
  const failed = id => { const f = fails.get(id); fails.set(id, { n: f && Date.now() - f.at < 60_000 ? f.n + 1 : 1, at: Date.now() }); };

  const AUTH0 = { signins: false, tfaTotp: true, tfaPasskey: true, tfaRequire: 'off' };
  // Admin-set integrations. Their secrets (API key, SMTP password) live under their own keys and are never sent out.
  const AI0 = { enabled: false, provider: 'anthropic', model: '', baseUrl: '', shareSpecs: true, shareHistory: true, shareNotes: false, shareManual: true };
  const SMTP0 = { enabled: false, host: '', port: 587, security: 'starttls', user: '', fromName: 'Garage', fromAddr: '', replyTo: '', to: '', digest: 'weekly', overdue: true, blockers: true, summary: false, signin: true };
  const aiCfg = () => ({ ...AI0, ...db.read('ai', {}) }), smtpCfg = () => ({ ...SMTP0, ...db.read('smtp', {}) });
  // The Cloudflare API token and the tunnel's run token are secrets too.
  const TUN0 = { enabled: false, accountId: '', appUrl: '', allow: '', appliedAt: null, error: null };
  const tunCfg = () => ({ ...TUN0, ...db.read('tunnel', {}) });
  const tunView = () => { const c = tunCfg(), r = tunnel.state(); return { ...c, hasToken: !!db.read('secret:cfToken', ''), service: `http://localhost:${PORT}`, status: r.status, since: r.since, runError: r.error }; };
  const tunSetup = async prevUrl => { // returns '' or the reason it failed
    const c = tunCfg(), tok = db.read('secret:cfToken', '');
    if (!c.accountId || !tok) return '';
    try {
      const r = await applyTunnel({ ...c, prevUrl, service: `http://localhost:${PORT}` }, tok, cfFetch);
      db.write({ tunnel: { ...c, appliedAt: new Date().toISOString(), error: null }, 'secret:tunnelRun': r.runToken });
      return '';
    } catch (e) { db.write({ tunnel: { ...c, error: e.message } }); return e.message; }
  };
  const tunSync = () => { const c = tunCfg(), run = db.read('secret:tunnelRun', ''); if (c.enabled && run) tunnel.start(run); else tunnel.stop(); };
  // A field set by an environment variable can only change there; edits would quietly revert on restart.
  const envSet = fromEnv(env, w => console.warn('Garage:', w));
  const lockedIn = (doc, b, secret) => { for (const f of Object.keys(b)) { const k = f === secret?.[0] ? lockOf(env, secret[1], null) : lockOf(env, doc, f); if (k) return `${k} is set in .env, so it can only be changed there.`; } return ''; };
  const pick = (b, base) => Object.fromEntries(Object.keys(base).filter(k => k in b && typeof b[k] === typeof base[k]).map(k => [k, typeof b[k] === 'string' ? b[k].slice(0, 500) : b[k]]));
  const auth = () => ({ ...AUTH0, ...db.read('auth', {}) });
  // TOTP secrets live under their own keys, never in the state sent to browsers.
  const totpOf = id => db.read('totp:' + id, '');
  // Passkeys too: public keys aren't secret, but they stay out of the garage data like other sign-in details.
  const keysOf = id => db.read('passkeys:' + id, null) || [];
  const pk = createPasskeys({ keys: keysOf, setKeys: (id, l) => db.write({ ['passkeys:' + id]: l }), allKeys: () => db.read('users', []).filter(u => !u.removed).flatMap(u => keysOf(u.id).map(k => [u.id, k])) });
  const has2 = id => { const a = auth(); return !!((a.tfaTotp && totpOf(id)) || (a.tfaPasskey && keysOf(id).length)); };
  const state = () => {
    const g = Object.fromEntries(DATA_KEYS.map(k => [k, db.read(k, null)]));
    g.users = db.read('users', []).map(u => ({ ...u, hasPin: db.hasPin(u.id), hasTotp: !!totpOf(u.id), passkeys: keysOf(u.id).map(k => ({ id: k.id, name: k.name, at: k.at })) }));
    g.auth = auth();
    g.ai = { ...aiCfg(), hasKey: !!db.read('secret:aiKey', '') };
    g.smtp = { ...smtpCfg(), hasPass: !!db.read('secret:smtpPass', '') };
    g.tunnel = tunView();
    g.envLocked = lockedVars(env);
    return g;
  };
  const scans = new Map(); // import token → LubeLogger source, kept for 30 minutes between preview and import
  const tickets = new Map(), pending = new Map(); // second-step tickets and TOTP setups, both short-lived
  const log = (by, text) => db.write({ log: [{ id: randomBytes(5).toString('hex'), at: new Date().toISOString(), by, vid: null, text }, ...db.read('log', []) || []].slice(0, 500), version: version() + 1 });
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
    const u = db.read('users', []).find(x => x.id === id);
    if (u) mailer.signedIn(u, req.headers['user-agent']).catch(() => {}); // a new browser may get a sign-in alert
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
        db.write({ ...Object.fromEntries(DATA_KEYS.map(k => [k, b.garage?.[k] ?? null])), users, auth: { signins: false, ...envSet.auth }, version: 1 });
        if (envSet.settings) db.write({ settings: { ...(b.garage?.settings || {}), ...envSet.settings } });
        return send(res, 200, { version: 1 });
      }
      if (!userOf(req)) return send(res, 401, { error: 'Sign in first.' });
      if (b.version !== version()) return send(res, 409, { error: 'Someone else saved changes. Reloading.', version: version() });
      const v = version() + 1, patch = { version: v };
      for (const k of DATA_KEYS) if (b.garage && k in b.garage) patch[k] = b.garage[k];
      if (patch.settings && envSet.settings) patch.settings = { ...patch.settings, ...envSet.settings };
      db.write(patch);
      return send(res, 200, { version: v });
    }

    if (path === '/api/login' && req.method === 'POST') {
      const b = await body(req), users = db.read('users', []), a = auth();
      const u = users.find(x => x.id === b.userId && !x.removed);
      if (!u) return send(res, 404, { error: 'No such person.' });
      if (locked(u.id)) return send(res, 429, { error: 'Too many tries. Wait a minute.' });
      const stored = db.pinHash(u.id), secret = auth().tfaTotp ? totpOf(u.id) : '';
      // An authenticator code can stand in for the PIN.
      if (b.code != null && secret) {
        if (!totpOk(secret, b.code)) { failed(u.id); return send(res, 401, { error: 'That code didn’t match. Try the newest one.' }); }
        fails.delete(u.id);
        return send(res, 200, { me: u.id }, startSession(res, u.id, req));
      }
      if (stored) {
        if (!checkPin(b.pin || '', stored)) { failed(u.id); return send(res, 401, { error: 'Wrong PIN' }); }
      } else if (u.role === 'admin' || a.signins) {
        // A profile that needs a PIN and has none sets it on first sign-in.
        if (!validPin(b.newPin)) return send(res, 400, { error: 'Use 4–8 digits' });
        db.setPin(u.id, hashPin(b.newPin));
      }
      fails.delete(u.id);
      if (has2(u.id)) { const t = randomBytes(24).toString('hex'); tickets.set(t, { id: u.id, at: Date.now() }); return send(res, 200, { tfa: true, ticket: t, totp: !!secret, passkey: !!(a.tfaPasskey && keysOf(u.id).length) }); }
      return send(res, 200, { me: u.id }, startSession(res, u.id, req));
    }

    if (path === '/api/login/totp' && req.method === 'POST') {
      const b = await body(req), t = tickets.get(String(b.ticket || ''));
      if (!t || Date.now() - t.at > 300_000) return send(res, 401, { error: 'That took too long. Sign in again.' });
      if (locked(t.id)) return send(res, 429, { error: 'Too many tries. Wait a minute.' });
      if (!totpOk(totpOf(t.id), b.code)) { failed(t.id); return send(res, 401, { error: 'That code didn’t match. Check your phone’s clock and try the newest code.' }); }
      tickets.delete(String(b.ticket)); fails.delete(t.id);
      return send(res, 200, { me: t.id }, startSession(res, t.id, req));
    }

    if (path === '/api/passkey/login/options' && req.method === 'POST') {
      if (!auth().tfaPasskey) return send(res, 400, { error: 'Passkeys are off. Ask an admin.' });
      const b = await body(req), t = b.ticket ? tickets.get(String(b.ticket)) : null;
      if (b.ticket && (!t || Date.now() - t.at > 300_000)) return send(res, 401, { error: 'That took too long. Sign in again.' });
      return send(res, 200, await pk.loginOptions(req, t?.id));
    }
    if (path === '/api/passkey/login' && req.method === 'POST') {
      if (!auth().tfaPasskey) return send(res, 400, { error: 'Passkeys are off. Ask an admin.' });
      const b = await body(req);
      let uid; try { uid = await pk.login(b.response, req); } catch (e) { return send(res, 401, { error: e.message }); }
      if (b.ticket) { const t = tickets.get(String(b.ticket)); if (!t || t.id !== uid) return send(res, 401, { error: 'That passkey is for someone else.' }); tickets.delete(String(b.ticket)); }
      fails.delete(uid);
      return send(res, 200, { me: uid }, startSession(res, uid, req)); // a passkey is something you have, unlocked on your device: a full sign-in
    }

    if (path === '/api/logout' && req.method === 'POST') { const t = token(req); if (t) db.dropSession(t); return send(res, 200, {}, { 'set-cookie': `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` }); }

    // ---- your own account ----
    if (['/api/me', '/api/pin', '/api/totp', '/api/totp/start', '/api/totp/verify', '/api/passkeys', '/api/passkeys/options'].includes(path) || path.startsWith('/api/passkeys/')) {
      const me = userOf(req);
      if (!me) return send(res, 401, { error: 'Sign in first.' });
      const b = req.method === 'DELETE' ? {} : await body(req), users = db.read('users', []), a = auth();
      const setMe = patch => db.write({ users: users.map(x => (x.id === me.id ? { ...x, ...patch } : x)), version: version() + 1 });
      const required = a.tfaRequire === 'all' || (a.tfaRequire === 'admins' && me.role === 'admin');
      if (path === '/api/me' && req.method === 'POST') {
        const patch = {};
        if (b.name != null) { const n = String(b.name).trim().slice(0, 60); if (!n) return send(res, 400, { error: 'Enter a name.' }); patch.name = n; }
        if (b.color != null && /^#[0-9a-f]{6}$/i.test(b.color)) patch.color = b.color;
        setMe(patch); return send(res, 200, {});
      }
      if (path === '/api/pin' && req.method === 'POST') { if (!validPin(b.pin)) return send(res, 400, { error: 'Use 4–8 digits.' }); db.setPin(me.id, hashPin(b.pin)); log(me.id, 'changed their PIN'); return send(res, 200, {}); }
      if (path === '/api/pin' && req.method === 'DELETE') {
        if (me.role === 'admin' || a.signins) return send(res, 400, { error: me.role === 'admin' ? 'Admins always need a PIN.' : 'Everyone needs a PIN while sign-ins are on.' });
        db.clearPin(me.id); return send(res, 200, {});
      }
      if (path === '/api/totp/start' && req.method === 'POST') {
        if (!a.tfaTotp) return send(res, 400, { error: 'Authenticator apps are off. Ask an admin.' });
        const secret = newSecret(); pending.set(me.id, secret);
        return send(res, 200, { secret, uri: `otpauth://totp/Garage:${encodeURIComponent(me.name)}?secret=${secret}&issuer=Garage` });
      }
      if (path === '/api/totp/verify' && req.method === 'POST') {
        const secret = pending.get(me.id);
        if (!secret) return send(res, 400, { error: 'Start the setup again.' });
        if (!totpOk(secret, b.code)) return send(res, 400, { error: 'That code didn’t match. Try the newest one.' });
        pending.delete(me.id); db.write({ ['totp:' + me.id]: secret }); log(me.id, 'turned on an authenticator app');
        return send(res, 200, {});
      }
      if (path === '/api/totp' && req.method === 'DELETE') {
        if (required && !(a.tfaPasskey && keysOf(me.id).length)) return send(res, 400, { error: 'Two-factor is required for you — add a passkey before turning this off.' });
        db.write({ ['totp:' + me.id]: '' }); log(me.id, 'turned off their authenticator app');
        return send(res, 200, {});
      }
      if (!a.tfaPasskey && path.startsWith('/api/passkeys') && req.method !== 'DELETE') return send(res, 400, { error: 'Passkeys are off. Ask an admin.' });
      if (path === '/api/passkeys/options' && req.method === 'POST') return send(res, 200, await pk.registerOptions(me, req));
      if (path === '/api/passkeys' && req.method === 'POST') {
        try { const k = await pk.register(me, b.response, b.name, req); log(me.id, `added a passkey (${k.name})`); return send(res, 200, { id: k.id }); }
        catch (e) { return send(res, 400, { error: e.message }); }
      }
      const km = path.match(/^\/api\/passkeys\/([\w-]{1,512})$/);
      if (km && req.method === 'DELETE') {
        const left = keysOf(me.id).filter(k => k.id !== km[1]);
        if (required && !left.length && !(a.tfaTotp && totpOf(me.id))) return send(res, 400, { error: 'Two-factor is required for you — set up an authenticator app before removing your last passkey.' });
        db.write({ ['passkeys:' + me.id]: left }); log(me.id, 'removed a passkey');
        return send(res, 200, {});
      }
    }

    // ---- admin ----
    if (path.startsWith('/api/admin/')) {
      const me = userOf(req);
      if (!me || me.role !== 'admin') return send(res, 403, { error: 'Admins only.' });
      const b = await body(req), users = db.read('users', []), a = auth();
      if (path === '/api/admin/auth' && req.method === 'PUT') {
        { const lk = lockedIn('auth', b); if (lk) return send(res, 400, { error: lk }); }
        const nx = { ...a };
        if (typeof b.signins === 'boolean') { if (b.signins && !db.hasPin(me.id)) return send(res, 400, { error: 'Set your own PIN first (Settings → Profile), or you’ll be locked out.' }); nx.signins = b.signins; }
        if (typeof b.tfaTotp === 'boolean') nx.tfaTotp = b.tfaTotp;
        if (typeof b.tfaPasskey === 'boolean') nx.tfaPasskey = b.tfaPasskey;
        if (!nx.tfaTotp && !nx.tfaPasskey) nx.tfaRequire = 'off';
        if (['off', 'admins', 'all'].includes(b.tfaRequire)) { if (b.tfaRequire !== 'off' && !nx.tfaTotp && !nx.tfaPasskey) return send(res, 400, { error: 'Turn on authenticator apps or passkeys first.' }); nx.tfaRequire = b.tfaRequire; }
        db.write({ auth: nx });
        const what = Object.keys(b).map(k => k === 'signins' ? `turned ${nx.signins ? 'on' : 'off'} sign-ins` : k === 'tfaTotp' ? `turned ${nx.tfaTotp ? 'on' : 'off'} authenticator apps` : k === 'tfaPasskey' ? `turned ${nx.tfaPasskey ? 'on' : 'off'} passkeys` : `set two-factor to ${({ off: 'optional', admins: 'admins', all: 'everyone' })[nx.tfaRequire]}`).join(', ');
        if (what) log(me.id, what);
        return send(res, 200, { auth: nx });
      }
      if (path === '/api/admin/users' && req.method === 'POST') {
        const name = String(b.name || '').trim().slice(0, 60);
        if (!name) return send(res, 400, { error: 'Enter a name.' });
        const u = { id: 'u' + randomBytes(5).toString('hex'), name, color: ['#5b84ff', '#3fcf8e', '#e8b04b', '#f2685f', '#b48cff', '#4fc3d9'][users.length % 6], role: b.role === 'admin' ? 'admin' : 'member' };
        db.write({ users: [...users, u], version: version() + 1 }); log(me.id, `added ${name} as ${u.role === 'admin' ? 'an admin' : 'a member'}`);
        return send(res, 200, { id: u.id });
      }
      const um = path.match(/^\/api\/admin\/users\/([\w-]+)$/);
      if (um && req.method === 'PATCH') {
        const u = users.find(x => x.id === um[1] && !x.removed);
        if (!u) return send(res, 404, { error: 'No such person.' });
        const admins = users.filter(x => x.role === 'admin' && !x.removed);
        const losesAdmin = u.role === 'admin' && (b.removed || (b.role && b.role !== 'admin'));
        if (losesAdmin && admins.length <= 1) return send(res, 400, { error: 'Garage needs at least one admin.' });
        if (b.removed && u.id === me.id) return send(res, 400, { error: 'You can’t remove yourself.' });
        const patch = {};
        if (b.role === 'admin' || b.role === 'member') patch.role = b.role;
        if (b.removed) patch.removed = true;
        if (b.resetPin) { db.clearPin(u.id); db.write({ ['totp:' + u.id]: '', ['passkeys:' + u.id]: [] }); }
        if (Object.keys(patch).length) db.write({ users: users.map(x => (x.id === u.id ? { ...x, ...patch } : x)), version: version() + 1 });
        log(me.id, b.removed ? `removed ${u.name}` : b.resetPin ? `reset ${u.name}’s PIN and two-factor` : `made ${u.name} ${patch.role === 'admin' ? 'an admin' : 'a member'}`);
        return send(res, 200, {});
      }
      if (path === '/api/admin/ai' && req.method === 'PUT') {
        { const lk = lockedIn('ai', b, ['apiKey', 'secret:aiKey']); if (lk) return send(res, 400, { error: lk }); }
        const nx = { ...aiCfg(), ...pick(b, AI0) };
        if (!['anthropic', 'openai', 'ollama'].includes(nx.provider)) return send(res, 400, { error: 'Unknown provider.' });
        db.write({ ai: nx, ...(typeof b.apiKey === 'string' ? { 'secret:aiKey': b.apiKey.trim() } : b.apiKey === null ? { 'secret:aiKey': '' } : {}) });
        if ('enabled' in b) log(me.id, `turned ${nx.enabled ? 'on' : 'off'} AI help`);
        if ('apiKey' in b) log(me.id, b.apiKey ? 'saved the AI API key' : 'removed the AI API key');
        return send(res, 200, {});
      }
      if (path === '/api/admin/ai/test' && req.method === 'POST') {
        try { const text = await askAI(aiCfg(), db.read('secret:aiKey', ''), 'Reply with the single word: ready'); return send(res, 200, { text }); }
        catch (e) { return send(res, 400, { error: e.message }); }
      }
      if (path === '/api/admin/smtp' && req.method === 'PUT') {
        { const lk = lockedIn('smtp', b, ['pass', 'secret:smtpPass']); if (lk) return send(res, 400, { error: lk }); }
        const nx = { ...smtpCfg(), ...pick(b, SMTP0) };
        if (!['starttls', 'ssl', 'none'].includes(nx.security)) return send(res, 400, { error: 'Unknown security setting.' });
        db.write({ smtp: nx, ...(typeof b.pass === 'string' ? { 'secret:smtpPass': b.pass } : b.pass === null ? { 'secret:smtpPass': '' } : {}) });
        if ('enabled' in b) log(me.id, `turned ${nx.enabled ? 'on' : 'off'} email`);
        if ('pass' in b) log(me.id, b.pass ? 'saved the SMTP password' : 'removed the SMTP password');
        return send(res, 200, {});
      }
      if (path === '/api/admin/smtp/test' && req.method === 'POST') {
        const c = smtpCfg();
        try {
          await sendMail({ ...c, pass: db.read('secret:smtpPass', '') }, { fromName: c.fromName, from: c.fromAddr, replyTo: c.replyTo, to: [String(b.to || '')], subject: 'Garage test email', text: `This is a test from Garage, sent by ${me.name}.\n\nIf you can read this, email is set up.` });
          log(me.id, 'sent a test email'); return send(res, 200, {});
        } catch (e) { return send(res, 400, { error: e.message }); }
      }
      if (path === '/api/admin/import/scan' && req.method === 'POST') {
        let src;
        try {
          if (b.mode === 'volume') { const p = String(b.path || '').trim(); if (!p.startsWith('/')) return send(res, 400, { error: 'Enter the folder path inside the container, starting with /.' }); src = fromVolume(p); }
          else if (b.mode === 'api') src = await fromApi(b.url, b.user ? { user: String(b.user), pass: String(b.pass || '') } : { key: String(b.key || '') }, lubeFetch);
          else return send(res, 400, { error: 'Pick the Docker volume or the API.' });
        } catch (e) { return send(res, 400, { error: e.message }); }
        if (!(src.dump.vehicles || []).length) return send(res, 400, { error: 'No vehicles found in that LubeLogger.' });
        const t = randomBytes(16).toString('hex'); scans.set(t, { ...src, at: Date.now() });
        for (const [k, v] of scans) if (Date.now() - v.at > 30 * 60_000) scans.delete(k);
        return send(res, 200, { token: t, dump: src.dump, files: Object.fromEntries(Object.entries(src.files).map(([n, f]) => [n, f.size])), label: src.label, noFiles: !!src.noFiles, apiReminders: !!src.apiReminders });
      }
      if (path === '/api/admin/import/files' && req.method === 'POST') {
        const sc = scans.get(String(b.token || '')); if (!sc) return send(res, 400, { error: 'That scan has expired. Scan again.' });
        const out = {}; await mkdir(filesDir, { recursive: true });
        for (const n of [...new Set((b.names || []).map(String))].slice(0, 5000)) {
          const f = sc.files[n]; if (!f) continue;
          try {
            const data = await f.read(), ext = (n.split('.').pop() || '').toLowerCase();
            const rec = { id: randomBytes(12).toString('hex'), name: n, type: { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf', eml: 'message/rfc822' }[ext] || 'application/octet-stream', size: data.length, at: new Date().toISOString(), by: me.id };
            await writeFile(join(filesDir, rec.id), data); db.addFile(rec);
            out[n] = { id: rec.id, type: rec.type, size: rec.size, src: '/api/files/' + rec.id };
          } catch { /* a file that can't be read is left out; its name stays on the entry */ }
        }
        return send(res, 200, out);
      }
      if (path === '/api/admin/env' && req.method === 'GET') {
        const secrets = new URL(req.url, 'http://x').searchParams.get('secrets') === '1';
        const docs = { settings: () => db.read('settings', null) || {}, auth, ai: aiCfg, smtp: smtpCfg, tunnel: tunCfg };
        if (secrets) log(me.id, 'exported settings as .env (with secrets)');
        return send(res, 200, toEnv((doc, def) => (docs[doc] ? docs[doc]() : db.read(doc, def)), { secrets, port: PORT }));
      }
      if (path === '/api/admin/tunnel' && req.method === 'GET') return send(res, 200, { ...tunView(), logs: tunnel.state().logs });
      if (path === '/api/admin/tunnel' && req.method === 'PUT') {
        { const lk = lockedIn('tunnel', b, ['token', 'secret:cfToken']); if (lk) return send(res, 400, { error: lk }); }
        const c = tunCfg(), nx = { ...c };
        if (typeof b.accountId === 'string') { if (!/^[0-9a-f]{32}$/i.test(b.accountId.trim())) return send(res, 400, { error: 'That account ID doesn’t look right: it is 32 letters and numbers, from the dashboard address after dash.cloudflare.com/.' }); nx.accountId = b.accountId.trim().toLowerCase(); }
        if (typeof b.token === 'string' && b.token.trim().length < 30) return send(res, 400, { error: 'That API token looks too short. Copy the whole token from Cloudflare.' });
        if (typeof b.appUrl === 'string') {
          let x = b.appUrl.trim().replace(/\/+$/, ''); if (x && !/^https?:\/\//i.test(x)) x = 'https://' + x;
          if (x && !/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(x)) return send(res, 400, { error: 'Use a full address on a domain in your Cloudflare account, like https://garage.example.com (https, no path).' });
          nx.appUrl = x.toLowerCase();
        }
        if (typeof b.allow === 'string') nx.allow = b.allow.split(/[\s,]+/).filter(Boolean).join('\n').slice(0, 5000);
        if (typeof b.enabled === 'boolean') nx.enabled = b.enabled;
        const tok = typeof b.token === 'string' ? b.token.trim() : b.token === null ? '' : db.read('secret:cfToken', '');
        if (b.token === null) { nx.enabled = false; nx.appliedAt = null; nx.error = null; }
        if (nx.enabled && !(nx.accountId && tok)) return send(res, 400, { error: 'Save your Cloudflare account ID and API token first.' });
        db.write({ tunnel: nx, 'secret:cfToken': tok, ...(b.token === null ? { 'secret:tunnelRun': '' } : {}) });
        // Anything that changes what Cloudflare should hold is applied there straight away.
        const setup = ['accountId', 'token', 'appUrl', 'allow'].some(k => typeof b[k] === 'string') || (nx.enabled && !db.read('secret:tunnelRun', ''));
        const err = setup ? await tunSetup(c.appUrl) : '';
        tunSync();
        if (typeof b.token === 'string') log(me.id, 'connected a Cloudflare account');
        if (b.token === null) log(me.id, 'removed the Cloudflare API token');
        if (typeof b.appUrl === 'string' && nx.appUrl !== c.appUrl) log(me.id, nx.appUrl ? `set the App URL to ${hostOf(nx.appUrl)}` : 'cleared the App URL');
        if (typeof b.allow === 'string' && nx.allow !== c.allow) { const n = nx.allow ? nx.allow.split('\n').length : 0; log(me.id, n ? `set ${n} allowed user${n === 1 ? '' : 's'} on the App URL` : 'made the App URL public'); }
        if (typeof b.enabled === 'boolean' && b.enabled !== c.enabled) log(me.id, `${b.enabled ? 'started' : 'stopped'} the Cloudflare tunnel`);
        return err ? send(res, 400, { error: err }) : send(res, 200, {});
      }
      return send(res, 404, { error: 'Not found' });
    }

    if (path === '/api/ai' && req.method === 'POST') {
      const me = userOf(req);
      if (!me) return send(res, 401, { error: 'Sign in first.' });
      const c = aiCfg(), b = await body(req), prompt = String(b.prompt || '');
      if (!c.enabled) return send(res, 400, { error: 'AI help is off. An admin can turn it on in Admin settings → AI help.' });
      if (!prompt.trim() || prompt.length > 40000) return send(res, 400, { error: 'Ask something a bit shorter.' });
      try { return send(res, 200, { text: await askAI(c, db.read('secret:aiKey', ''), prompt) }); }
      catch (e) { return send(res, 502, { error: e.message }); }
    }

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
      const b = await body(req), users = db.read('users', []);
      if (auth().signins) return send(res, 403, { error: 'Ask an admin to add you.' });
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

  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
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

  // Reminder digests and alerts: checked a minute after start, then every 15 minutes.
  const mailer = createMailer({
    read: db.read, write: db.write, garage: state, smtp: smtpCfg, users: () => db.read('users', []), log: m => console.warn('Garage email:', m),
    send: mailSend || ((to, subject, text) => { const c = smtpCfg(); return sendMail({ ...c, pass: db.read('secret:smtpPass', '') }, { fromName: c.fromName, from: c.fromAddr, replyTo: c.replyTo, to, subject, text }); }),
  });
  if (mail) { setTimeout(() => mailer.tick().catch(e => console.error(e)), 60_000).unref(); setInterval(() => mailer.tick().catch(e => console.error(e)), 15 * 60_000).unref(); }
  // Docker: the CLOUDFLARE_* variables set up and run the tunnel on every start; TUNNEL_TOKEN runs a hand-made one.
  // On start the environment wins over what's saved.
  const prevUrl = tunCfg().appUrl;
  for (const [doc, v] of Object.entries(envSet)) {
    if (doc.startsWith('secret:')) db.write({ [doc]: v });
    else if (doc !== 'settings' || db.read('settings', null)) db.write({ [doc]: { ...(doc === 'settings' ? db.read('settings', {}) : db.read(doc, {})), ...v } });
  }
  if (env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID) {
    if (env.TUNNEL_ENABLED === undefined) db.write({ tunnel: { ...tunCfg(), enabled: true } });
    tunSetup(prevUrl).then(err => { if (err) console.error('Cloudflare tunnel setup failed:', err); tunSync(); });
  } else if (env.TUNNEL_TOKEN) tunnel.start(env.TUNNEL_TOKEN.trim());
  else tunSync(); // resume a tunnel that was running before a restart
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
