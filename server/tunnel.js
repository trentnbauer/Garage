// Cloudflare tunnel: Garage makes the tunnel, its route, the DNS record and the Access application through
// the Cloudflare API, then runs cloudflared with the tunnel's token.
import { spawn } from 'node:child_process';

const API = 'https://api.cloudflare.com/client/v4';
export const NAME = 'Garage', MARK = 'Managed by Garage';
export const hostOf = url => String(url || '').replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();

/** A Cloudflare API caller that throws errors fit to show the user. */
export function cf(token, doFetch = fetch) {
  return async (method, path, body) => {
    let r, j;
    try {
      r = await doFetch(API + path, { method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      j = await r.json();
    } catch { throw new Error('Couldn’t reach the Cloudflare API. Check this server’s internet connection.'); }
    if (!j?.success) {
      const m = j?.errors?.[0]?.message || `HTTP ${r.status}`;
      throw new Error(r.status === 401 || r.status === 403 ? `Cloudflare refused the API token (${m}). Check the account ID and the token’s permissions.` : `Cloudflare said: ${m}`);
    }
    return j.result;
  };
}

/** The Access policy for the allow list: emails and @domains, or bypass for everyone when it's blank. */
export function accessPolicy(allow) {
  const list = String(allow || '').split(/[\s,]+/).filter(Boolean);
  return {
    name: `${NAME} — allowed users`, decision: list.length ? 'allow' : 'bypass',
    include: list.length ? list.map(x => (x.startsWith('@') ? { email_domain: { domain: x.slice(1) } } : { email: { email: x } })) : [{ everyone: {} }],
  };
}

async function zoneFor(api, host) {
  const labels = host.split('.');
  for (let i = 0; i < labels.length - 1; i++) {
    const z = (await api('GET', `/zones?name=${encodeURIComponent(labels.slice(i).join('.'))}`))[0];
    if (z) return z;
  }
  throw new Error(`No domain for ${host} on this Cloudflare account. Add the domain to Cloudflare, or check the token’s zone access.`);
}

/** Make or update everything for cfg. Returns the tunnel id, the token cloudflared runs with, and what changed. */
export async function applyTunnel({ accountId, appUrl, prevUrl, allow, service }, token, doFetch) {
  const api = cf(token, doFetch), a = `/accounts/${accountId}`, log = [];
  const host = hostOf(appUrl), prev = hostOf(prevUrl);
  let t = (await api('GET', `${a}/cfd_tunnel?name=${NAME}&is_deleted=false`))[0];
  if (t) log.push(`Found tunnel "${NAME}"`);
  else { t = await api('POST', `${a}/cfd_tunnel`, { name: NAME, config_src: 'cloudflare' }); log.push(`No tunnel named "${NAME}" — created it`); }
  await api('PUT', `${a}/cfd_tunnel/${t.id}/configurations`, { config: { ingress: [...(host ? [{ hostname: host, service }] : []), { service: 'http_status:404' }] } });
  if (host) log.push(`Route ${host} -> ${service}`);

  if (prev && prev !== host) { // only records Garage made are removed
    const z = await zoneFor(api, prev).catch(() => null);
    for (const r of z ? await api('GET', `/zones/${z.id}/dns_records?name=${encodeURIComponent(prev)}`) : []) {
      if (r.comment === MARK) { await api('DELETE', `/zones/${z.id}/dns_records/${r.id}`); log.push(`DNS: removed CNAME ${prev} (made by Garage)`); }
    }
  }
  if (host) {
    const z = await zoneFor(api, host), content = `${t.id}.cfargotunnel.com`;
    const recs = await api('GET', `/zones/${z.id}/dns_records?name=${encodeURIComponent(host)}`);
    const ours = recs.find(r => r.type === 'CNAME' && (r.comment === MARK || /\.cfargotunnel\.com$/.test(r.content)));
    if (!ours && recs.length) throw new Error(`${host} already has a DNS record Garage didn’t make. Remove it in Cloudflare, or pick another App URL.`);
    const rec = { type: 'CNAME', name: host, content, proxied: true, comment: MARK };
    await api(ours ? 'PUT' : 'POST', `/zones/${z.id}/dns_records${ours ? '/' + ours.id : ''}`, rec);
    log.push(`DNS: proxied CNAME ${host} -> ${content}`);

    // A reusable policy, referenced by id from the application.
    const pol = accessPolicy(allow), old = (await api('GET', `${a}/access/policies`)).find(x => x.name === pol.name);
    const saved = await api(old ? 'PUT' : 'POST', `${a}/access/policies${old ? '/' + old.id : ''}`, pol);
    const apps = await api('GET', `${a}/access/apps`), app = apps.find(x => x.domain === host) || apps.find(x => x.name === NAME);
    await api(app ? 'PUT' : 'POST', `${a}/access/apps${app ? '/' + app.id : ''}`, { name: NAME, domain: host, type: 'self_hosted', session_duration: '24h', policies: [{ id: saved.id, precedence: 1 }] });
    log.push(`Access application "${NAME}" ${app ? 'updated' : 'created'}: ${pol.decision === 'allow' ? `allow (${pol.include.length} ${pol.include.length === 1 ? 'entry' : 'entries'})` : 'bypass (everyone)'}`);
  }
  const runToken = await api('GET', `${a}/cfd_tunnel/${t.id}/token`);
  return { id: t.id, runToken, log };
}

/** Runs cloudflared and keeps its status and last 200 log lines. Restarts it if it dies while it should run. */
export function runner(bin = process.env.CLOUDFLARED || 'cloudflared', { restartMs = 10_000 } = {}) {
  let proc = null, want = null, timer = null;
  const st = { status: 'stopped', since: null, error: null, logs: [] };
  const add = l => { st.logs.push(new Date().toISOString().slice(0, 19).replace('T', ' ') + ' ' + l); if (st.logs.length > 200) st.logs.shift(); };
  const start = token => {
    clearTimeout(timer);
    if (proc && want === token) return;
    if (proc) { const p = proc; proc = null; p.kill('SIGTERM'); }
    want = token; Object.assign(st, { status: 'starting', since: null, error: null });
    const me = proc = spawn(bin, ['tunnel', '--no-autoupdate', 'run'], { env: { ...process.env, TUNNEL_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    const onData = d => {
      buf += d; const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines) {
        const line = l.replace(/^\S+Z\s+/, '').trim(); if (!line) continue; // cloudflared prefixes its own timestamp
        add(line);
        if (proc === me && /Registered tunnel connection/.test(line) && st.status !== 'connected') Object.assign(st, { status: 'connected', since: new Date().toISOString(), error: null });
      }
    };
    me.stdout.on('data', onData); me.stderr.on('data', onData);
    me.on('error', e => {
      if (proc !== me) return; proc = null; want = null;
      Object.assign(st, { status: 'error', error: e.code === 'ENOENT' ? 'cloudflared isn’t installed on this server. The Docker image includes it; elsewhere, install it or set CLOUDFLARED to its path.' : e.message });
      add('ERR ' + st.error);
    });
    me.on('exit', code => {
      if (proc !== me) return; proc = null;
      Object.assign(st, { status: 'error', error: `cloudflared stopped (exit code ${code}). Trying again shortly. See the tunnel log.` });
      const tok = want; want = null;
      timer = setTimeout(() => { if (st.status === 'error' && tok) start(tok); }, restartMs);
    });
  };
  const stop = () => {
    clearTimeout(timer); want = null;
    if (proc) { const p = proc; proc = null; p.kill('SIGTERM'); add('INF Tunnel stopped'); }
    Object.assign(st, { status: 'stopped', since: null, error: null });
  };
  return { start, stop, state: () => ({ ...st, logs: [...st.logs] }) };
}
