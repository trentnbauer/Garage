import { type FormEvent, type ReactNode, useState } from 'react';
import type { Nav } from '../App.tsx';
import type { Calc, User } from '../lib/model.ts';
import type { Store } from '../lib/store.ts';
import { EnvTab } from './AdminEnv.tsx';
import { AiTab, aiStatus, EmailTab, Locked, smtpStatus } from './AdminMail.tsx';
import { TunnelTab, tunStatus } from './AdminTunnel.tsx';
import { Back, Seg, Toggle } from './Settings.tsx';

type TabKey = 'access' | 'people' | 'ai' | 'email' | 'tunnel' | 'log' | 'env';
const card = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 20, padding: 20, display: 'flex', flexDirection: 'column' as const, gap: 14 };
const Row = ({ label, hint, children }: { label: string; hint: string; children: ReactNode }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', paddingTop: 14, borderTop: '1px solid var(--line)' }}>
    <div style={{ minWidth: 0, flex: '1 1 260px' }}><div style={{ fontSize: 14 }}>{label}</div><div style={{ fontSize: 12, color: 'var(--mut)' }}>{hint}</div></div>{children}
  </div>
);
const ago = (iso: string) => { const m = Math.round((Date.now() - +new Date(iso)) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + 'm ago'; const h = Math.round(m / 60); if (h < 24) return h + 'h ago'; const d = Math.round(h / 24); return d < 30 ? d + 'd ago' : new Date(iso).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' }); };

export function Admin({ store, me, calc, nav, narrow }: { store: Store; me: User; calc: Calc; nav: Nav; narrow: boolean }) {
  const g = calc.g, a = g.auth, users = g.users.filter(u => !u.removed), admins = users.filter(u => u.role === 'admin');
  const [tab, setTab] = useState<TabKey>('access');
  const [msg, setMsg] = useState(''), [pMsg, setPMsg] = useState('');
  const [inv, setInv] = useState({ name: '', role: 'member' }), [invMsg, setInvMsg] = useState('');
  const [all, setAll] = useState(false);
  const setAuth = async (p: Record<string, unknown>) => { const r = await store.api('PUT', '/api/admin/auth', p); setMsg(r.ok ? '' : r.json.error || ''); };
  const patch = async (id: string, p: Record<string, unknown>) => { const r = await store.api('PATCH', `/api/admin/users/${id}`, p); setPMsg(r.ok ? '' : r.json.error || ''); };
  const invite = async (e: FormEvent) => { e.preventDefault(); if (!inv.name.trim()) return; const r = await store.api('POST', '/api/admin/users', inv); if (r.ok) { setInv({ name: '', role: 'member' }); setInvMsg(`${inv.name.trim()} can now pick their profile on the sign-in screen and create a PIN.`); } else setInvMsg(r.json.error || ''); };
  const totpOn = a.tfaTotp !== false, req = a.tfaRequire || 'off';
  const badge = (t: string, c: string) => ({ t, bg: c + '22', fg: c });
  const tabs: [TabKey, string, { t: string; bg: string; fg: string } | null][] = [
    ['access', 'Sign-in', null], ['people', 'People & roles', badge(String(users.length), '#8d9099')], ['ai', 'AI help', badge(...aiStatus(g))], ['email', 'Email (SMTP)', badge(...smtpStatus(g))],
    ['tunnel', 'Cloudflare tunnel', badge(...tunStatus(g))], ['log', 'Activity log', null], ['env', 'Export .env', null]];
  const log = (g.log || []).filter(l => !/^(signed in|signed out)$/.test(l.text)), shown = all ? log.slice(0, 100) : log.slice(0, 12);
  const who = (id: string | null) => g.users.find(u => u.id === id) || { name: 'Someone', color: '#8d9099' };
  const carName = (id: string | null) => { const v = g.vehicles.find(x => x.id === id); return v ? v.nickname || v.model : ''; };

  return (
    <div className="frame">
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: narrow ? '20px 16px 120px' : '32px 32px 64px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <Back nav={nav} />
          <span style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 32 }}>Admin settings</span>
          <span className="mono" style={{ marginLeft: 'auto', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mut)' }}>Admins only · changes save as you go, secrets have their own Save</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : '200px minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
          <nav aria-label="Admin sections" className="noscroll" style={{ position: 'sticky', top: 16, zIndex: 5, display: 'flex', flexDirection: narrow ? 'row' : 'column', gap: 2, overflowX: 'auto', background: 'var(--bg)' }}>
            {tabs.map(([k, label, b]) => (
              <button key={k} className="plain hov" aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, fontSize: 14, background: tab === k ? 'var(--accs)' : 'transparent', color: tab === k ? 'var(--fg)' : 'var(--mut)', whiteSpace: 'nowrap' }}>
                <span style={{ flex: 1, minWidth: 0 }}>{label}</span>{b && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap', background: b.bg, color: b.fg }}>{b.t}</span>}
              </button>
            ))}
          </nav>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            {tab === 'access' && <>
              <div style={card}>
                <div><div className="card-t">Sign-in methods</div><div style={{ fontSize: 12, color: 'var(--mut)' }}>How people get into the garage.</div></div>
                <Locked g={g} re={/^AUTH_/} />
                <Row label="Sign-ins enabled" hint={a.signins ? 'Everyone must sign in with a PIN or an authenticator code.' : 'Off: anyone at the sign-in screen can pick or make a profile. Admins still need a PIN. Home network only.'}><Toggle on={a.signins} label="Sign-ins enabled" onClick={() => setAuth({ signins: !a.signins })} /></Row>
                {a.signins && <Row label="Profiles & PINs" hint="Pick a profile, then enter its PIN or an authenticator code. Profiles without a PIN create one at first sign-in."><Toggle on label="Profiles & PINs" onClick={() => {}} /></Row>}
                {msg && <span role="alert" style={{ fontSize: 12, color: 'var(--down)' }}>{msg}</span>}
              </div>
              <div style={card}>
                <div><div className="card-t">Two-factor</div><div style={{ fontSize: 12, color: 'var(--mut)' }}>A second step after a PIN. People set it up in Settings → Two-factor sign-in.</div></div>
                <Row label="Authenticator apps (TOTP)" hint="6-digit codes from Google Authenticator, 1Password, Authy and others."><Toggle on={totpOn} label="Authenticator apps (TOTP)" onClick={() => setAuth({ tfaTotp: !totpOn })} /></Row>
                <Row label="Require two-factor" hint={req === 'off' ? 'People can turn it on for themselves.' : 'Anyone covered who hasn’t set it up is sent to Settings to do it straight after signing in.'}>
                  <Seg value={req} opts={[['off', 'Optional'], ['admins', 'Admins'], ['all', 'Everyone']]} onPick={v => setAuth({ tfaRequire: v })} />
                </Row>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {users.map(u => { const need = req === 'all' || (req === 'admins' && u.role === 'admin'), on = totpOn && u.hasTotp; return (
                    <div key={u.id} className="row" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '6px 0' }}><span>{u.name}{u.role === 'admin' ? ' · Admin' : ''}</span><span style={{ fontSize: 12, color: on ? 'var(--up)' : need ? '#e8b04b' : 'var(--mut)' }}>{on ? 'App' : need ? 'Not set up — required' : 'Not set up'}</span></div>); })}
                </div>
              </div>
            </>}

            {tab === 'people' && (
              <div style={{ ...card, gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}><span className="card-t">People &amp; roles</span><span style={{ fontSize: 12, color: 'var(--mut)' }}>Admins can change sign-in methods and roles</span></div>
                {users.map(u => { const lastAdmin = u.role === 'admin' && admins.length <= 1; return (
                  <div key={u.id} className="row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', flexWrap: 'wrap' }}>
                    <span style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: u.color, color: '#0d0e10', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{u.name[0]?.toUpperCase()}</span>
                    <div style={{ flex: 1, minWidth: 140 }}><div style={{ fontWeight: 500 }}>{u.name} {u.id === me.id && <span style={{ fontSize: 11, color: 'var(--acc)' }}>You</span>}</div><div className="mono mut" style={{ fontSize: 11 }}>{[u.hasPin ? 'PIN' : 'No PIN yet', u.hasTotp ? 'authenticator app' : ''].filter(Boolean).join(' · ')}</div></div>
                    <select aria-label={`Role for ${u.name}`} value={u.role} disabled={lastAdmin} title={lastAdmin ? 'Garage needs at least one admin' : 'Role'} onChange={e => patch(u.id, { role: e.target.value })} style={{ height: 36, opacity: lastAdmin ? 0.5 : 1, borderRadius: 10, border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--fg)', padding: '0 8px', fontSize: 13 }}><option value="admin">Admin</option><option value="member">Member</option></select>
                    {u.id !== me.id && (u.hasPin || u.hasTotp) && <button className="plain to-fg" style={{ fontSize: 12, color: 'var(--mut)' }} onClick={() => nav.ask({ title: `Reset ${u.name}’s sign-in?`, body: 'Their PIN and authenticator app are cleared. They create a new PIN the next time they sign in.', label: 'Reset sign-in', fn: () => patch(u.id, { resetPin: true }) })}>Reset sign-in</button>}
                    {u.id !== me.id && !lastAdmin && <button className="plain ghost-del" style={{ fontSize: 12, color: 'var(--mut)' }} onClick={() => nav.ask({ title: `Remove ${u.name}?`, body: 'They can no longer sign in. Their history entries keep their name.', label: 'Remove', fn: () => patch(u.id, { removed: true }) })}>Remove</button>}
                  </div>); })}
                {pMsg && <span role="alert" style={{ fontSize: 12, color: 'var(--down)' }}>{pMsg}</span>}
                <form onSubmit={invite} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 14, marginTop: 6, borderTop: '1px solid var(--line)' }}>
                  <span className="label">Add someone</span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input aria-label="Name" className="field" placeholder="Name" value={inv.name} onChange={e => setInv({ ...inv, name: e.target.value })} style={{ flex: '1 1 140px', width: 'auto' }} />
                    <select aria-label="Role" className="field" value={inv.role} onChange={e => setInv({ ...inv, role: e.target.value })} style={{ width: 'auto', flex: 'none', padding: '0 8px' }}><option value="member">Member</option><option value="admin">Admin</option></select>
                    <button type="submit" className="btn-p">Add</button>
                  </div>
                  <span role="status" style={{ fontSize: 12, color: 'var(--mut)' }}>{invMsg || 'They get a profile on the sign-in screen and create a PIN the first time they sign in.'}</span>
                </form>
              </div>
            )}

            {tab === 'log' && (
              <div style={{ ...card, gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}><span className="card-t">Activity log</span>
                  <span style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}><span className="mono mut" style={{ fontSize: 11 }}>{log.length ? `${shown.length} of ${log.length}` : ''}</span>{log.length > 12 && <button className="link" onClick={() => setAll(!all)}>{all ? 'Show less' : 'Show all'}</button>}</span></div>
                {shown.map(l => { const w = who(l.by); return (
                  <div key={l.id} className="row" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '9px 0' }}>
                    <span title={w.name} style={{ width: 28, height: 28, flex: 'none', borderRadius: '50%', background: w.color, color: '#0d0e10', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{w.name[0]?.toUpperCase()}</span>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.4 }}><b style={{ fontWeight: 600 }}>{l.by === me.id ? 'You' : w.name}</b> <span className="mut">{l.text}</span></div>
                    <span style={{ fontSize: 12, color: 'var(--mut)', whiteSpace: 'nowrap' }}>{carName(l.vid)}</span>
                    <span className="mono mut" style={{ fontSize: 10, whiteSpace: 'nowrap', minWidth: 70, textAlign: 'right' }}>{ago(l.at)}</span>
                  </div>); })}
                {!log.length && <span style={{ fontSize: 13, color: 'var(--mut)' }}>Nothing yet. Changes people make show up here.</span>}
              </div>
            )}

            {tab === 'ai' && <AiTab store={store} g={g} nav={nav} />}
            {tab === 'email' && <EmailTab store={store} g={g} me={me} nav={nav} />}
            {tab === 'tunnel' && <TunnelTab store={store} g={g} nav={nav} />}
            {tab === 'env' && <EnvTab g={g} />}
          </div>
        </div>
      </div>
    </div>
  );
}
