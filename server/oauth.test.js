import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from './db.js';
import { createApp } from './index.js';
import { allowedBy } from './oauth.js';
import { codeAt } from './totp.js';

test('allowed list: exact emails and @domains, case-insensitive', () => {
  assert.equal(allowedBy('Me@X.com, @family.com', 'me@x.com'), true);
  assert.equal(allowedBy('me@x.com\n@family.com', 'kid@family.com'), true);
  assert.equal(allowedBy('@family.com', 'me@notfamily.com.au'), false);
  assert.equal(allowedBy('', 'me@x.com'), false);
});

test('OAuth2 sign-in: discovery, PKCE, verified email, allow list, two-factor after', async t => {
  // A fake OpenID provider: the code it hands out encodes who signs in.
  const issued = new Map();
  const oauthFetch = async (url, o = {}) => {
    const ok = j => ({ ok: true, status: 200, json: async () => j });
    if (url === 'https://sso.example.com/.well-known/openid-configuration') return ok({ authorization_endpoint: 'https://sso.example.com/auth', token_endpoint: 'https://sso.example.com/token', userinfo_endpoint: 'https://sso.example.com/userinfo' });
    if (url === 'https://sso.example.com/token') {
      const p = new URLSearchParams(o.body), who = issued.get(p.get('code'));
      if (!who || p.get('client_secret') !== 'cs-1' || createHash('sha256').update(p.get('code_verifier')).digest('base64url') !== who.challenge) return { ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) };
      return ok({ access_token: 'AT-' + who.email });
    }
    if (url === 'https://sso.example.com/userinfo') { const e = o.headers.authorization.slice(10); return ok({ email: e, email_verified: !e.startsWith('unverified'), name: 'Fam ' + e.split('@')[0] }); }
    throw new Error('unexpected ' + url);
  };
  const dir = mkdtempSync(join(tmpdir(), 'garage-')), db = openDb(dir), app = createApp(db, dir, { oauthFetch, mail: false });
  await new Promise(r => app.listen(0, r));
  t.after(() => { app.close(); db.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.address().port}`;
  const call = async (method, path, body, cookie) => { const r = await fetch(base + path, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => ({})), cookie: r.headers.get('set-cookie')?.split(';')[0], location: r.headers.get('location') }; };
  const signIn = async email => {
    const s = await call('GET', '/api/oauth/start'), u = new URL(s.location);
    assert.equal(u.origin + u.pathname, 'https://sso.example.com/auth');
    assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(u.searchParams.get('redirect_uri'), base + '/api/oauth/callback');
    const code = 'c' + Math.random(); issued.set(code, { email, challenge: u.searchParams.get('code_challenge') });
    return call('GET', `/api/oauth/callback?code=${code}&state=${u.searchParams.get('state')}`);
  };

  await call('PUT', '/api/state', { garage: { users: [{ id: 'u1', name: 'You', role: 'admin' }] } });
  const admin = await call('POST', '/api/login', { userId: 'u1', newPin: '1234' });
  await call('PUT', '/api/admin/auth', { signins: true }, admin.cookie);
  assert.match((await call('PUT', '/api/admin/auth', { google: true }, admin.cookie)).json.error, /client ID, client secret and issuer/);
  assert.equal((await call('PUT', '/api/admin/oauth', { oProvider: 'keycloak', oName: 'Home SSO', issuer: 'https://sso.example.com', clientId: 'garage', secret: 'cs-1', allowed: '@family.com' }, admin.cookie)).status, 200);
  assert.match((await call('PUT', '/api/admin/auth', { google: true }, admin.cookie)).json.error, /Add your own email/);
  assert.equal((await call('PATCH', '/api/admin/users/u1', { email: 'Boss@Example.com' }, admin.cookie)).status, 200);
  assert.equal((await call('PUT', '/api/admin/auth', { google: true }, admin.cookie)).status, 200);
  const st = (await call('GET', '/api/state', null, admin.cookie)).json;
  assert.deepEqual([st.garage.auth.google, st.garage.auth.hasSecret, JSON.stringify(st).includes('cs-1')], [true, true, false]);

  const boss = await signIn('boss@example.com'); // an existing profile, by email
  assert.deepEqual([boss.status, boss.location], [302, '/']);
  assert.equal((await call('GET', '/api/state', null, boss.cookie)).json.me, 'u1');
  const kid = await signIn('kid@family.com'); // allowed by domain: joins as a member
  const ks = (await call('GET', '/api/state', null, kid.cookie)).json, k = ks.garage.users.find(u => u.id === ks.me);
  assert.deepEqual([k.email, k.role, k.name], ['kid@family.com', 'member', 'Fam kid']);
  assert.match((await signIn('stranger@else.com')).location, /^\/\?oauth=.*isn%E2%80%99t%20allowed/);
  assert.match((await signIn('unverified@family.com')).location, /isn%E2%80%99t%20verified/);
  assert.match((await call('GET', '/api/oauth/callback?code=x&state=forged')).location, /took%20too%20long/);
  assert.equal((await call('POST', '/api/login', { userId: k.id, pin: '0000' })).status, 403);
  await call('PUT', '/api/admin/oauth', { allowed: '' }, admin.cookie); // own provider, blank list: anyone it lets in
  assert.equal((await signIn('neighbour@else.com')).location, '/');
  await call('PUT', '/api/admin/oauth', { oProvider: 'google', issuer: 'https://sso.example.com' }, admin.cookie); // Google: the list is required
  assert.match((await signIn('anyone@gmail.com')).location, /isn%E2%80%99t%20allowed/);
  await call('PUT', '/api/admin/oauth', { oProvider: 'keycloak', allowed: '@family.com' }, admin.cookie); // members use OAuth2 while it's on
  // With an authenticator app, OAuth2 lands on the second step instead of signing straight in.
  const s1 = (await call('POST', '/api/totp/start', {}, kid.cookie)).json;
  await call('POST', '/api/totp/verify', { code: codeAt(s1.secret, Date.now() / 1000) }, kid.cookie);
  const again = await signIn('kid@family.com');
  assert.match(again.location, /^\/\?tfa=[0-9a-f]+&name=Fam%20kid&totp=1&passkey=0$/);
  assert.equal(again.cookie, undefined);
  const ticket = new URL(base + again.location).searchParams.get('tfa');
  assert.equal((await call('POST', '/api/login/totp', { ticket, code: codeAt(s1.secret, Date.now() / 1000) })).status, 200);
});
