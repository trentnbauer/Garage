// Admin settings → AI help and Email (SMTP). Fields save when you leave them; secrets have their own Save.
import { type CSSProperties, useState } from 'react';
import type { Nav } from '../App.tsx';
import { AI0, AI_PROV } from '../lib/ai.ts';
import type { AiCfg, Garage, SmtpCfg, User } from '../lib/model.ts';
import type { Store } from '../lib/store.ts';
import { Icon } from '../ui/icons.tsx';
import { Seg, Toggle } from './Settings.tsx';

export const SMTP0: SmtpCfg = { enabled: false, host: '', port: 587, security: 'starttls', user: '', fromName: 'Garage', fromAddr: '', replyTo: '', to: '', digest: 'weekly', overdue: true, blockers: true, summary: false, signin: true, hasPass: false };
const SMTP_PRE: [string, string, number, SmtpCfg['security'], string][] = [
  ['Gmail', 'smtp.gmail.com', 587, 'starttls', 'Gmail needs an App Password: Google Account → Security → 2-Step Verification → App passwords. Username is your full Gmail address.'],
  ['Microsoft 365', 'smtp.office365.com', 587, 'starttls', 'Use your full email address as the username. SMTP AUTH has to be allowed for the mailbox in the Microsoft 365 admin centre.'],
  ['iCloud', 'smtp.mail.me.com', 587, 'starttls', 'Needs an app-specific password from appleid.apple.com. Username is your iCloud email.'],
  ['Fastmail', 'smtp.fastmail.com', 465, 'ssl', 'Create an app password with SMTP access under Settings → Privacy & Security.'],
  ['SendGrid', 'smtp.sendgrid.net', 587, 'starttls', 'The username is literally “apikey” and the password is your SendGrid API key. The From address must be a verified sender.'],
  ['Mailgun', 'smtp.mailgun.org', 587, 'starttls', 'Use the SMTP login and password from your Mailgun domain settings.'],
];

/** Badge for the Admin side menu and each card's header: [text, colour]. */
export const aiStatus = (g: Garage): [string, string] => { const a = { ...AI0, ...g.ai }; return !a.enabled ? ['Off', '#8d9099'] : AI_PROV[a.provider]?.key && !a.hasKey ? ['Needs API key', '#e8b04b'] : ['Ready', '#3fcf8e']; };
export const smtpStatus = (g: Garage): [string, string] => { const s = { ...SMTP0, ...g.smtp }; return !s.enabled ? ['Off', '#8d9099'] : s.host && s.port && s.fromAddr && (!s.user || s.hasPass) ? ['Ready', '#3fcf8e'] : ['Needs setup', '#e8b04b']; };

export const card: CSSProperties = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 20, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 };
export const lab: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
export const mono: CSSProperties = { fontFamily: 'var(--mono)', fontSize: 13 };
const pill = (on: boolean): CSSProperties => ({ boxSizing: 'content-box', border: `1px solid ${on ? 'var(--acc)' : 'var(--line2)'}`, background: on ? 'var(--accs)' : 'transparent', color: on ? 'var(--fg)' : 'var(--mut)' });
const solid = (on: boolean): CSSProperties => ({ height: 40, padding: '0 16px', flex: 'none', borderRadius: 999, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', background: on ? 'var(--acc)' : 'var(--card2)', color: on ? 'var(--accfg)' : 'var(--mut)' });
const outline: CSSProperties = { boxSizing: 'content-box', height: 40, padding: '0 16px', borderRadius: 999, border: '1px solid var(--line2)', fontSize: 13, display: 'flex', alignItems: 'center' };
export const Head = ({ title, hint, st, max }: { title: string; hint: string; st: [string, string]; max?: number }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
    <div><div className="card-t">{title}</div><div style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 1.45, maxWidth: max }}>{hint}</div></div>
    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap', background: st[1] + '22', color: st[1] }}>{st[0]}</span>
  </div>
);
/** Says which of a card's settings come from the server's .env, where they have to be changed. */
export const Locked = ({ g, re }: { g: Garage; re: RegExp }) => {
  const vars = (g.envLocked || []).filter(v => re.test(v));
  return vars.length ? <div role="note" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 14px', borderRadius: 12, fontSize: 12, lineHeight: 1.45, background: 'rgba(232,176,75,.12)', color: 'var(--warn)' }}><Icon n="lock" s={14} style={{ flex: 'none', marginTop: 1 }} /><span>Set in .env, so only changeable there: <span className="mono">{vars.join(', ')}</span></span></div> : null;
};
export const Line = ({ label, hint, on, flip }: { label: string; hint: string; on: boolean; flip: () => void }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
    <div style={{ minWidth: 0 }}><div style={{ fontSize: 14 }}>{label}</div><div style={{ fontSize: 12, color: 'var(--mut)' }}>{hint}</div></div><Toggle on={on} label={label} onClick={flip} />
  </div>
);
/** A text field that saves when you leave it. Re-keyed on the saved value so a reload shows the server's copy. */
const Field = ({ value, onSave, style, ...p }: { value: string; onSave: (v: string) => void; style?: CSSProperties; placeholder?: string; type?: string; 'aria-label'?: string }) => (
  <input key={value} className="field" autoComplete="off" defaultValue={value} style={style} {...p} onBlur={e => { if (e.target.value !== value) onSave(e.target.value); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
);
/** A write-only secret: type, Save, and it's never shown again. */
function Secret({ label, saved, ph, keep, onSave, onRemove }: { label: string; saved: boolean; ph: string; keep: string; onSave: (v: string) => Promise<boolean>; onRemove: () => void }) {
  const [d, setD] = useState('');
  const save = async () => { if (d.trim() && (await onSave(d))) setD(''); };
  return (
    <div style={lab}>
      <span className="label">{label}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="password" aria-label={label} className="field" autoComplete="off" placeholder={saved ? 'Saved. Type to replace' : ph} value={d} onChange={e => setD(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); }} style={{ ...mono, flex: 1 }} />
        <button type="button" className="plain" onClick={save} style={solid(!!d.trim())}>Save</button>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><span style={{ fontSize: 12, color: 'var(--mut)', flex: 1 }}>{keep}</span>{saved && <button type="button" className="plain ghost-del" style={{ fontSize: 12, color: 'var(--mut)' }} onClick={onRemove}>{label === 'API key' ? 'Remove key' : 'Remove'}</button>}</div>
    </div>
  );
}
type Res = { ok: boolean; text: string } | null;
const Msg = ({ r }: { r: Res }) => (r ? <span role={r.ok ? 'status' : 'alert'} style={{ fontSize: 12, color: r.ok ? 'var(--up)' : 'var(--down)' }}>{r.text}</span> : null);

export function AiTab({ store, g, nav }: { store: Store; g: Garage; nav: Nav }) {
  const a = { ...AI0, ...g.ai }, pv = AI_PROV[a.provider];
  const [res, setRes] = useState<Res>(null), [busy, setBusy] = useState(false);
  const put = async (p: Partial<AiCfg> & { apiKey?: string | null }) => { setRes(null); const r = await store.api('PUT', '/api/admin/ai', p); if (!r.ok) setRes({ ok: false, text: r.json.error || 'Couldn’t save.' }); return r.ok; };
  const test = async () => {
    if (busy) return; setBusy(true); setRes(null);
    const r = await store.api('POST', '/api/admin/ai/test');
    setBusy(false); setRes(r.ok ? { ok: true, text: `Connected · replied “${String(r.json.text || '').trim().slice(0, 40)}”` } : { ok: false, text: r.json.error || 'Couldn’t reach the AI provider.' });
  };
  const share: [keyof AiCfg, string, boolean?][] = [['shareManual', g.vehicles.some(v => (v.manuals || []).length) ? 'Workshop manual' : 'Workshop manual · none uploaded', !g.vehicles.some(v => (v.manuals || []).length)], ['shareSpecs', 'Car specs'], ['shareHistory', 'Service history'], ['shareNotes', 'Owner notes']];
  return (
    <div style={card}>
      <Head title="AI help" hint="Powers the AI button on build board cards: troubleshooting, parts lists, step-by-step guides." st={aiStatus(g)} />
      <Locked g={g} re={/^AI_/} />
      <Line label="Turn on AI help" hint="Shows an AI button on every task card, for everyone in the garage" on={a.enabled} flip={() => put({ enabled: !a.enabled })} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,340px),1fr))', gap: '16px 24px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={lab}><span className="label">Provider</span>
            <select className="field" style={{ padding: '0 10px' }} value={a.provider} onChange={e => put({ provider: e.target.value as AiCfg['provider'], model: '', baseUrl: '' })}>{Object.entries(AI_PROV).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}</select>
            <span style={{ fontSize: 12, color: 'var(--mut)' }}>{pv.hint}</span></label>
          {pv.key && <Secret label="API key" saved={a.hasKey} ph="Paste the API key" keep="Kept on this server only, never shown again, and left out of backups." onSave={v => put({ apiKey: v.trim() })}
            onRemove={() => nav.ask({ title: 'Remove the API key?', body: 'AI help stops working until you add a key again.', label: 'Remove key', fn: () => { put({ apiKey: null }); } })} />}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
            <label style={lab}><span className="label">Model</span><Field value={a.model} placeholder={'Default: ' + pv.model} style={mono} onSave={v => put({ model: v.trim() })} /></label>
            {pv.base && <label style={lab}><span className="label">Base URL</span><Field value={a.baseUrl} placeholder={pv.basePh} style={mono} onSave={v => put({ baseUrl: v.trim() })} /></label>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="label">What the AI sees</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {share.map(([k, l, dis]) => { const on = !!a[k] && !dis; return <button key={k} type="button" className="plain" aria-pressed={on} disabled={dis} onClick={() => put({ [k]: !a[k] })} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 999, fontSize: 13, ...pill(on), cursor: dis ? 'default' : 'pointer' }}>{on && <Icon n="check" s={14} w={2.4} />}{l}</button>; })}
            </div>
            <span style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 1.45 }}>The task, its updates, linked parts and the car's make, model and odometer are always sent. Nothing else leaves Garage.</span>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}><button type="button" className="plain hov" onClick={test} style={{ ...outline, height: 36 }}>{busy ? 'Testing…' : 'Test connection'}</button><Msg r={res} /></div>
        </div>
      </div>
    </div>
  );
}

export function EmailTab({ store, g, me, nav }: { store: Store; g: Garage; me: User; nav: Nav }) {
  const s = { ...SMTP0, ...g.smtp }, pre = SMTP_PRE.find(p => p[1] === s.host);
  const [res, setRes] = useState<Res>(null), [busy, setBusy] = useState(false), [to, setTo] = useState(me.email || '');
  const put = async (p: Partial<SmtpCfg> & { pass?: string | null }) => { setRes(null); const r = await store.api('PUT', '/api/admin/smtp', p); if (!r.ok) setRes({ ok: false, text: r.json.error || 'Couldn’t save.' }); return r.ok; };
  const isAddr = (x: string) => /^\S+@\S+\.\S+$/.test(x);
  const test = async () => {
    if (busy) return;
    const fail = (text: string) => setRes({ ok: false, text }), t = to.trim();
    if (!s.host) return fail('Add the SMTP host first.');
    if (!s.port) return fail('Add the port — usually 587 for STARTTLS or 465 for SSL/TLS.');
    if (!isAddr(s.fromAddr)) return fail('Add a From address.');
    if (s.user && !s.hasPass) return fail('Save the password for ' + s.user + ' first.');
    if (!isAddr(t)) return fail('Enter an address to send the test to.');
    setBusy(true); setRes(null);
    const r = await store.api('POST', '/api/admin/smtp/test', { to: t });
    setBusy(false);
    setRes(r.ok ? { ok: true, text: `Connected to ${s.host}:${s.port} (${{ starttls: 'STARTTLS', ssl: 'SSL/TLS', none: 'no encryption' }[s.security]}) and sent a test email to ${t}.` } : { ok: false, text: r.json.error || 'Couldn’t send the test email.' });
  };
  const sub = (t: string) => <span className="label" style={{ marginTop: 4 }}>{t}</span>;
  const notif: [keyof SmtpCfg, string, string][] = [['overdue', 'Overdue alerts', 'As soon as a reminder goes overdue'], ['blockers', 'New blockers', 'When a task limits how a car can be driven'], ['summary', 'Monthly report', 'Last month’s spend and work done, to admins'], ['signin', 'Sign-in alerts', 'When someone signs in from a new device']];
  return (
    <div style={{ ...card, gap: 16 }}>
      <Head title="Email (SMTP)" hint="How Garage sends reminder digests, alerts and paperwork packs." st={smtpStatus(g)} />
      <Locked g={g} re={/^(SMTP|EMAIL)_/} />
      <Line label="Send email" hint="Nothing is sent while this is off" on={s.enabled} flip={() => put({ enabled: !s.enabled })} />
      {sub('Server')}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{SMTP_PRE.map(p => <button key={p[0]} type="button" className="plain" aria-pressed={pre === p} onClick={() => put({ host: p[1], port: p[2], security: p[3] })} style={{ height: 30, padding: '0 12px', borderRadius: 999, fontSize: 12, display: 'flex', alignItems: 'center', ...pill(pre === p) }}>{p[0]}</button>)}</div>
        <span style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 1.45 }}>{pre ? pre[4] : 'Pick a provider to fill in the server, or enter any SMTP server — your ISP, a relay on your network, or a transactional email service.'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,.8fr) minmax(0,1.2fr)', gap: 12 }}>
        <label style={lab}><span className="label">Host</span><Field value={s.host} placeholder="smtp.example.com" style={mono} onSave={v => put({ host: v.trim() })} /></label>
        <label style={lab}><span className="label">Port</span><Field type="number" value={String(s.port || '')} placeholder="587" style={mono} onSave={v => put({ port: +v || 0 })} /></label>
        <label style={lab}><span className="label">Security</span><select className="field" style={{ padding: '0 10px' }} value={s.security} onChange={e => { const x = e.target.value as SmtpCfg['security']; put({ security: x, port: x === 'ssl' ? 465 : x === 'starttls' && s.port === 465 ? 587 : s.port }); }}><option value="starttls">STARTTLS</option><option value="ssl">SSL / TLS</option><option value="none">None</option></select></label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))', gap: 12 }}>
        <label style={lab}><span className="label">Username</span><Field value={s.user} placeholder="Often your full email address" style={mono} onSave={v => put({ user: v.trim() })} /></label>
        <Secret label="Password" saved={s.hasPass} ph="App password or SMTP password" keep="Kept on this server only, never shown again." onSave={v => put({ pass: v })}
          onRemove={() => nav.ask({ title: 'Remove the SMTP password?', body: 'Garage can’t send email until you add it again.', label: 'Remove password', fn: () => { put({ pass: null }); } })} />
      </div>
      {sub('Sender')}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,200px),1fr))', gap: 12 }}>
        <label style={lab}><span className="label">From name</span><Field value={s.fromName} placeholder="Garage" onSave={v => put({ fromName: v })} /></label>
        <label style={lab}><span className="label">From address</span><Field type="email" value={s.fromAddr} placeholder="garage@example.com" onSave={v => put({ fromAddr: v.trim() })} /></label>
        <label style={lab}><span className="label">Reply-to</span><Field type="email" value={s.replyTo} placeholder="Optional" onSave={v => put({ replyTo: v.trim() })} /></label>
      </div>
      {sub('What gets emailed')}
      <div style={{ display: 'flex', flexDirection: 'column', opacity: s.enabled ? 1 : 0.45, pointerEvents: s.enabled ? 'auto' : 'none' }} aria-disabled={!s.enabled}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 14 }}>Reminder digest</div><div style={{ fontSize: 12, color: 'var(--mut)' }}>Overdue and due-soon reminders across every car</div></div>
          <Seg value={s.digest} opts={[['off', 'Off'], ['daily', 'Daily'], ['weekly', 'Weekly']]} onPick={v => put({ digest: v })} />
        </div>
        {notif.map(([k, l, h]) => <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 14 }}>{l}</div><div style={{ fontSize: 12, color: 'var(--mut)' }}>{h}</div></div><Toggle on={!!s[k] && s.enabled} label={l} onClick={() => put({ [k]: !s[k] })} />
        </div>)}
      </div>
      <label style={lab}><span className="label">Send to</span><Field value={s.to} placeholder="you@example.com, partner@example.com" onSave={v => put({ to: v })} /><span style={{ fontSize: 12, color: 'var(--mut)' }}>Comma separated. Leave blank to use each admin's email.</span></label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', paddingTop: 14, borderTop: '1px solid var(--line)' }}>
        <input type="email" aria-label="Send a test to" className="field" placeholder="Send a test to…" value={to} onChange={e => setTo(e.target.value)} style={{ flex: 1, minWidth: 200, width: 'auto' }} />
        <button type="button" className="plain hov" onClick={test} style={outline}>{busy ? 'Sending…' : 'Send test email'}</button>
      </div>
      <Msg r={res} />
    </div>
  );
}
