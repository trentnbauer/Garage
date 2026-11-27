import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { accessPolicy, applyTunnel, runner } from './tunnel.js';

// A fake Cloudflare API: records calls, answers from a small in-memory account.
function fakeCf({ records = [], tunnels = [] } = {}) {
  const calls = [], acct = { tunnels, records, policies: [], apps: [] };
  const ok = result => ({ status: 200, json: async () => ({ success: true, result }) });
  const fetch = async (url, o) => {
    const u = new URL(url), p = u.pathname.replace('/client/v4', ''), m = o.method, body = o.body ? JSON.parse(o.body) : null;
    calls.push(`${m} ${p}${u.search}`);
    if (o.headers.authorization !== 'Bearer tok') return { status: 403, json: async () => ({ success: false, errors: [{ message: 'Authentication error' }] }) };
    if (p.endsWith('/cfd_tunnel') && m === 'GET') return ok(acct.tunnels);
    if (p.endsWith('/cfd_tunnel') && m === 'POST') { const t = { id: 't1', name: body.name }; acct.tunnels.push(t); return ok(t); }
    if (p.endsWith('/configurations')) { acct.config = body.config; return ok({}); }
    if (p === '/zones') return ok(u.searchParams.get('name') === 'example.com' ? [{ id: 'z1' }] : []);
    if (p === '/zones/z1/dns_records' && m === 'GET') return ok(acct.records.filter(r => r.name === u.searchParams.get('name')));
    if (p.startsWith('/zones/z1/dns_records') && m === 'POST') { acct.records.push({ id: 'r' + acct.records.length, ...body }); return ok({}); }
    if (p.startsWith('/zones/z1/dns_records/') && m === 'DELETE') { acct.records = acct.records.filter(r => !p.endsWith(r.id)); return ok({}); }
    if (p.startsWith('/zones/z1/dns_records/') && m === 'PUT') return ok({});
    if (p.endsWith('/access/policies') && m === 'GET') return ok(acct.policies);
    if (p.endsWith('/access/policies') && m === 'POST') { const x = { id: 'p1', ...body }; acct.policies.push(x); return ok(x); }
    if (p.includes('/access/policies/') && m === 'PUT') { Object.assign(acct.policies[0], body); return ok(acct.policies[0]); }
    if (p.endsWith('/access/apps') && m === 'GET') return ok(acct.apps);
    if (p.endsWith('/access/apps') && m === 'POST') { acct.apps.push({ id: 'a1', ...body }); return ok({}); }
    if (p.includes('/access/apps/') && m === 'PUT') { Object.assign(acct.apps[0], body); return ok({}); }
    if (p.endsWith('/token')) return ok('RUN-TOKEN');
    throw new Error('unexpected ' + m + ' ' + p);
  };
  return { fetch, calls, acct };
}
const cfg = { accountId: 'a'.repeat(32), appUrl: 'https://garage.example.com', allow: 'me@x.com\n@family.com', service: 'http://localhost:3000' };

test('setup makes the tunnel, route, DNS and Access, then moves them when the App URL changes', async () => {
  const cf = fakeCf();
  const r = await applyTunnel(cfg, 'tok', cf.fetch);
  assert.equal(r.runToken, 'RUN-TOKEN');
  assert.deepEqual(cf.acct.config.ingress, [{ hostname: 'garage.example.com', service: 'http://localhost:3000' }, { service: 'http_status:404' }]);
  assert.deepEqual(cf.acct.records.map(x => [x.name, x.content, x.proxied]), [['garage.example.com', 't1.cfargotunnel.com', true]]);
  assert.deepEqual(cf.acct.policies[0].include, [{ email: { email: 'me@x.com' } }, { email_domain: { domain: 'family.com' } }]);
  assert.deepEqual(cf.acct.apps[0].policies, [{ id: 'p1', precedence: 1 }]);
  // Second run: same tunnel, old record removed, new one made, app and policy updated in place, now public.
  const r2 = await applyTunnel({ ...cfg, appUrl: 'https://car.example.com', prevUrl: cfg.appUrl, allow: '' }, 'tok', cf.fetch);
  assert.match(r2.log[0], /Found tunnel/);
  assert.deepEqual(cf.acct.records.map(x => x.name), ['car.example.com']);
  assert.equal(cf.acct.tunnels.length, 1);
  assert.equal(cf.acct.apps.length, 1); assert.equal(cf.acct.apps[0].domain, 'car.example.com');
  assert.deepEqual([cf.acct.policies[0].decision, cf.acct.policies[0].include], ['bypass', [{ everyone: {} }]]);
});

test('setup refuses to overwrite a DNS record it did not make, and explains a bad token', async () => {
  const cf = fakeCf({ records: [{ id: 'x', name: 'garage.example.com', type: 'A', content: '1.2.3.4' }] });
  await assert.rejects(applyTunnel(cfg, 'tok', cf.fetch), /already has a DNS record/);
  await assert.rejects(applyTunnel(cfg, 'bad', fakeCf().fetch), /refused the API token/);
  await assert.rejects(applyTunnel({ ...cfg, appUrl: 'https://x.other.org' }, 'tok', fakeCf().fetch), /No domain for x.other.org/);
  assert.deepEqual(accessPolicy(' , ').decision, 'bypass');
});

test('runner: connected on the first registered connection, stops cleanly, explains a missing binary', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cfd-')), bin = join(dir, 'cloudflared');
  writeFileSync(bin, '#!/bin/sh\n[ "$TUNNEL_TOKEN" = RUN ] || exit 3\necho "2026-11-27T10:00:00Z INF Registered tunnel connection connIndex=0" >&2\nsleep 30\n'); chmodSync(bin, 0o755);
  const r = runner(bin);
  r.start('RUN');
  for (let i = 0; i < 50 && r.state().status !== 'connected'; i++) await new Promise(ok => setTimeout(ok, 20));
  assert.equal(r.state().status, 'connected');
  assert.match(r.state().logs[0], / INF Registered tunnel connection/);
  r.stop(); assert.equal(r.state().status, 'stopped');
  const bad = runner(bin, { restartMs: 60_000 }); bad.start('WRONG');
  for (let i = 0; i < 50 && bad.state().status !== 'error'; i++) await new Promise(ok => setTimeout(ok, 20));
  assert.match(bad.state().error, /exit code 3/); bad.stop();
  const none = runner(join(dir, 'nope')); none.start('RUN');
  for (let i = 0; i < 50 && none.state().status !== 'error'; i++) await new Promise(ok => setTimeout(ok, 20));
  assert.match(none.state().error, /isn’t installed/);
});
