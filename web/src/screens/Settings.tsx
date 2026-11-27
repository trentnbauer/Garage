import { type ChangeEvent, type FormEvent, useState } from 'react';
import type { Nav } from '../App.tsx';
import { buildIcs, type Calc, download, type Garage, type Settings as S, today, type User } from '../lib/model.ts';
import { seed } from '../lib/seed.ts';
import type { Store } from '../lib/store.ts';
import { Icon } from '../ui/icons.tsx';

const ACC: [string, string][] = [['Graphite', ''], ['Blue', '#5b84ff'], ['Teal', '#4fc3d9'], ['Green', '#3fcf8e'], ['Amber', '#e8b04b'], ['Orange', '#e8935b'], ['Red', '#f2685f'], ['Violet', '#b48cff']];
const card = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 20, padding: 20, display: 'flex', flexDirection: 'column' as const, gap: 16 };

export const Toggle = ({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} title={label} className="plain" onClick={onClick} style={{ width: 44, height: 26, borderRadius: 999, flex: 'none', position: 'relative', background: on ? '#7a7a7a' : '#2e2e2e' }}>
    <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
  </button>
);
export const Seg = <T extends string>({ value, opts, onPick, mono }: { value: T; opts: [T, string][]; onPick: (v: T) => void; mono?: boolean }) => (
  <div role="radiogroup" style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--card2)', borderRadius: 12 }}>
    {opts.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={value === k} className="plain" onClick={() => onPick(k)} style={{ padding: mono ? '6px 14px' : '6px 12px', borderRadius: 9, fontSize: 13, fontFamily: mono ? 'var(--mono)' : undefined, background: value === k ? 'var(--acc)' : 'transparent', color: value === k ? 'var(--accfg)' : 'var(--mut)' }}>{l}</button>)}
  </div>
);
export const Back = ({ nav }: { nav: Nav }) => <button className="btn" onClick={() => nav.go({ view: 'home' })} title="Back to garage" style={{ padding: '0 14px 0 10px', fontWeight: 500 }}><Icon n="chevron" s={15} style={{ transform: 'rotate(90deg)' }} />Garage</button>;

export function Settings({ store, me, calc, nav, narrow, nag }: { store: Store; me: User; calc: Calc; nav: Nav; narrow: boolean; nag: boolean }) {
  const g = calc.g, set = g.settings, a = g.auth;
  const [name, setName] = useState(me.name);
  const [pin, setPin] = useState(''), [pinMsg, setPinMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null), [code, setCode] = useState(''), [tfaMsg, setTfaMsg] = useState<{ t: string; ok: boolean } | null>(null), [copied, setCopied] = useState(false);
  const [dataMsg, setDataMsg] = useState(''), [resetTxt, setResetTxt] = useState('');
  const setS = (p: Partial<S>) => store.update(g2 => ({ ...g2, settings: { ...g2.settings, ...p } }));
  const required = a.tfaRequire === 'all' || (a.tfaRequire === 'admins' && me.role === 'admin');
  const needPin = me.role === 'admin' || a.signins;

  const saveName = () => { const n = name.trim(); if (n && n !== me.name) store.api('POST', '/api/me', { name: n }); };
  const savePin = async () => {
    if (pin.length < 4) { setPinMsg({ t: 'Use at least 4 digits.', ok: false }); return; }
    const r = await store.api('POST', '/api/pin', { pin });
    setPinMsg(r.ok ? { t: 'PIN saved.', ok: true } : { t: r.json.error || 'Couldn’t save the PIN.', ok: false }); if (r.ok) setPin('');
  };
  const clearPin = async () => { const r = await store.api('DELETE', '/api/pin'); setPinMsg(r.ok ? { t: 'PIN removed.', ok: true } : { t: r.json.error || '', ok: false }); };
  const totpStart = async () => { setTfaMsg(null); const r = await store.api('POST', '/api/totp/start'); if (r.ok) { setSetup(r.json as { secret: string; uri: string }); setCode(''); setCopied(false); } else setTfaMsg({ t: r.json.error || '', ok: false }); };
  const totpVerify = async (e: FormEvent) => { e.preventDefault(); const r = await store.api('POST', '/api/totp/verify', { code }); if (r.ok) { setSetup(null); setTfaMsg({ t: 'Authenticator app is on.', ok: true }); } else { setTfaMsg({ t: r.json.error || '', ok: false }); setCode(''); } };
  const totpOff = () => nav.ask({ title: 'Turn off the authenticator app?', body: 'You won’t be asked for a code when you sign in.', label: 'Turn off', fn: async () => { const r = await store.api('DELETE', '/api/totp'); setTfaMsg(r.ok ? null : { t: r.json.error || '', ok: false }); } });

  const backup = () => { const { vehicles, records, reminders, parts, boards, notes, settings, shelf } = g; download(`garage-backup-${today()}.json`, JSON.stringify({ app: 'garage', version: 3, vehicles, records, reminders, parts, boards, notes, settings, shelf }, null, 2), 'application/json'); setDataMsg('Backup downloaded.'); };
  const importBackup = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    let d: Partial<Garage>;
    try { d = JSON.parse(await f.text()); if (!Array.isArray(d.vehicles)) throw new Error(); } catch { setDataMsg('That file is not a Garage backup.'); return; }
    nav.ask({ title: 'Replace everything with this backup?', body: `Your cars, history, reminders, parts, tasks and notes will be replaced with the ${d.vehicles!.length} car${d.vehicles!.length === 1 ? '' : 's'} in “${f.name}”. People and sign-in settings stay.`, label: 'Import backup',
      fn: () => { store.update(g2 => ({ ...g2, vehicles: d.vehicles!, records: d.records || [], reminders: d.reminders || [], parts: d.parts || [], boards: d.boards || {}, notes: d.notes || {}, shelf: d.shelf || [], settings: { ...g2.settings, ...(d.settings || {}) } })); setDataMsg(`Imported ${d.vehicles!.length} vehicles.`); } });
  };
  const reset = (e: FormEvent) => {
    e.preventDefault(); if (resetTxt.trim() !== 'RESET') return;
    const s0 = seed(me.id);
    store.update(g2 => ({ ...g2, vehicles: s0.vehicles, records: s0.records, reminders: s0.reminders, parts: s0.parts, boards: s0.boards, notes: s0.notes, shelf: s0.shelf }));
    setResetTxt(''); setDataMsg('Reset to sample data.'); nav.go({ activeId: 'v1' });
  };
  const curAcc = set.accent || '', custom = !!curAcc && !ACC.some(x => x[1] === curAcc);
  const rows = [
    { label: 'Full width', hint: 'Use the whole screen. Off caps pages at a comfortable width on large and ultrawide monitors.', on: !!set.fullWidth, flip: () => setS({ fullWidth: !set.fullWidth }) },
    { label: 'Show total spend', hint: 'Fleet, per-car and yearly totals. Individual costs stay visible.', on: set.showTotals !== false, flip: () => setS({ showTotals: set.showTotals === false }) },
    { label: 'Compact board cards', hint: 'Hide task notes on the build board', on: !!set.compact, flip: () => setS({ compact: !set.compact }) },
  ];
  const num = (k: keyof S) => (e: ChangeEvent<HTMLInputElement>) => setS({ [k]: e.target.value === '' ? '' : +e.target.value } as Partial<S>);
  const msg = (m: { t: string; ok: boolean } | null) => m && <span role="status" style={{ fontSize: 12, color: m.ok ? 'var(--up)' : 'var(--down)' }}>{m.t}</span>;

  return (
    <div className="frame">
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: narrow ? '20px 16px 120px' : '32px 32px 64px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {!nag && <Back nav={nav} />}
          <span style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 32 }}>Settings</span>
          <span className="mono" style={{ marginLeft: 'auto', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mut)' }}>Saved automatically</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', gap: 12 }}>
          <div style={card}>
            <span className="card-t">Profile</span>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span className="label">Your name</span><input className="field" placeholder="Shown in the greeting" value={name} onChange={e => setName(e.target.value)} onBlur={saveName} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span className="label">Open a car on</span>
              <select className="field" style={{ padding: '0 10px' }} value={set.defaultSec} onChange={e => setS({ defaultSec: e.target.value })}><option value="overview">Overview</option><option value="board">Build board</option><option value="history">Service history</option><option value="reminders">Reminders</option><option value="parts">Parts</option><option value="notes">Notes</option></select></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span className="label">Your PIN</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="field" type="password" inputMode="numeric" autoComplete="new-password" placeholder={me.hasPin ? 'Saved. Type a new one to change it' : '4–8 digits'} value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 8)); setPinMsg(null); }} style={{ flex: 1 }} />
                <button type="button" className="plain" onClick={savePin} style={{ height: 40, padding: '0 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', background: pin ? 'var(--acc)' : 'var(--card2)', color: pin ? 'var(--accfg)' : 'var(--mut)' }}>Save</button>
              </div>
              {pinMsg ? msg(pinMsg) : <span style={{ fontSize: 12, color: 'var(--mut)' }}>{me.role === 'admin' ? 'Admins always need a PIN.' : a.signins ? 'Needed to sign in, unless you use an authenticator app instead.' : 'Optional while sign-ins are off. Stops others picking your profile.'}</span>}
              {me.hasPin && !needPin && <button type="button" className="plain ghost-del" onClick={clearPin} style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--mut)' }}>Remove PIN</button>}
            </label>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="link" style={{ fontSize: 13 }} onClick={store.logout}>Switch person</button>
              {me.role === 'admin' && <button className="link" style={{ fontSize: 13 }} onClick={() => nav.go({ view: 'admin' })}>Manage people in Admin settings</button>}
            </div>
          </div>

          {a.tfaTotp !== false && (
            <div style={{ ...card, gap: 14, borderColor: nag && !me.hasTotp ? '#e8b04b' : 'var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}><span className="card-t">Two-factor sign-in</span>
                {(() => { const [t, c] = me.hasTotp ? ['On', '#3fcf8e'] : required ? ['Required', '#e8b04b'] : ['Off', '#8d9099']; return <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, background: c + '22', color: c }}>{t}</span>; })()}</div>
              {required && !me.hasTotp && <div style={{ fontSize: 13, lineHeight: 1.5, padding: '10px 12px', borderRadius: 12, background: 'rgba(232,176,75,.12)', color: '#e8b04b' }}>An admin requires two-factor for your account. Set up an authenticator app below to carry on.</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}><div style={{ fontSize: 14 }}>Authenticator app</div><div style={{ fontSize: 12, color: 'var(--mut)' }}>{me.hasTotp ? 'On — you’ll be asked for a 6-digit code after signing in.' : 'A 6-digit code from an app on your phone.'}</div></div>
                  {me.hasTotp && !setup && <button type="button" className="btn" onClick={totpOff}>Turn off</button>}
                  {!me.hasTotp && !setup && <button type="button" className="btn-p" onClick={totpStart}>Set up</button>}
                </div>
                {setup && (
                  <form onSubmit={totpVerify} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 14, background: 'var(--card2)' }}>
                    <span style={{ fontSize: 13, lineHeight: 1.5 }}>1. In Google Authenticator, 1Password, Authy or similar, add an account and enter this key — or open the link on your phone.</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="mono" style={{ fontSize: 15, letterSpacing: '.08em', padding: '8px 12px', borderRadius: 10, background: 'var(--card)', userSelect: 'all' }}>{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</span>
                      <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(setup.secret).then(() => setCopied(true), () => {})}>{copied ? 'Copied' : 'Copy key'}</button>
                      <a href={setup.uri} style={{ fontSize: 13 }}>Open in authenticator</a>
                    </div>
                    <span style={{ fontSize: 13 }}>2. Enter the 6-digit code it shows.</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input className="field" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" aria-label="6-digit code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} style={{ width: 150, background: 'var(--card2)', fontFamily: 'var(--mono)', letterSpacing: '.2em' }} />
                      <button type="submit" className="btn-p" style={{ height: 40 }}>Verify &amp; turn on</button>
                      <button type="button" className="btn" style={{ height: 40, boxSizing: 'border-box' }} onClick={() => setSetup(null)}>Cancel</button>
                    </div>
                  </form>
                )}
              </div>
              {msg(tfaMsg)}
            </div>
          )}

          <div style={card}>
            <span className="card-t">Units</span>
            {([['Distance', 'Odometer, intervals and economy', 'units', [['mi', 'mi'], ['km', 'km']]], ['Currency', 'Costs and totals', 'currency', [['$', '$'], ['€', '€'], ['£', '£']]]] as const).map(([label, hint, k, opts]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div><div style={{ fontSize: 14 }}>{label}</div><div style={{ fontSize: 12, color: 'var(--mut)' }}>{hint}</div></div>
                <Seg mono value={String(set[k])} opts={opts as unknown as [string, string][]} onPick={v => setS({ [k]: v } as Partial<S>)} />
              </div>
            ))}
          </div>

          <div style={card}>
            <span className="card-t">Reminders &amp; tasks</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span className="label">Due soon (days)</span><input className="field" type="number" value={set.soonDays} onChange={num('soonDays')} style={{ fontFamily: 'var(--mono)' }} /></label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span className="label">Due soon ({calc.u})</span><input className="field" type="number" value={set.soonDist} onChange={num('soonDist')} style={{ fontFamily: 'var(--mono)' }} /></label>
            </div>
            <span style={{ fontSize: 12, color: 'var(--mut)' }}>A reminder turns amber when it's within either window, red once it's passed.</span>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <div><div style={{ fontSize: 14 }}>Hide done tasks after</div><div style={{ fontSize: 12, color: 'var(--mut)' }}>Days before finished cards fold away. The 3 newest always stay visible.</div></div>
              <input type="number" min="0" value={set.hideDoneDays} onChange={num('hideDoneDays')} style={{ height: 36, width: 90, borderRadius: 10, border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--fg)', padding: '0 12px', fontSize: 14, fontFamily: 'var(--mono)' }} />
            </label>
          </div>

          <div style={card}>
            <span className="card-t">Display</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div><div style={{ fontSize: 14 }}>Accent colour</div><div style={{ fontSize: 12, color: 'var(--mut)' }}>Buttons, highlights and selected tabs</div></div>
              <div role="radiogroup" aria-label="Accent colour" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {ACC.map(([label, hex]) => <button key={label} type="button" role="radio" aria-checked={curAcc === hex} className="plain" onClick={() => setS({ accent: hex })} title={label} aria-label={label} style={{ width: 26, height: 26, borderRadius: '50%', background: hex || '#ececec', boxShadow: `0 0 0 2px var(--card), 0 0 0 ${curAcc === hex ? 4 : 0}px var(--fg)` }} />)}
                <label title="Custom colour" style={{ position: 'relative', width: 26, height: 26, borderRadius: '50%', cursor: 'pointer', background: 'conic-gradient(#f2685f,#e8b04b,#3fcf8e,#4fc3d9,#5b84ff,#b48cff,#f2685f)', boxShadow: `0 0 0 2px var(--card), 0 0 0 ${custom ? 4 : 0}px var(--fg)` }}>
                  <input type="color" aria-label="Custom colour" value={/^#[0-9a-f]{6}$/i.test(curAcc) ? curAcc : '#5b84ff'} onChange={e => setS({ accent: e.target.value })} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }} />
                </label>
              </div>
            </div>
            {rows.map(t => <div key={t.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><div><div style={{ fontSize: 14 }}>{t.label}</div><div style={{ fontSize: 12, color: 'var(--mut)' }}>{t.hint}</div></div><Toggle on={t.on} label={t.label} onClick={t.flip} /></div>)}
          </div>

          <div style={{ ...card, gridColumn: '1/-1', gap: 14 }}>
            <span className="card-t">Data</span>
            <span style={{ fontSize: 13, color: 'var(--mut)' }}>Everything is saved on your Garage server, so it's the same on every device you sign in from. Export a backup any time, or bring data across from another app.</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-p" onClick={backup}><Icon n="download" s={15} />Export backup</button>
              <label className="btn" style={{ cursor: 'pointer', padding: '0 16px' }}><Icon n="upload" s={15} />Import backup<input type="file" accept="application/json,.json" onChange={importBackup} style={{ display: 'none' }} /></label>
              <button className="btn" style={{ padding: '0 16px' }} onClick={nav.soon}><Icon n="swap" s={15} />Migrate from another app</button>
            </div>
            {dataMsg && <span role="status" style={{ fontSize: 12, color: 'var(--up)' }}>{dataMsg}</span>}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <div><div style={{ fontSize: 14 }}>Calendar feed</div><div style={{ fontSize: 12, color: 'var(--mut)' }}>Reminders and task target dates in Google, Apple or Outlook Calendar. Km-based reminders use the estimated date.</div></div>
              <button className="btn" onClick={() => download('garage-reminders.ics', buildIcs(calc), 'text/calendar')}>Download .ics</button>
            </div>
          </div>

          <div style={{ ...card, gridColumn: '1/-1', gap: 12, border: '1px solid rgba(242,104,95,.3)' }}>
            <div><div className="card-t" style={{ color: 'var(--down)' }}>Danger zone</div><div style={{ fontSize: 13, color: 'var(--mut)', lineHeight: 1.5 }}>Reset replaces every car, entry, reminder, part, task and note with the sample garage. Export a backup first — this can't be undone.</div></div>
            <form onSubmit={reset} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input aria-label="Type RESET to confirm" placeholder="Type RESET to confirm" value={resetTxt} onChange={e => setResetTxt(e.target.value)} style={{ height: 40, width: 220, maxWidth: '100%', borderRadius: 10, border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--fg)', padding: '0 12px', fontSize: 14, fontFamily: 'var(--mono)' }} />
              {(() => { const ok = resetTxt.trim() === 'RESET'; return <button type="submit" className="plain" aria-disabled={!ok} style={{ cursor: ok ? 'pointer' : 'not-allowed', height: 36, padding: '0 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', background: ok ? 'var(--down)' : 'var(--card2)', color: ok ? '#140f05' : 'var(--mut)' }}>Reset to sample data</button>; })()}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
