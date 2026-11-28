// Admin settings → Cloudflare tunnel. The server talks to Cloudflare and runs cloudflared; this shows and steers it.
import { type CSSProperties, useEffect, useState } from 'react';
import type { Nav } from '../App.tsx';
import type { Garage, TunCfg } from '../lib/model.ts';
import type { Store } from '../lib/store.ts';
import { card, Head, lab, Locked, mono } from './AdminMail.tsx';
import { Toggle } from './Settings.tsx';

const SL = { stopped: 'Stopped', starting: 'Connecting…', connected: 'Connected', error: 'Problem' }, SC = { stopped: '#8d9099', starting: '#e8b04b', connected: '#3fcf8e', error: '#f2685f' };
export const tunStatus = (g: Garage): [string, string] => { const s = g.tunnel?.status || 'stopped'; return [SL[s], SC[s]]; };
const T0: TunCfg = { enabled: false, accountId: '', appUrl: '', allow: '', appliedAt: null, error: null, hasToken: false, status: 'stopped', since: null, runError: null, service: 'http://localhost:3000' };
const PERMS = [['Account', 'Cloudflare Tunnel', 'Edit', 'always'], ['Zone', 'DNS', 'Edit', 'always'], ['Account', 'Access: Apps and Policies', 'Edit', 'for Cloudflare Access (who can reach the App URL)'], ['Account', 'Access: Organizations, Identity Providers, and Groups', 'Read', 'for Cloudflare Access sign-in (it finds your team domain)']];
const sec: CSSProperties = { border: '1px solid var(--line)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 };
const sub = (t: string) => <span className="label" style={{ marginTop: 6 }}>{t}</span>;
const box: CSSProperties = { border: '1px solid var(--line2)', borderRadius: 8, padding: '4px 10px' };
const tbl: CSSProperties = { border: '1px solid var(--line2)', borderRadius: 10, overflow: 'hidden', maxWidth: 620 };
const th: CSSProperties = { padding: '8px 12px', fontWeight: 600, fontSize: 13, background: 'var(--card)' };
const solid = (on: boolean, h = 40): CSSProperties => ({ height: h, padding: '0 16px', flex: 'none', borderRadius: 999, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', background: on ? 'var(--acc)' : 'var(--card2)', color: on ? 'var(--accfg)' : 'var(--mut)' });
const ftime = (iso: string) => new Date(iso).toLocaleString('en-AU', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function TunnelTab({ store, g, nav }: { store: Store; g: Garage; nav: Nav }) {
  const T = { ...T0, ...g.tunnel };
  const [live, setLive] = useState<{ status: TunCfg['status']; since: string | null; runError: string | null; logs: string[] } | null>(null);
  const [d, setD] = useState({ account: T.accountId, token: '', appUrl: T.appUrl, allow: T.allow });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null), [busy, setBusy] = useState(false);
  const [help, setHelp] = useState<boolean | null>(null), [logs, setLogs] = useState(false);
  // cloudflared's status and log change on their own, so poll while this tab is open.
  useEffect(() => {
    let on = true;
    const tick = () => fetch('/api/admin/tunnel', { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : null)).then(j => { if (on && j) setLive(j); }).catch(() => {});
    tick(); const t = window.setInterval(tick, 3000);
    return () => { on = false; window.clearInterval(t); };
  }, []);
  const st = live?.status || T.status, since = live ? live.since : T.since, runError = live ? live.runError : T.runError;
  const ready = !!T.accountId && T.hasToken, host = T.appUrl.replace(/^https?:\/\//, '');
  const list = T.allow.split(/[\s,]+/).filter(Boolean);
  const put = async (p: Record<string, unknown>, ok: string) => {
    if (busy) return false; setBusy(true); setMsg(null);
    const r = await store.api('PUT', '/api/admin/tunnel', p);
    if (!r.ok) await store.api('GET', '/api/state'); // the settings saved even when Cloudflare refused, so show them
    setBusy(false); setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.json.error || 'Couldn’t save.' });
    return r.ok;
  };
  const save = async () => {
    const acc = d.account.trim(), tok = d.token.trim();
    if (!tok && !T.hasToken) return setMsg({ ok: false, text: 'Paste the API token too.' });
    if (await put({ accountId: acc, ...(tok ? { token: tok } : {}) }, 'Saved. Cloudflare is set up.')) setD(x => ({ ...x, token: '' }));
  };
  const saveUrl = () => put({ appUrl: d.appUrl }, d.appUrl.trim() ? (ready ? `Saved. ${d.appUrl.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')} now points at this Garage.` : 'Saved. Garage adds the route and DNS record once the API token is in.') : 'App URL cleared.');
  const saveAllow = () => { const n = d.allow.split(/[\s,]+/).filter(Boolean).length; return put({ allow: d.allow }, n ? `Saved. Cloudflare Access now only lets these ${n} in.` : 'Saved. The App URL is public — Garage’s sign-in still applies.'); };
  const helpOpen = help ?? !ready;
  const canSave = d.account.trim() !== T.accountId || !!d.token.trim(), urlCh = d.appUrl.trim() !== T.appUrl, allowCh = d.allow.trim() !== T.allow.trim();
  const hint = st === 'connected' ? `Garage can be reached through Cloudflare${since ? ' since ' + ftime(since) : ''}.` : st === 'starting' ? 'cloudflared is connecting to Cloudflare.' : st === 'error' ? runError || 'cloudflared stopped.' : ready ? 'Turn it on to reach Garage from outside your network.' : 'Set up your Cloudflare account below first.';
  const policyText = list.length ? `allow ${list.join(', ')}` : '';

  return (
    <div style={card}>
      <Head title="Cloudflare tunnel" hint="Reach Garage from outside your network with no open ports. Garage makes the tunnel, its routes and the DNS records through the Cloudflare API, and runs the bundled cloudflared with it." st={[SL[st], SC[st]]} max={640} />
      <Locked g={g} re={/^(TUNNEL_ENABLED|CLOUDFLARE_|APP_HOSTNAME|ACCESS_EMAILS)/} />
      {msg && <div role={msg.ok ? 'status' : 'alert'} style={{ padding: '10px 14px', borderRadius: 12, fontSize: 13, background: msg.ok ? 'rgba(63,207,142,.1)' : 'rgba(242,104,95,.1)', color: msg.ok ? 'var(--up)' : 'var(--down)' }}>{msg.text}</div>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
        <div style={{ minWidth: 0 }}><div style={{ fontSize: 14 }}>Run the tunnel</div><div style={{ fontSize: 12, color: 'var(--mut)' }}><b style={{ fontWeight: 600, color: SC[st] }}>{SL[st]}</b> · {hint}</div></div>
        <Toggle on={T.enabled} label="Run the tunnel" onClick={() => (T.enabled ? put({ enabled: false }, 'Tunnel stopped.') : ready ? put({ enabled: true }, 'Starting the tunnel.') : setMsg({ ok: false, text: 'Save your Cloudflare account ID and API token first.' }))} />
      </div>

      {sub('1 · Let Garage use your Cloudflare account')}
      <div style={sec}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: 14 }}>Garage makes the tunnel, its routes and the DNS records itself</div><div style={{ fontSize: 12, color: 'var(--mut)' }}>And keeps them right when an address changes. It needs your account ID and an API token.</div></div>
          <button type="button" className="plain" aria-expanded={helpOpen} onClick={() => setHelp(!helpOpen)} style={{ fontSize: 13, color: 'var(--acc)' }}>{helpOpen ? 'Hide the steps' : 'How to get them ↗'}</button>
        </div>
        {helpOpen && <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, borderRadius: 12, background: 'var(--card2)' }}>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.7, color: 'var(--mut)' }}>
            <li><a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer">Create an API token</a> (Custom token) with the permissions below, then copy it.</li>
            <li>Your <b style={{ color: 'var(--fg)', fontWeight: 500 }}>account ID</b> is on the right of the <a href="https://dash.cloudflare.com/" target="_blank" rel="noreferrer">dashboard</a>’s home page for your domain, and in its address after <span className="mono" style={{ fontSize: 12, color: 'var(--fg)' }}>dash.cloudflare.com/</span>.</li>
          </ol>
          <div style={tbl}><div style={th}>Permissions</div>
            {PERMS.map(([scope, what, level, why]) => <div key={what} style={{ borderTop: '1px solid var(--line2)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '90px minmax(0,1fr) 70px', gap: 8, padding: '8px 12px 4px', fontSize: 13 }}><span style={box}>{scope}</span><span style={box}>{what}</span><span style={box}>{level}</span></div>
              <div style={{ fontSize: 12, color: 'var(--mut)', padding: '0 12px 8px' }}>{why}</div>
            </div>)}
          </div>
          <div style={tbl}><div style={th}>Account Resources</div><div style={{ display: 'grid', gridTemplateColumns: '90px minmax(0,1fr)', gap: 8, padding: '8px 12px', fontSize: 13 }}><span style={box}>Include</span><span style={box}>Just your account</span></div></div>
          <div style={tbl}><div style={th}>Zone Resources</div><div style={{ display: 'grid', gridTemplateColumns: '90px 130px minmax(0,1fr)', gap: 8, padding: '8px 12px', fontSize: 13 }}><span style={box}>Include</span><span style={box}>Specific zone</span><span style={box}>the App URL’s domain</span></div></div>
        </div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 12 }}>
          <label style={lab}><span className="label">Account ID</span><input className="field" autoComplete="off" placeholder="32 letters and numbers" value={d.account} onChange={e => setD({ ...d, account: e.target.value })} style={mono} /><span style={{ fontSize: 12, color: 'var(--mut)' }}>On the right of the Cloudflare dashboard home page, and in its address after dash.cloudflare.com/.</span></label>
          <label style={lab}><span className="label">API token</span><input className="field" type="password" autoComplete="off" placeholder={T.hasToken ? 'Saved. Type to replace' : 'Paste the API token'} value={d.token} onChange={e => setD({ ...d, token: e.target.value })} style={mono} /><span style={{ fontSize: 12, color: 'var(--mut)' }}>Kept on this server only, never shown again, and left out of backups.</span></label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <div style={{ flex: 1, minWidth: 220 }}><div style={{ fontSize: 14 }}>{T.error ? 'Cloudflare is not set up' : T.appliedAt ? 'Cloudflare is set up' : 'Not set up yet'}</div><div style={{ fontSize: 12, color: T.error ? 'var(--down)' : 'var(--mut)' }}>{T.error || (T.appliedAt ? `Matches the addresses below · ${new Date(T.appliedAt).toLocaleString('en-AU')}` : 'Save the account ID and token and Garage sets it up.')}</div></div>
          {T.hasToken && <button type="button" className="plain ghost-del" style={{ fontSize: 13, color: 'var(--mut)' }} onClick={() => nav.ask({ title: 'Remove the API token?', body: 'Garage stops the tunnel and can no longer change its routes or DNS. The tunnel and its records stay in Cloudflare.', label: 'Remove token', fn: () => { put({ token: null }, 'API token removed.'); } })}>Remove the token</button>}
          <button type="button" className="plain" onClick={save} style={solid(canSave, 36)}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      {sub('2 · Addresses')}
      <div style={sec}>
        <div style={lab}><span className="label">App URL</span>
          <div style={{ display: 'flex', gap: 8 }}><input className="field" aria-label="App URL" placeholder="https://garage.example.com" value={d.appUrl} onChange={e => setD({ ...d, appUrl: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') saveUrl(); }} style={{ ...mono, flex: 1 }} /><button type="button" className="plain" onClick={saveUrl} style={solid(urlCh)}>Save</button></div>
          <span style={{ fontSize: 12, color: 'var(--mut)' }}>The address you open Garage at from outside. Garage routes it to this server and keeps a proxied CNAME record for it. Its domain must be on your Cloudflare account.</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: 14 }}>Allowed users</div><div style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 1.5 }}>{list.length ? 'Garage applies this list to the Cloudflare Access policy on the App URL. Only these people can reach it, after a one-time PIN to their email.' : 'Blank, so the Access application is public (bypass): anyone with the link reaches Garage’s own sign-in screen.'}</div></div>
          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap', background: (list.length ? '#3fcf8e' : '#e8b04b') + '22', color: list.length ? '#3fcf8e' : '#e8b04b' }}>{list.length ? `Login required · ${list.length} ${list.length === 1 ? 'entry' : 'entries'}` : 'Public'}</span>
        </div>
        <div style={lab}><span className="label">Emails or domains · leave blank for a public app</span>
          <textarea aria-label="Allowed emails or domains" rows={3} placeholder="One per line: you@example.com, or a whole domain like @family.com. Blank = public." value={d.allow} onChange={e => setD({ ...d, allow: e.target.value })} style={{ width: '100%', minWidth: 0, borderRadius: 10, border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--fg)', padding: '10px 12px', fontSize: 13, resize: 'vertical', fontFamily: 'var(--mono)', lineHeight: 1.6 }} />
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}><button type="button" className="plain" onClick={saveAllow} style={{ ...solid(allowCh, 36), padding: '0 14px' }}>Save the list</button></div>
          <span style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 1.5 }}>Two gates: Cloudflare Access decides who can reach the App URL at all (one-time PIN to their email). Sign-in then decides who gets into Garage. Keep both lists the same unless you want an extra layer.</span>
        </div>
        {!list.length && !g.auth.signins && <div role="status" style={{ padding: '10px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.45, background: 'rgba(232,176,75,.12)', color: 'var(--warn)' }}>Sign-ins are off, so anyone who reaches the App URL could pick or make a profile. Turn on sign-ins in Admin settings → Sign-in, or add allowed users above.</div>}
      </div>

      {sub('3 · What Garage sets up')}
      <div style={{ ...sec, gap: 12 }}>
        {host ? <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span className="mono" style={{ fontSize: 13, userSelect: 'all' }}>{host}</span><span style={{ fontSize: 12, color: 'var(--mut)' }}>{!ready ? 'Not set up yet' : list.length ? `Access: login, ${policyText}` : 'Access: public (bypass), Garage sign-in still applies'} → {T.service.replace(/^https?:\/\//, '')}</span></div>
          : <div><div style={{ fontSize: 14 }}>Nothing yet</div><div style={{ fontSize: 12, color: 'var(--mut)' }}>Enter the App URL to see the address Garage serves.</div></div>}
      </div>

      {sub('Cloudflare Access policies')}
      <div style={{ ...sec, gap: 12 }}>
        {ready && host ? <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><div style={{ fontSize: 14 }}>Garage <span style={{ fontSize: 12, color: 'var(--mut)' }}>· {list.length ? 'login required' : 'public, no login'}</span></div><div style={{ fontSize: 12, color: 'var(--mut)' }}><span className="mono" style={{ userSelect: 'all' }}>{host}</span> · {list.length ? `Policy: ${policyText}` : 'Policy: bypass (everyone). The application stays in Cloudflare, so adding allowed users locks it again.'}</div></div>
          : <div><div style={{ fontSize: 14 }}>No Access applications</div><div style={{ fontSize: 12, color: 'var(--mut)' }}>{!T.hasToken ? 'Garage sets these up once the API token is saved.' : 'Add the App URL above to set them up.'}</div></div>}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <div><div style={{ fontSize: 14 }}>Tunnel log</div><div style={{ fontSize: 12, color: 'var(--mut)' }}>What cloudflared reported, newest last.</div></div>
          <button type="button" className="plain hov" aria-expanded={logs} onClick={() => setLogs(!logs)} style={{ boxSizing: 'content-box', height: 32, padding: '0 14px', borderRadius: 999, border: '1px solid var(--line2)', fontSize: 13, display: 'flex', alignItems: 'center' }}>{logs ? 'Hide' : 'Show'}</button>
        </div>
        {logs && <pre style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.55, background: 'var(--card2)', borderRadius: 10, padding: 12, maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap', color: 'var(--mut)' }}>{live?.logs.length ? live.logs.join('\n') : 'Nothing logged yet.'}</pre>}
      </div>
      <span style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 1.5 }}>Running in Docker? Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, APP_HOSTNAME and ACCESS_EMAILS and Garage does all of this on every start. TUNNEL_TOKEN runs a tunnel you made by hand in the dashboard instead — Garage runs it but can't set its routes or DNS.</span>
    </div>
  );
}
