// Migrate from another app: LubeLogger, from its mounted Docker volume or over its API. The server reads the
// source and stores attachments; the mapping and the review happen here, as in the design.
import { type CSSProperties, type FormEvent, useEffect, useMemo, useState } from 'react';
import { fmtSize } from '../lib/files.ts';
import { applyPlan, type Dump, lubePlan, planTotal, srcSetOf } from '../lib/lube.ts';
import type { Calc, Units, User } from '../lib/model.ts';
import { DEMO, type Store } from '../lib/store.ts';
import { Icon } from './icons.tsx';

type Scan = { token: string; dump: Dump; files: Record<string, number>; label: string; noFiles: boolean; apiReminders: boolean };
const post = async (path: string, body: unknown) => {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : { error: 'Can’t reach the Garage server.' };
  if (!r?.ok) throw new Error(j.error || 'That didn’t work.');
  return j;
};
const seg: CSSProperties = { flex: 'none', display: 'flex', gap: 4, padding: 4, background: 'var(--card2)', borderRadius: 12, alignSelf: 'flex-start', maxWidth: '100%', overflowX: 'auto' };
const segB = (on: boolean, inner?: boolean): CSSProperties => ({ flex: 'none', whiteSpace: 'nowrap', padding: '6px 14px', borderRadius: 9, fontSize: 13, background: on ? (inner ? 'var(--card)' : 'var(--acc)') : 'transparent', color: on ? (inner ? 'var(--fg)' : 'var(--accfg)') : 'var(--mut)' });
const lab: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const sel: CSSProperties = { height: 34, width: 'auto', fontSize: 13, padding: '0 8px' };
const GAP: Record<string, [string, string]> = {
  hours: ['vehicle tracks engine hours. Garage has no hours mode, so they come in as the odometer.', 'vehicles track engine hours. Garage has no hours mode, so they come in as the odometer.'],
  thresholds: ['reminder has its own warning thresholds. Garage uses your global “due soon” setting instead.', 'reminders have their own warning thresholds. Garage uses your global “due soon” setting instead.'],
  testing: ['plan is in LubeLogger’s Testing column. It goes to In progress with a note.', 'plans are in LubeLogger’s Testing column. They go to In progress with a note.'],
  remlink: ['plan is linked to a reminder. The link is kept as a note on the task.', 'plans are linked to reminders. The links are kept as notes on the tasks.'],
  shelfcost: ['shop supply has a cost. The Shelf doesn’t track cost, so it’s dropped.', 'shop supplies have a cost. The Shelf doesn’t track cost, so it’s dropped.'],
  apirem: ['reminder comes from the API, which doesn’t say how it repeats. It comes in as a one-off; set the repeat in Garage.', 'reminders come from the API, which doesn’t say how they repeat. They come in as one-offs; set the repeat in Garage.'],
  nofiles: ['attachment needs a username and password to download (API keys can’t fetch files). Its name is kept, without the file.', 'attachments need a username and password to download (API keys can’t fetch files). Their names are kept, without the files.'],
};
const DL: Record<string, string> = { vehicles: 'vehicle', servicerecords: 'service entry', collisionrecords: 'repair', upgraderecords: 'modification', gasrecords: 'fill-up', taxrecords: 'tax entry', odometerrecords: 'odometer reading', reminderrecords: 'reminder', planrecords: 'task', supplyrecords: 'supply', notes: 'note', parts: 'part' };

export function Migrate({ calc, store, me, onClose }: { calc: Calc; store: Store; me: User; onClose: () => void }) {
  const g = calc.g;
  const [src, setSrc] = useState<'lubelogger' | 'tracktor'>('lubelogger'), [mode, setMode] = useState<'volume' | 'api'>('volume');
  const [path, setPath] = useState('/import/lubelogger'), [api, setApi] = useState({ url: '', how: 'key' as 'key' | 'pw', key: '', user: '', pass: '' });
  const [scan, setScan] = useState<Scan | null>(null), [unitsIn, setUnitsIn] = useState<Units>(calc.u), [targets, setTargets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(''), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  const plan = useMemo(() => (scan ? lubePlan(scan.dump, { files: scan.files, srcSet: srcSetOf(g), vehicles: g.vehicles, targets, unitsIn, unitsOut: calc.u, me: me.id, noFiles: scan.noFiles, apiReminders: scan.apiReminders }) : null), [scan, g, targets, unitsIn, calc.u, me.id]);
  const total = plan ? planTotal(plan) : 0;

  const doScan = async (e: FormEvent) => {
    e.preventDefault(); if (busy) return;
    setMsg(null); setScan(null); setTargets({});
    setBusy(mode === 'volume' ? `Scanning ${path.trim()}…` : 'Asking LubeLogger…');
    try {
      const body = mode === 'volume' ? { mode, path } : { mode, url: api.url, ...(api.how === 'pw' ? { user: api.user, pass: api.pass } : { key: api.key }) };
      const s: Scan = await post('/api/admin/import/scan', body);
      setScan(s); if (s.dump.config?.UseMPG === true) setUnitsIn('mi');
    } catch (err) { setMsg({ ok: false, text: (err as Error).message }); }
    setBusy('');
  };
  const run = async () => {
    if (!plan || !total || !scan || busy) return;
    setBusy('Importing…'); setMsg(null);
    try {
      const names = [...new Set([...plan.allFiles.filter(f => !f._missing).map(f => f._z), ...plan.vehicles.map(v => v._photo || '').filter(Boolean)])];
      const stored = names.length ? await post('/api/admin/import/files', { token: scan.token, names }) : {};
      const nNew = plan.vehicles.length;
      store.update(g2 => applyPlan(g2, plan, stored, me.id));
      setScan(null);
      setMsg({ ok: true, text: `Imported ${total} item${total === 1 ? '' : 's'}${nNew ? `, including ${nNew} new car${nNew > 1 ? 's' : ''}` : ''}. Run it again any time — only new items come across.` });
    } catch (err) { setMsg({ ok: false, text: (err as Error).message }); }
    setBusy('');
  };

  const lines: [string, string, boolean?][] = [];
  if (plan) {
    const cnt = (t: string) => plan.records.filter(r => r.type === t).length;
    if (plan.vehicles.length) lines.push(['New vehicles', String(plan.vehicles.length)]);
    const merged = plan.carInfo.filter(c => c.target !== 'new').length; if (merged) lines.push(['Merged into existing cars', String(merged)]);
    ([['Service', 'Service entries'], ['Repair', 'Repair entries'], ['Upgrade', 'Update / Modification entries'], ['Registration', 'Registration entries'], ['Insurance', 'Insurance entries'], ['Fuel', 'Fill-ups']] as const).forEach(([t, k]) => { const n = cnt(t); if (n) lines.push([k, String(n)]); });
    const ol = Object.values(plan.odo).reduce((a, x) => a + x.log.length, 0);
    ([[plan.reminders.length, 'Reminders'], [plan.cards.length, 'Board tasks'], [plan.parts.length, 'Parts'], [plan.shelf.length, 'Shelf items'], [Object.keys(plan.notes).length, 'Cars with notes'], [ol, 'Odometer readings']] as const).forEach(([n, k]) => { if (n) lines.push([k, String(n)]); });
    const ok = plan.allFiles.filter(f => !f._missing), size = ok.reduce((a, f) => a + (f.size || 0), 0), miss = plan.allFiles.length - ok.length;
    if (plan.allFiles.length) lines.push(['Attachments', ok.length + (size ? ' · ' + fmtSize(size) : '') + (miss ? ` (${miss} missing)` : ''), !!miss]);
  }
  const gaps = plan ? Object.entries(plan.gaps).map(([k, n]) => [n, GAP[k]?.[n === 1 ? 0 : 1] || k] as const) : [];
  const miss = plan && !scan?.noFiles ? plan.allFiles.filter(f => f._missing).length : 0;
  const dupN = plan ? Object.values(plan.dup).reduce((a, n) => a + n, 0) : 0;
  const isAdmin = me.role === 'admin';

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label="Migrate from another app" onClick={e => e.stopPropagation()} style={{ width: 'min(720px,100%)', maxHeight: '90vh', overflow: 'auto', background: 'var(--card)', border: '1px solid var(--line2)', borderRadius: 22, padding: 22, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 24px 60px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div><div style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 24 }}>Migrate from another app</div><div style={{ fontSize: 13, color: 'var(--mut)' }}>Bring your history across. Imported data is added alongside what's already here.</div></div>
          <button type="button" className="plain icon-btn" onClick={onClose} title="Close" aria-label="Close"><Icon n="x" /></button>
        </div>
        <div role="tablist" style={seg}>{([['lubelogger', 'LubeLogger'], ['tracktor', 'Tracktor']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={src === k} type="button" className="plain" onClick={() => { setSrc(k); setScan(null); setMsg(null); }} style={segB(src === k)}>{l}</button>)}</div>

        {src === 'tracktor' ? <div style={{ fontSize: 13, color: 'var(--mut)', lineHeight: 1.5 }}>Tracktor import is coming in a later update. LubeLogger works now.</div>
          : !isAdmin ? <div style={{ fontSize: 13, color: 'var(--mut)', lineHeight: 1.5 }}>Only admins can import, because it reads from the server. Ask an admin to run it.</div>
          : DEMO ? <div style={{ fontSize: 13, color: 'var(--mut)', lineHeight: 1.5 }}>The demo can’t reach a LubeLogger. On your own Garage server, import from its Docker volume or its API.</div>
          : <>
            <div role="tablist" style={seg}>{([['volume', 'Docker volume'], ['api', 'LubeLogger API']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={mode === k} type="button" className="plain" onClick={() => { setMode(k); setScan(null); setMsg(null); }} style={segB(mode === k, true)}>{l}</button>)}</div>
            <div style={{ fontSize: 13, color: 'var(--mut)', lineHeight: 1.5 }}>{mode === 'volume' ? 'Mount LubeLogger’s data folder into the Garage container (read-only), then scan it. Garage reads the database, attachments and vehicle photos straight from it, and shows you what it found before anything is imported.' : 'Garage asks a running LubeLogger for everything over its API. An API key brings in the records; sign in with a username and password to bring attachments and vehicle photos across too.'}</div>
            {mode === 'volume' ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="label">Add to Garage's docker-compose.yml</span>
              <pre style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.6, background: 'var(--card2)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', overflow: 'auto', whiteSpace: 'pre', color: 'var(--fg)' }}>{`services:\n  garage:\n    volumes:\n      - /path/to/lubelogger/data:${path.trim() || '/import/lubelogger'}:ro`}</pre>
              <form onSubmit={doScan} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label style={{ ...lab, flex: 1, minWidth: 220 }}><span className="label">Path inside the Garage container</span><input className="field" value={path} onChange={e => setPath(e.target.value)} placeholder="/import/lubelogger" style={{ fontFamily: 'var(--mono)', fontSize: 13 }} /></label>
                <button type="submit" className="btn-p" style={{ height: 40, padding: '0 18px' }}>{busy ? 'Scanning…' : 'Scan'}</button>
              </form>
            </div> : <form onSubmit={doScan} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={lab}><span className="label">LubeLogger address</span><input className="field" value={api.url} onChange={e => setApi({ ...api, url: e.target.value })} placeholder="http://lubelogger:8080" autoComplete="off" style={{ fontFamily: 'var(--mono)', fontSize: 13 }} /></label>
              <div role="radiogroup" aria-label="Sign in with" style={{ ...seg, marginTop: 2 }}>{([['key', 'API key'], ['pw', 'Username & password']] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={api.how === k} className="plain" onClick={() => setApi({ ...api, how: k })} style={segB(api.how === k, true)}>{l}</button>)}</div>
              {api.how === 'key' ? <label style={lab}><span className="label">API key</span><input className="field" type="password" autoComplete="off" value={api.key} onChange={e => setApi({ ...api, key: e.target.value })} placeholder="From LubeLogger → Settings → API keys" style={{ fontFamily: 'var(--mono)', fontSize: 13 }} /></label>
                : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))', gap: 12 }}>
                  <label style={lab}><span className="label">Username</span><input className="field" autoComplete="off" value={api.user} onChange={e => setApi({ ...api, user: e.target.value })} /></label>
                  <label style={lab}><span className="label">Password</span><input className="field" type="password" autoComplete="off" value={api.pass} onChange={e => setApi({ ...api, pass: e.target.value })} /></label>
                </div>}
              <span style={{ fontSize: 12, color: 'var(--mut)' }}>Used for this import only and not saved. From inside Docker, use LubeLogger’s service name as the address.</span>
              <button type="submit" className="btn-p" style={{ height: 40, padding: '0 18px', alignSelf: 'flex-start' }}>{busy ? 'Connecting…' : 'Connect'}</button>
            </form>}
          </>}
        {busy && <span role="status" style={{ fontSize: 13, color: 'var(--mut)' }}>{busy}</span>}

        {plan && <div style={{ background: 'var(--card2)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}><span style={{ fontWeight: 600, fontSize: 15 }}>Review before importing</span><span style={{ fontSize: 12, color: 'var(--mut)' }}>{scan!.label}</span></div>
          {plan.carInfo.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="label">Vehicles</span>
            {plan.carInfo.map(c => <div key={c.lid} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ flex: 1, minWidth: 180 }}><div style={{ fontSize: 14 }}>{c.name}</div><div style={{ fontSize: 12, color: 'var(--mut)' }}>{c.why}</div></div>
              <select className="field" aria-label={'Where ' + c.name + ' goes'} value={c.target} onChange={e => setTargets({ ...targets, [c.lid]: e.target.value })} style={sel}>
                <option value="new">Add as a new car</option>{g.vehicles.map(v => <option key={v.id} value={v.id}>Merge into {v.nickname || `${v.year} ${v.make} ${v.model}`}</option>)}
              </select>
            </div>)}
          </div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="label">Will be imported</span>
            {lines.map(([k, v, warn]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, padding: '3px 0' }}><span>{k}</span><span className="mono" style={{ color: warn ? '#e8b04b' : 'var(--fg)' }}>{v}</span></div>)}
            {!lines.length && <span style={{ fontSize: 13, color: 'var(--mut)' }}>Nothing new.</span>}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 13, flexWrap: 'wrap' }}><span>LubeLogger distances are in</span><select className="field" value={unitsIn} onChange={e => setUnitsIn(e.target.value as Units)} style={sel}><option value="km">Kilometres</option><option value="mi">Miles</option></select></label>
          {(gaps.length > 0 || miss > 0) && <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12, borderRadius: 12, background: 'rgba(232,176,75,.1)' }}>
            <span className="label" style={{ color: '#e8b04b' }}>Brought across differently</span>
            {gaps.map(([n, t]) => <div key={t} style={{ fontSize: 13, lineHeight: 1.45 }}><b>{n}</b> {t}</div>)}
            {miss > 0 && <div style={{ fontSize: 13, lineHeight: 1.45 }}><b>{miss}</b> {miss === 1 ? 'attachment isn’t in LubeLogger’s files. Its name is kept, without the file.' : 'attachments aren’t in LubeLogger’s files. Their names are kept, without the files.'}</div>}
          </div>}
          <div style={{ fontSize: 13, color: 'var(--mut)', lineHeight: 1.45 }}>{dupN ? `Already imported, so skipped: ${Object.entries(plan.dup).map(([k, n]) => `${n} ${DL[k] || k}${n === 1 ? '' : /entry$/.test(DL[k] || '') ? '' : 's'}`).join(', ')}. Running this again only brings in what’s new.` : 'Nothing here has been imported before. Each item remembers where it came from, so running this again won’t make duplicates.'}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn-p" disabled={!total} onClick={run} style={{ opacity: total ? 1 : 0.45 }}>{busy === 'Importing…' ? 'Importing…' : total ? `Import ${total} item${total === 1 ? '' : 's'}` : 'Nothing new to import'}</button>
            <button type="button" className="btn" onClick={() => setScan(null)} style={{ padding: '0 16px' }}>Cancel</button>
          </div>
        </div>}
        {msg && <span role={msg.ok ? 'status' : 'alert'} style={{ fontSize: 13, color: msg.ok ? 'var(--up)' : 'var(--down)' }}>{msg.text}</span>}
      </div>
    </div>
  );
}
