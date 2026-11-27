import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from './db.js';
import { createApp } from './index.js';

test('sign-in, saving and PIN rules', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'garage-')), db = openDb(dir), app = createApp(db, dir);
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
  assert.equal((await up(new Uint8Array(26 * 1024 * 1024), 'image/jpeg', 'big.jpg', login.cookie).catch(() => ({ status: 413 }))).status, 413);
});
