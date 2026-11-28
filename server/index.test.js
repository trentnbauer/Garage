import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from './db.js';
import { createApp } from './index.js';
import { codeAt } from './totp.js';

test('sign-in, saving and PIN rules', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'garage-')), db = openDb(dir), started = [], fakeRun = { start: t => started.push(t), stop: () => started.push('stop'), state: () => ({ status: started.at(-1) === 'RUNTOK' ? 'connected' : 'stopped', since: null, error: null, logs: ['INF hi'] }) };
  // Cloudflare answers every call; the token call returns the run token.
  const cfFetch = async url => ({ status: 200, json: async () => ({ success: true, result: url.endsWith('/token') ? 'RUNTOK' : url.includes('/zones?') ? [{ id: 'z' }] : url.endsWith('cfd_tunnel?name=Garage&is_deleted=false') ? [{ id: 't' }] : /\/(access\/policies|access\/apps|dns_records\?)/.test(url) && !/POST/.test(url) ? [] : { id: 'p' } }) });
  const app = createApp(db, dir, { tunnel: fakeRun, cfFetch });
  await new Promise(r => app.listen(0, r));
  t.after(() => { app.close(); db.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://localhost:${app.address().port}`;
  const call = async (method, path, body, cookie) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: await r.json(), cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
  };

  assert.equal((await call('GET', '/api/state')).json.empty, true);
  const first = { users: [{ id: 'u1', name: 'You', color: '#5b84ff', role: 'admin', pin: '1234' }], vehicles: [{ id: 'v1' }], settings: {} };
  assert.equal((await call('PUT', '/api/state', { garage: first })).status, 200);
  // A second "first run" is just an unauthenticated save now.
  assert.equal((await call('PUT', '/api/state', { garage: first, version: 1 })).status, 401);

  // The admin has no PIN yet, so they must create one.
  assert.equal((await call('POST', '/api/login', { userId: 'u1' })).status, 400);
  const login = await call('POST', '/api/login', { userId: 'u1', newPin: '4321' });
  assert.equal(login.status, 200);
  const st = await call('GET', '/api/state', null, login.cookie);
  assert.equal(st.json.me, 'u1');
  assert.equal(st.json.garage.users[0].hasPin, true);
  assert.equal(JSON.stringify(st.json).includes('4321'), false);
  assert.equal(st.json.garage.users[0].pin, undefined);

  // Saves need the current version and can't touch users or auth.
  const save = await call('PUT', '/api/state', { version: st.json.version, garage: { vehicles: [{ id: 'v2' }], users: [{ id: 'u1', role: 'admin' }, { id: 'x', role: 'admin' }], auth: { signins: true } } }, login.cookie);
  assert.equal(save.status, 200);
  assert.equal((await call('PUT', '/api/state', { version: st.json.version, garage: {} }, login.cookie)).status, 409);
  const after = (await call('GET', '/api/state', null, login.cookie)).json.garage;
  assert.deepEqual(after.vehicles, [{ id: 'v2' }]);
  assert.equal(after.users.length, 1);
  assert.equal(after.auth.signins, false);

  // Members added later are members; five wrong PINs lock the profile.
  const add = await call('POST', '/api/users', { name: 'Alex', color: '#3fcf8e', pin: '5555' });
  assert.equal(add.status, 200);
  const alexId = add.json.me;
  assert.equal((await call('GET', '/api/state')).json.garage.users.find(u => u.id === alexId).role, 'member');
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/login', { userId: 'u1', pin: '0000' })).status, 401);
  assert.equal((await call('POST', '/api/login', { userId: 'u1', pin: '4321' })).status, 429);

  // Files: need a session; HTML is never served as a page; images are.
  const up = (body, type, name, cookie) => fetch(base + '/api/files', { method: 'POST', headers: { 'content-type': type, 'x-file-name': encodeURIComponent(name), ...(cookie ? { cookie } : {}) }, body });
  assert.equal((await up('x', 'text/plain', 'a.txt')).status, 401);
  const html = await (await up('<script>alert(1)</script>', 'text/html', 'evil.html', login.cookie)).json();
  assert.equal(html.size, 25);
  assert.equal((await fetch(base + html.src)).status, 401);
  const got = await fetch(base + html.src, { headers: { cookie: login.cookie } });
  assert.equal(got.headers.get('content-type'), 'application/octet-stream');
  assert.match(got.headers.get('content-disposition'), /^attachment/);
  assert.equal(await got.text(), '<script>alert(1)</script>');
  const img = await (await up(new Uint8Array([0xff, 0xd8, 0xff]), 'image/jpeg', 'car photo.jpg', login.cookie)).json();
  const gi = await fetch(base + img.src, { headers: { cookie: login.cookie } });
  assert.equal(gi.headers.get('content-type'), 'image/jpeg');
  assert.match(gi.headers.get('content-disposition'), /^inline; filename\*=UTF-8''car%20photo\.jpg/);
  assert.equal((await up(new Uint8Array(101 * 1024 * 1024), 'image/jpeg', 'big.jpg', login.cookie).catch(() => ({ status: 413 }))).status, 413);

  // Admin routes are admins only; the last admin can't be demoted; sign-ins need your own PIN first.
  const alex = await call('POST', '/api/login', { userId: alexId, pin: '5555' });
  assert.equal((await call('PUT', '/api/admin/auth', { signins: true }, alex.cookie)).status, 403);
  const admin = await call('POST', '/api/users', { name: 'Sam', color: '#3fcf8e' }); // a member with no PIN
  assert.equal(admin.status, 200);
  const u1 = login.cookie; // u1's session from earlier still works
  assert.equal((await call('PATCH', '/api/admin/users/u1', { role: 'member' }, u1)).status, 400);
  assert.equal((await call('PATCH', `/api/admin/users/${alexId}`, { role: 'admin' }, u1)).status, 200);
  assert.equal((await call('PATCH', '/api/admin/users/u1', { removed: true }, u1)).status, 400);

  // TOTP: set up, then sign-in needs the code after the PIN, or the code alone.
  const start = await call('POST', '/api/totp/start', {}, u1);
  assert.equal((await call('POST', '/api/totp/verify', { code: '000000' }, u1)).status, 400);
  assert.equal((await call('POST', '/api/totp/verify', { code: codeAt(start.json.secret, Date.now() / 1000) }, u1)).status, 200);
  const st2 = (await call('GET', '/api/state', null, u1)).json;
  assert.equal(st2.garage.users.find(x => x.id === 'u1').hasTotp, true);
  assert.equal(JSON.stringify(st2).includes(start.json.secret), false);
  const alexAdmin = await call('POST', '/api/login', { userId: alexId, pin: '5555' }); // no app, so straight in
  assert.ok(alexAdmin.cookie);
  // u1 is locked after the bad PINs above, so the sign-in flow is checked with Sam.
  const sam = await call('POST', '/api/login', { userId: admin.json.me });
  assert.equal(sam.status, 200);
  const samStart = await call('POST', '/api/totp/start', {}, sam.cookie);
  await call('POST', '/api/totp/verify', { code: codeAt(samStart.json.secret, Date.now() / 1000) }, sam.cookie);
  await call('POST', '/api/pin', { pin: '2468' }, sam.cookie);
  const s1 = await call('POST', '/api/login', { userId: admin.json.me, pin: '2468' });
  assert.equal(s1.json.tfa, true);
  assert.equal(s1.cookie, '');
  assert.equal((await call('POST', '/api/login/totp', { ticket: s1.json.ticket, code: '000000' })).status, 401);
  const s2 = await call('POST', '/api/login/totp', { ticket: s1.json.ticket, code: codeAt(samStart.json.secret, Date.now() / 1000) });
  assert.equal(s2.status, 200);
  assert.ok(s2.cookie.startsWith('garage_session='));
  const s3 = await call('POST', '/api/login', { userId: admin.json.me, code: codeAt(samStart.json.secret, Date.now() / 1000) });
  assert.equal(s3.status, 200);
  // Requiring two-factor stops people turning their app off.
  assert.equal((await call('PUT', '/api/admin/auth', { tfaRequire: 'all' }, alexAdmin.cookie)).status, 200);
  assert.equal((await call('DELETE', '/api/totp', null, sam.cookie)).status, 400);
  // Sign-ins on needs the admin's own PIN, which Alex has.
  assert.equal((await call('PUT', '/api/admin/auth', { signins: true }, alexAdmin.cookie)).status, 200);
  assert.equal((await call('POST', '/api/users', { name: 'Late', color: '#3fcf8e' })).status, 403);

  // AI and SMTP: admins only, secrets never sent back, AI off by default.
  assert.equal((await call('PUT', '/api/admin/ai', { enabled: true }, sam.cookie)).status, 403);
  assert.equal((await call('POST', '/api/ai', { prompt: 'hi' }, sam.cookie)).status, 400);
  assert.equal((await call('PUT', '/api/admin/ai', { enabled: true, provider: 'anthropic', apiKey: 'sk-secret-123' }, alexAdmin.cookie)).status, 200);
  assert.equal((await call('PUT', '/api/admin/smtp', { host: 'smtp.x.com', pass: 'smtp-secret-456', port: 'not a number' }, alexAdmin.cookie)).status, 200);
  const st3 = (await call('GET', '/api/state', null, sam.cookie)).json;
  assert.equal(st3.garage.ai.hasKey, true);
  assert.equal(st3.garage.smtp.hasPass, true);
  assert.equal(st3.garage.smtp.port, 587); // wrong type ignored
  assert.equal(JSON.stringify(st3).includes('sk-secret-123') || JSON.stringify(st3).includes('smtp-secret-456'), false);
  assert.equal((await call('POST', '/api/ai', { prompt: 'x'.repeat(40001) }, sam.cookie)).status, 400);

  // Cloudflare tunnel: admins only, checks input, keeps the token out of state, starts and stops cloudflared.
  const T = '/api/admin/tunnel';
  assert.equal((await call('PUT', T, { enabled: true }, sam.cookie)).status, 403);
  assert.equal((await call('PUT', T, { enabled: true }, alexAdmin.cookie)).status, 400);
  assert.match((await call('PUT', T, { accountId: 'nope' }, alexAdmin.cookie)).json.error, /account ID/);
  assert.match((await call('PUT', T, { appUrl: 'https://x.com/path' }, alexAdmin.cookie)).json.error, /no path/);
  assert.equal((await call('PUT', T, { accountId: 'A'.repeat(32), token: 'cf-secret-token-0123456789-abcdefgh', appUrl: 'garage.example.com' }, alexAdmin.cookie)).status, 200);
  assert.equal((await call('PUT', T, { enabled: true }, alexAdmin.cookie)).status, 200);
  assert.deepEqual(started.filter(x => x !== 'stop'), ['RUNTOK']);
  const st4 = (await call('GET', '/api/state', null, alexAdmin.cookie)).json;
  assert.deepEqual([st4.garage.tunnel.appUrl, st4.garage.tunnel.hasToken, st4.garage.tunnel.status, !!st4.garage.tunnel.appliedAt], ['https://garage.example.com', true, 'connected', true]);
  assert.equal(/cf-secret-token|RUNTOK/.test(JSON.stringify(st4)), false);
  assert.deepEqual((await call('GET', T, null, alexAdmin.cookie)).json.logs, ['INF hi']);
  assert.equal((await call('PUT', T, { token: null }, alexAdmin.cookie)).status, 200);
  assert.equal(started.at(-1), 'stop');
  assert.equal((await call('GET', '/api/state', null, alexAdmin.cookie)).json.garage.tunnel.enabled, false);
});

test('Docker variables set up and run the tunnel on start', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'garage-')), db = openDb(dir), started = [];
  const fakeRun = { start: t => started.push(t), stop: () => {}, state: () => ({ status: 'stopped', logs: [] }) };
  const cfFetch = async url => ({ status: 200, json: async () => ({ success: true, result: url.endsWith('/token') ? 'RUNTOK' : url.includes('/zones?') ? [{ id: 'z' }] : /\?|\/access\/(apps|policies)$/.test(url) ? [] : { id: 'x' } }) });
  createApp(db, dir, { tunnel: fakeRun, cfFetch, env: { CLOUDFLARE_API_TOKEN: 't'.repeat(40), CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32), APP_HOSTNAME: 'garage.example.com', ACCESS_EMAILS: 'a@x.com,b@x.com' } });
  for (let i = 0; i < 50 && !started.length; i++) await new Promise(ok => setTimeout(ok, 10));
  assert.deepEqual(started, ['RUNTOK']);
  assert.deepEqual([db.read('tunnel').appUrl, db.read('tunnel').allow], ['https://garage.example.com', 'a@x.com\nb@x.com']);
  createApp(db, dir, { tunnel: fakeRun, env: { TUNNEL_TOKEN: 'HAND' } });
  assert.equal(started.at(-1), 'HAND');
  db.close(); rmSync(dir, { recursive: true, force: true });
});

test('the environment wins on start, locks its fields, and exports back', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'garage-')), db = openDb(dir), fakePass = 'fixture' + process.pid; // made up per run, not a credential
  const app = createApp(db, dir, { tunnel: { start() {}, stop() {}, state: () => ({ status: 'stopped', logs: [] }) }, env: { AI_ENABLED: 'true', AI_MODEL: 'm1', SMTP_PASSWORD: fakePass, GARAGE_UNITS: 'mi' } });
  await new Promise(r => app.listen(0, r));
  const base = `http://127.0.0.1:${app.address().port}`;
  const call = async (method, path, body, cookie) => { const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] }; };
  await call('PUT', '/api/state', { garage: { users: [{ id: 'u1', name: 'You', role: 'admin' }], settings: { units: 'km', currency: '$' } } });
  const me = await call('POST', '/api/login', { userId: 'u1', newPin: '1234' });
  const st = (await call('GET', '/api/state', null, me.cookie)).json;
  assert.deepEqual([st.garage.ai.enabled, st.garage.ai.model, st.garage.smtp.hasPass, st.garage.settings.units], [true, 'm1', true, 'mi']);
  assert.deepEqual(st.garage.envLocked, ['GARAGE_UNITS', 'AI_ENABLED', 'AI_MODEL', 'SMTP_PASSWORD']);
  assert.match((await call('PUT', '/api/admin/ai', { model: 'other' }, me.cookie)).json.error, /AI_MODEL is set in .env/);
  assert.match((await call('PUT', '/api/admin/smtp', { pass: null }, me.cookie)).json.error, /SMTP_PASSWORD/);
  assert.equal((await call('PUT', '/api/admin/ai', { provider: 'ollama' }, me.cookie)).status, 200); // not locked
  await call('PUT', '/api/state', { version: st.version, garage: { settings: { ...st.garage.settings, units: 'km' } } }, me.cookie);
  assert.equal((await call('GET', '/api/state', null, me.cookie)).json.garage.settings.units, 'mi');
  const ex = (await call('GET', '/api/admin/env', null, me.cookie)).json;
  assert.match(ex.text, /^AI_PROVIDER=ollama$/m); assert.match(ex.text, /^SMTP_PASSWORD=change-me-smtp-password$/m);
  assert.equal((await call('GET', '/api/admin/env?secrets=1', null, me.cookie)).json.text.includes(`\nSMTP_PASSWORD=${fakePass}\n`), true);
  app.close(); db.close(); rmSync(dir, { recursive: true, force: true });
});
