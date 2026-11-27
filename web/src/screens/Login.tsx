import { type CSSProperties, type FormEvent, useState } from 'react';
import { UCOLORS } from '../lib/model.ts';
import type { Store } from '../lib/store.ts';
import { Icon, type IconName } from '../ui/icons.tsx';

const FEATURES: [IconName, string, string][] = [
  ['wrench', 'Service history', 'Every job with parts, costs, notes and receipts.'],
  ['bell', 'Reminders that know', 'Due by date or distance, estimated from how you drive.'],
  ['board', 'Build board', 'Plan mods and repairs, track parts, log them when done.'],
  ['file', 'Ready to sell', 'Export a paperwork pack for the next owner in one click.'],
];

export function Login({ store }: { store: Store }) {
  const g = store.g!, on = g.auth.signins;
  const users = g.users.filter(u => !u.removed && u.provider !== 'google');
  const [pinFor, setPinFor] = useState<string | null>(null);
  const [pin, setPin] = useState(''), [err, setErr] = useState('');
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<'pin' | 'code'>('pin');
  const [tfa, setTfa] = useState<{ ticket: string; name: string } | null>(null), [code, setCode] = useState('');
  const [nu, setNu] = useState({ name: '', pin: '', color: UCOLORS[users.length % UCOLORS.length] });
  const needPin = (u: typeof users[0]) => on || u.role === 'admin';
  const px = users.find(u => u.id === pinFor), setting = !!px && !px.hasPin;
  const canCode = !!px && !!px.hasTotp && g.auth.tfaTotp !== false && !setting;
  const result = (r: { error?: string; ticket?: string }, name: string) => { if (r.ticket) { setTfa({ ticket: r.ticket, name }); setPinFor(null); setCode(''); setErr(''); } else if (r.error) { setErr(r.error); setPin(''); } };

  const pick = async (u: typeof users[0]) => {
    setAdding(false); setErr('');
    if (u.hasPin || needPin(u)) { setPinFor(u.id); setPin(''); setMode('pin'); setTfa(null); return; }
    result(await store.login(u.id, {}), u.name);
  };
  const submitPin = async (e: FormEvent) => {
    e.preventDefault(); if (!px) return;
    if (setting && pin.length < 4) { setErr('Use at least 4 digits'); return; }
    result(await store.login(px.id, mode === 'code' ? { code: pin } : setting ? { newPin: pin } : { pin }), px.name);
  };
  const submitAdd = async (e: FormEvent) => {
    e.preventDefault(); const name = nu.name.trim(); if (!name || on) return;
    if (nu.pin && nu.pin.length < 4) { setErr('PINs need at least 4 digits'); return; }
    const r = await store.addUser(name, nu.color, nu.pin); if (r) setErr(r);
  };
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 8);

  return (
    <div className="frame" style={{ display: 'flex', flexWrap: 'wrap-reverse', alignContent: 'stretch' }}>
      <div style={{ flex: '1 1 440px', minWidth: 0, padding: '48px clamp(24px,5vw,72px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 32, background: 'radial-gradient(90% 60% at 0% 0%, var(--accs), transparent 70%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--acc)', color: 'var(--accfg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 20 }}>G</span>
          <span style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 28 }}>Garage</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 520 }}>
          <div style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 'clamp(32px,3.4vw,46px)', lineHeight: 1.08, textWrap: 'balance' } as CSSProperties}>Every car you keep, and everything you've done to it.</div>
          <div style={{ fontSize: 15, color: 'var(--mut)', lineHeight: 1.6, textWrap: 'pretty' } as CSSProperties}>A self-hosted logbook for project and daily cars. Service history, reminders, the build board and the paperwork, all in one place and shared with whoever works on them with you.</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,230px),1fr))', gap: '18px 24px', maxWidth: 620 }}>
          {FEATURES.map(([ic, t, d]) => (
            <div key={t} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ width: 32, height: 32, flex: 'none', borderRadius: 9, background: 'var(--accs)', color: 'var(--acc)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon n={ic} /></span>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{t}</div><div style={{ fontSize: 13, color: 'var(--mut)', lineHeight: 1.5 }}>{d}</div></div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="label" style={{ letterSpacing: '.14em' }}>Your data</span>
          <span style={{ fontSize: 13, color: 'var(--mut)' }}>Runs on your own server. Nothing leaves it unless you turn on AI help or email.</span>
        </div>
      </div>

      <div style={{ flex: '1 1 440px', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 32px', background: 'var(--card)', borderLeft: '1px solid var(--line)' }}>
        <div style={{ width: 'min(480px,100%)', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <div className="kicker">Sign in</div>
            <div className="title" style={{ marginTop: 6 }}>Who’s in the garage?</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 12 }}>
            {users.map(u => (
              <button key={u.id} className={'who' + (pinFor === u.id ? ' on' : '')} onClick={() => pick(u)}>
                <span style={{ width: 64, height: 64, borderRadius: '50%', background: u.color, color: '#0d0e10', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700 }}>{(u.name || '?')[0].toUpperCase()}</span>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{u.name}</span>
                <span style={{ fontSize: 11, color: 'var(--mut)' }}>{(u.role === 'admin' ? 'Admin · ' : '') + (u.hasPin ? 'PIN' : needPin(u) ? 'Create a PIN' : 'Tap to sign in')}</span>
              </button>
            ))}
            {!on && (
              <button className="who-add" onClick={() => { setAdding(true); setPinFor(null); setErr(''); }}>
                <span style={{ width: 64, height: 64, borderRadius: '50%', border: '2px dashed currentColor', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon n="plus" s={24} /></span>
                <span style={{ fontWeight: 600, fontSize: 15 }}>Add person</span>
              </button>
            )}
          </div>

          {px && (
            <form className="box" onSubmit={submitPin}>
              <span style={{ fontSize: 14 }}>{mode === 'code' ? 'Authenticator code for' : setting ? 'Create a PIN for' : 'PIN for'} <b>{px.name}</b></span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="field" type={mode === 'code' ? 'text' : 'password'} inputMode="numeric" autoFocus autoComplete={mode === 'code' ? 'one-time-code' : setting ? 'new-password' : 'current-password'} placeholder={mode === 'code' ? '6-digit code' : 'PIN'} aria-label={mode === 'code' ? 'Authenticator code' : 'PIN'} value={pin} onChange={e => { setPin(digits(e.target.value).slice(0, mode === 'code' ? 6 : 8)); setErr(''); }} style={{ fontFamily: 'var(--mono)', letterSpacing: '.3em' }} />
                <button type="submit" className="btn-p" style={{ height: 40, padding: '0 18px' }}>Sign in</button>
              </div>
              {err && <span role="alert" style={{ fontSize: 12, color: 'var(--down)' }}>{err}</span>}
              {canCode && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingTop: 4 }}><span style={{ fontSize: 12, color: 'var(--mut)' }}>Or use</span>
                <button type="button" className="btn" style={{ boxSizing: 'border-box', height: 30, padding: '0 12px', fontSize: 12 }} onClick={() => { setMode(mode === 'code' ? 'pin' : 'code'); setPin(''); setErr(''); }}>{mode === 'code' ? 'PIN' : 'Authenticator code'}</button></div>}
            </form>
          )}

          {tfa && (
            <form className="box" style={{ border: '1px solid var(--acc)' }} onSubmit={async e => { e.preventDefault(); const r = await store.loginTotp(tfa.ticket, code); if (r) { setErr(r); setCode(''); } }}>
              <span style={{ fontSize: 14 }}>Two-factor for <b>{tfa.name}</b></span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="field" inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="6-digit code" aria-label="Authenticator code" value={code} onChange={e => { setCode(digits(e.target.value).slice(0, 6)); setErr(''); }} style={{ flex: 1, fontFamily: 'var(--mono)', letterSpacing: '.2em' }} />
                <button type="submit" className="btn-p" style={{ height: 40 }}>Verify</button>
              </div>
              {err && <span role="alert" style={{ fontSize: 12, color: 'var(--down)' }}>{err}</span>}
              <button type="button" className="plain" onClick={() => { setTfa(null); setErr(''); }} style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--mut)' }}>Cancel</button>
            </form>
          )}

          {adding && (
            <form className="box" onSubmit={submitAdd} style={{ gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span className="label">Name</span><input className="field" required placeholder="e.g. Alex" value={nu.name} onChange={e => setNu({ ...nu, name: e.target.value })} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span className="label">PIN (optional)</span><input className="field" type="password" inputMode="numeric" autoComplete="new-password" placeholder="4–8 digits" value={nu.pin} onChange={e => setNu({ ...nu, pin: digits(e.target.value) })} style={{ fontFamily: 'var(--mono)' }} /></label>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="label">Colour</span>
                {UCOLORS.map(c => <button key={c} type="button" title="Colour" aria-label={'Colour ' + c} aria-pressed={nu.color === c} onClick={() => setNu({ ...nu, color: c })} className="plain" style={{ width: 24, height: 24, borderRadius: '50%', background: c, boxShadow: `0 0 0 ${nu.color === c ? 2 : 0}px var(--fg)` }} />)}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn-p" style={{ padding: '0 18px' }}>Create &amp; sign in</button>
                <button type="button" className="btn" style={{ padding: '0 16px' }} onClick={() => setAdding(false)}>Cancel</button>
              </div>
              {err && <span role="alert" style={{ fontSize: 12, color: 'var(--down)' }}>{err}</span>}
            </form>
          )}
          {!px && !adding && err && <span role="alert" style={{ fontSize: 12, color: 'var(--down)' }}>{err}</span>}

          <span style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 1.5 }}>
            {on ? 'Everyone signs in with their PIN or an authenticator code. Ask an admin to add you.' : 'Sign-ins are off: anyone here can pick or make a profile. Admin profiles still need a PIN. Turn sign-ins on in Admin settings before opening Garage to the internet.'}
          </span>
        </div>
      </div>
    </div>
  );
}
