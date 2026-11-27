import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import type { Nav } from '../App.tsx';
import {
  addVehicle, type CardForm, deleteCard, ev, logCost, newVehForm, partsTotal, type RecForm, remForm, type RemForm, saveCard, saveRecord, saveReminder, setOdometer, setPartStatus, TPL0, track, type VehForm,
} from '../lib/actions.ts';
import { addMonths, type Calc, COLNAME, DRIVE, type Drive, fdate, FUELS, lastGrade, nextDue, PCOL, PSTAT, TCOL, tint, today, uid, type User } from '../lib/model.ts';
import type { Store } from '../lib/store.ts';
import { Icon } from './icons.tsx';

export type OdoForm = { cur: number; add: string; reading: string; fix: boolean };
export type Dlg =
  | { kind: 'record'; vid: string; form: RecForm }
  | { kind: 'card'; vid: string; form: CardForm }
  | { kind: 'reminder'; vid: string; form: RemForm }
  | { kind: 'odo'; vid: string; form: OdoForm }
  | { kind: 'vehicle'; form: VehForm }
  | { kind: 'entry'; vid: string; id: string };

export const blankRecord = (calc: Calc, vid: string, pre: Partial<RecForm> = {}): RecForm => {
  const v = calc.g.vehicles.find(x => x.id === vid)!;
  return { type: 'Service', date: today(), title: '', odo: String(calc.stats(v).odo), cost: '', gallons: '', notes: '', where: 'diy', fromReminder: '', ...pre };
};
export const fuelRecord = (calc: Calc, vid: string): RecForm => blankRecord(calc, vid, { type: 'Fuel', title: lastGrade(calc.g, vid), fuelMode: true, partial: false, odo: '' });
export const odoForm = (calc: Calc, vid: string): OdoForm => ({ cur: calc.stats(calc.g.vehicles.find(v => v.id === vid)!).odo, add: '', reading: '', fix: false });
export const vehicleForm = newVehForm;

// ---------- shared bits ----------
const L = ({ label, full, children }: { label: ReactNode; full?: boolean; children: ReactNode }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 6, ...(full ? { gridColumn: '1/-1' } : {}) }}><span className="label">{label}</span>{children}</label>
);
const mono = { fontFamily: 'var(--mono)' };
const sel = { padding: '0 10px' };
const Grid = ({ children, cols = 'minmax(0,1fr) minmax(0,1fr)', end }: { children: ReactNode; cols?: string; end?: boolean }) => <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, alignItems: end ? 'end' : undefined }}>{children}</div>;
const Head = ({ label, count }: { label: string; count?: string }) => <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span className="label">{label}</span><span className="mono mut" style={{ fontSize: 11 }}>{count}</span></div>;
const Tick = ({ on, size = 18 }: { on: boolean; size?: number }) => (
  <span style={{ width: size, height: size, flex: 'none', borderRadius: 5, border: `2px solid ${on ? 'var(--acc)' : 'var(--line2)'}`, background: on ? 'var(--acc)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accfg)' }}>{on && <Icon n="check" s={12} w={3} />}</span>
);
const Switch = ({ on }: { on: boolean }) => <span style={{ width: 44, height: 26, borderRadius: 999, flex: 'none', position: 'relative', background: on ? '#7a7a7a' : '#2e2e2e' }}><span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} /></span>;

/** Dialog frame: Esc closes; clicking outside saves if something changed and the form is complete, else closes. */
function Shell({ title, byLine, width = 520, narrow, onClose, onSave, dirty, valid, cta, footer, children }: {
  title: string; byLine?: string; width?: number; narrow: boolean; onClose: () => void; onSave: () => void; dirty: boolean; valid: boolean; cta: string; footer?: ReactNode; children: ReactNode;
}) {
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  const submit = (e: FormEvent) => { e.preventDefault(); onSave(); };
  return (
    <div onClick={() => (dirty && valid ? onSave() : onClose())} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: narrow ? 'flex-end' : 'center', justifyContent: 'center', padding: narrow ? 0 : 16 }}>
      <form role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()} onSubmit={submit}
        style={{ width: `min(${width}px,100%)`, maxHeight: narrow ? '94vh' : '90vh', overflow: 'auto', background: 'var(--card)', border: '1px solid var(--line2)', borderRadius: narrow ? '22px 22px 0 0' : 22, padding: narrow ? '18px 16px calc(18px + env(safe-area-inset-bottom))' : 22, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 24px 60px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}><span style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 24 }}>{title}</span>{byLine && <span style={{ fontSize: 12, color: 'var(--mut)' }}>{byLine}</span>}</div>
          <button type="button" className="plain icon-btn" onClick={onClose} title="Close" aria-label="Close"><Icon n="x" /></button>
        </div>
        {children}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'sticky', bottom: narrow ? -18 : -22, margin: narrow ? '0 -16px -18px' : '0 -22px -22px', padding: narrow ? '14px 16px' : '14px 22px', background: 'var(--card)', borderTop: '1px solid var(--line)', zIndex: 3 }}>
          <button type="submit" className="btn-p" style={{ height: 40, padding: '0 20px' }}>{cta}</button>
          {footer}
        </div>
      </form>
    </div>
  );
}
const Cancel = ({ onClick }: { onClick: () => void }) => <button type="button" className="btn" onClick={onClick} style={{ height: 40, padding: '0 18px', fontSize: 14 }}>Cancel</button>;
const DelLink = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => <button type="button" className="plain" onClick={onClick} style={{ marginLeft: 'auto', color: 'var(--down)', fontSize: 13 }}>{children}</button>;

// close = cancel (undoes parts added to an unsaved task); done = saved.
type P<D> = { d: D; set: (d: D) => void; calc: Calc; store: Store; me: User; nav: Nav; narrow: boolean; close: () => void; done: () => void; dirty: boolean };

// ---------- Log service / Add fill-up / mark done ----------
const STOPW = new Set(['and', 'the', 'with', 'check', 'service', 'every', 'new', 'for']);
const words = (t: string) => (t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(w => w.length > 2 && !STOPW.has(w));

function RecordDialog({ d, set, calc, store, me, nav, narrow, close, dirty }: P<Extract<Dlg, { kind: 'record' }>>) {
  const g = calc.g, u = calc.u, f = d.form, vid = d.vid, vol = u === 'km' ? 'L' : 'gal', cur = calc.cur;
  const [match, setMatch] = useState({ auto: false, touched: false });
  const v = g.vehicles.find(x => x.id === vid)!, odo = calc.stats(v).odo;
  const active = calc.activeRems(v, odo);
  const fail = !!f.isCheck && f.result === 'fail';
  const up = (p: Partial<RecForm>) => set({ ...d, form: { ...f, ...p } });
  // Suggest the reminder this entry completes from its description.
  const auto = (p: Partial<RecForm>) => {
    const f2 = { ...f, ...p };
    if (match.touched || f2.type === 'Fuel' || f2.isCheck) return set({ ...d, form: f2 });
    const tw = new Set(words(f2.title)); let best: string | undefined, bs = 0;
    active.forEach(x => {
      const rw = words(x.r.title);
      let sc = rw.filter(w => tw.has(w) || [...tw].some(t => t.startsWith(w.slice(0, 4)))).length / Math.max(1, rw.length);
      if (f2.type === 'Registration' && (x.r.auto === 'rego' || /rego|regist/i.test(x.r.title))) sc += 1;
      if (f2.type === 'Insurance' && /insur/i.test(x.r.title)) sc += 1;
      if (f2.type === 'Inspection' && /inspection/i.test(x.r.title)) sc += 0.5;
      if (sc > bs) { bs = sc; best = x.r.id; }
    });
    setMatch({ ...match, auto: bs >= 0.5 });
    set({ ...d, form: { ...f2, fromReminder: bs >= 0.5 ? best : '' } });
  };

  const autoCost = !f.fuelMode && !f.costTouched ? logCost(g, f) : 0, lb = +(f.labour || 0);
  const costShown = autoCost > 0 ? String(autoCost) : f.cost;
  const rem = f.fromReminder ? g.reminders.find(r => r.id === f.fromReminder) : undefined;
  let banner = '';
  if (rem && !fail) {
    if (rem.auto === 'rego') banner = v.regoExpiry ? `Renews rego. New expiry ${fdate(addMonths(v.regoExpiry, +(v.regoTerm || 12)))} — the reminder moves with it.` : '';
    else {
      const bits = [rem.repeatDays && f.date ? fdate(nextDue(f.date, +rem.repeatDays)) : '', rem.repeatDist && f.odo ? `${(+f.odo + +rem.repeatDist).toLocaleString()} ${u}` : ''].filter(Boolean);
      banner = (bits.length ? `Completes “${rem.title}”${match.auto ? ' (matched from the description)' : ''}. Next due ${bits.join(' or ')}${rem.repeatFrom === 'fixed' ? ' (fixed schedule)' : ''}.` : `Completes “${rem.title}”. It's a one-off, so it moves to Completed.`) + (rem.notes ? ' Note: ' + rem.notes : '');
    }
  }
  const tpl = f.tpl || TPL0;
  const showLinks = !f.fuelMode && !f.isCheck && !f.fromCard;
  const c = +f.cost || 0, gal = +(f.gallons || 0), ppu = +(f.ppu || 0), byPpu = f.fuelBy === 'ppu';
  const calcTxt = byPpu ? (ppu && c ? `= ${(c / ppu).toFixed(2)} ${vol} added` : 'Enter cost and price to work out the amount') : gal && c ? `= ${cur}${(c / gal).toFixed(3)} per ${vol}` : `Enter cost and ${vol} to see ${cur}/${vol}`;

  const save = () => {
    if (f.checks?.length && !fail) {
      const left = f.checks.filter(x => !(x.state ? x.state === 'pass' : x.done)).length;
      if (left && !(d as { confirmed?: boolean }).confirmed) {
        nav.ask({ title: 'Save with unticked checks?', body: `${left} of ${f.checks.length} checklist items aren't ticked. They'll be saved as not done.`, label: 'Save anyway', fn: () => finish() });
        return;
      }
    }
    finish();
  };
  const finish = () => {
    const r = saveRecord(g, vid, f, me.id, calc.TODAY);
    if ('odoErr' in r) { up({ odoErr: r.odoErr } as Partial<RecForm>); return; }
    store.update(() => r.g); close();
  };
  const odoErr = (f as { odoErr?: string }).odoErr;

  // Parts used
  const ids = f.usedParts || [], nps = f.newParts || [];
  const usedRows = [
    ...ids.map(id => g.parts.find(p => p.id === id)).filter(Boolean).map(p => ({ key: p!.id, name: p!.name || 'Untitled part', meta: [p!.partNo, p!.vendor, p!.qty > 1 ? '×' + p!.qty : '', p!.status !== 'Installed' ? p!.status + ' → Installed' : ''].filter(Boolean).join(' · ') || 'From parts list', c: +(p!.cost || 0) * (p!.qty || 1), remove: () => up({ usedParts: ids.filter(x => x !== p!.id) }) })),
    ...nps.map(p => ({ key: p.id, name: p.name, meta: 'New part · added to the Parts list as installed', c: +p.cost || 0, remove: () => up({ newParts: nps.filter(x => x.id !== p.id) }) })),
  ];
  const usedTotal = usedRows.reduce((a, r) => a + r.c, 0);
  const avail = g.parts.filter(p => p.vid === vid && !ids.includes(p.id) && !p.recId).sort((x, y) => PSTAT.indexOf(y.status) - PSTAT.indexOf(x.status));
  const [np, setNp] = useState({ name: '', cost: '' });
  const showUsed = !f.fuelMode && !fail;

  const title = f.fuelMode ? 'Add fill-up' : f.isCheck ? f.passTitle || 'Check' : 'Log service';
  const cta = f.fuelMode ? 'Save fill-up' : f.isCheck ? (fail ? 'Add to board' : 'Log pass') : 'Save entry';
  const valid = f.fuelMode ? !!(+f.cost || gal || ppu) : !!f.title.trim();

  return (
    <Shell title={title} narrow={narrow} onClose={close} onSave={save} dirty={dirty} valid={valid} cta={cta}
      footer={<><Cancel onClick={close} />{f.type === 'Fuel' && <span className="mono" style={{ marginLeft: 'auto', textAlign: 'right', fontSize: 13, fontWeight: 600, color: (byPpu ? ppu && c : gal && c) ? 'var(--warn)' : 'var(--mut)' }}>{calcTxt}</span>}</>}>
      {f.isCheck && !f.checks?.length && <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {(['pass', 'fail'] as const).map(k => { const on = f.result === k, col = k === 'pass' ? 'var(--up)' : 'var(--down)'; return (
            <button key={k} type="button" className="plain" onClick={() => up({ result: k, title: k === 'pass' ? f.passTitle || f.title : f.result === 'fail' ? f.title : `Fix: ${f.passTitle || f.title}` })}
              style={{ height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 16, fontWeight: 700, border: `2px solid ${on ? col : 'var(--line2)'}`, background: on ? (k === 'pass' ? 'rgba(63,207,142,.14)' : 'rgba(242,104,95,.14)') : 'transparent', color: on ? col : 'var(--mut)' }}>
              <Icon n={k === 'pass' ? 'check' : 'x'} s={18} w={2.4} />{k === 'pass' ? 'Pass' : 'Fail'}</button>); })}
        </div>
        <span style={{ fontSize: 12, color: 'var(--mut)' }}>{fail ? 'Adds a high-priority task to the top of the Backlog. The check is rescheduled.' : 'Logs the check in service history and schedules the next one.'}</span>
      </>}
      {banner && <div role="status" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 12, background: 'rgba(63,207,142,.1)', color: 'var(--up)', fontSize: 13, lineHeight: 1.45 }}><Icon n="check" s={16} style={{ flex: 'none', marginTop: 1 }} /><span>{banner}</span></div>}

      {!f.fuelMode && !f.isCheck && active.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="label">Due on this car — tap the one you're doing</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {active.slice(0, 6).map(({ r, i }) => { const on = f.fromReminder === r.id; return (
              <button key={r.id} type="button" className="plain chip" aria-pressed={on} onClick={() => { setMatch({ auto: false, touched: true }); up({ fromReminder: on ? '' : r.id, title: on ? f.title : f.title || r.title }); }}
                style={{ boxSizing: 'content-box', height: 30, padding: '0 12px', borderRadius: 999, border: `1px solid ${on ? 'var(--acc)' : 'var(--line2)'}`, background: on ? 'var(--accs)' : 'transparent', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: i.color }} />{r.title}<span className="mut">{i.short}</span></button>); })}
          </div>
        </div>
      )}

      <Grid end>
        {!f.fuelMode && !fail && <L label="Type"><select className="field" style={sel} value={f.type} onChange={e => auto({ type: e.target.value as RecForm['type'] })}><option>Service</option><option>Repair</option><option>Inspection</option><option value="Upgrade">Update / Modification</option><option>Registration</option><option>Insurance</option><option>Other</option></select></L>}
        <L label="Date"><input className="field" type="date" value={f.date} onChange={e => up({ date: e.target.value })} /></L>
        {!f.fuelMode && <L label={fail ? 'What needs fixing' : 'Description'} full><input className="field" required placeholder="Oil and filter change" value={f.title} onChange={e => auto({ title: e.target.value })} /></L>}
        {!fail && tpl.odo !== false && <L label={`Odometer (${u})`}>
          <input className="field" aria-label={`Odometer (${u})`} type="number" style={mono} placeholder={f.fuelMode ? 'Last: ' + Number(v.odometer || 0).toLocaleString() + ' — read it off the dash' : ''} value={f.odo} onChange={e => up({ odo: e.target.value, odoErr: '' } as Partial<RecForm>)} />
          {odoErr && <span role="alert" style={{ fontSize: 12, color: 'var(--down)' }}>{odoErr}</span>}
        </L>}
        {(fail || tpl.cost !== false) && <L label={fail ? 'Estimated cost' : 'Cost'}>
          <input className="field" aria-label={fail ? 'Estimated cost' : 'Cost'} type="number" step="0.01" style={mono} value={costShown} onChange={e => up({ cost: e.target.value, costTouched: e.target.value !== '' })} />
          {autoCost > 0 && <span style={{ fontSize: 12, color: 'var(--mut)', textTransform: 'none', letterSpacing: 0, fontFamily: 'Geist, sans-serif' }}>Parts {calc.money(autoCost - lb, true)} + labour {calc.money(lb, true)}. Type over it to set your own.</span>}
        </L>}
        {f.type === 'Fuel' && !fail && <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <span className="label">{byPpu ? `Price per ${vol}` : `Fuel added (${vol})`}</span>
            <div role="tablist" style={{ display: 'flex', gap: 2, padding: 2, background: 'var(--card2)', borderRadius: 8 }}>
              {([['vol', vol + ' added'], ['ppu', cur + '/' + vol]] as const).map(([k, l]) => { const on = (f.fuelBy || 'vol') === k; return <button key={k} type="button" role="tab" aria-selected={on} className="plain mono" onClick={() => up({ fuelBy: k })} style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, background: on ? 'var(--acc)' : 'transparent', color: on ? 'var(--accfg)' : 'var(--mut)' }}>{l}</button>; })}
            </div>
          </div>
          {byPpu ? <input className="field" aria-label={`Price per ${vol}`} type="number" step="0.001" style={mono} value={f.ppu || ''} onChange={e => up({ ppu: e.target.value })} />
            : <input className="field" aria-label={`Fuel added (${vol})`} type="number" step="0.01" style={mono} value={f.gallons || ''} onChange={e => up({ gallons: e.target.value })} />}
        </div>}
        {f.fuelMode && <>
          <L label="Fuel grade"><select className="field" style={sel} value={f.title} onChange={e => up({ title: e.target.value })}>{[...new Set([f.title, lastGrade(g, vid), ...FUELS])].filter(Boolean).map(x => <option key={x}>{x}</option>)}</select></L>
          <button type="button" className="plain" aria-pressed={!!f.partial} onClick={() => up({ partial: !f.partial })} style={{ height: 40, padding: '0 12px', borderRadius: 10, background: 'var(--card2)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Tick on={!!f.partial} /><span style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}><span style={{ fontSize: 13 }}>Partial fill</span><span style={{ fontSize: 11, color: 'var(--mut)' }}>Didn't fill to the top — left out of {u === 'km' ? 'L/100km' : 'mpg'}</span></span>
          </button>
          <button type="button" className="plain" aria-pressed={!!f.missed} onClick={() => up({ missed: !f.missed })} style={{ minHeight: 40, padding: '6px 12px', borderRadius: 10, background: 'var(--card2)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Tick on={!!f.missed} /><span style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}><span style={{ fontSize: 13 }}>Missed a fill-up before this one</span><span style={{ fontSize: 11, color: 'var(--mut)' }}>Forgot to log one — economy restarts from here</span></span>
          </button>
        </>}
        {showLinks && <>
          <L label="Done by"><select className="field" style={sel} value={f.where || 'diy'} onChange={e => up({ where: e.target.value as 'diy' | 'shop' })}><option value="diy">Me / DIY</option><option value="shop">A workshop</option></select></L>
          <L label="Completes reminder"><select className="field" style={sel} value={f.fromReminder || ''} onChange={e => { setMatch({ auto: false, touched: true }); up({ fromReminder: e.target.value }); }}><option value="">None</option>{active.map(x => <option key={x.r.id} value={x.r.id}>{x.r.title} · {x.i.short}</option>)}</select></L>
          <L label="Link to task"><select className="field" style={sel} value={f.linkTask || ''} onChange={e => up({ linkTask: e.target.value })}><option value="">None</option>{(['progress', 'parts', 'backlog'] as const).flatMap(k => (g.boards[vid]?.[k] || []).map(c => <option key={c.id} value={c.id}>{c.title} · {COLNAME[k]}</option>))}</select></L>
        </>}
        {tpl.notes !== false && <L label="Notes" full><input className="field" placeholder={f.fuelMode ? 'Station, or anything unusual' : 'Anything worth remembering'} value={f.notes} onChange={e => up({ notes: e.target.value })} /></L>}
      </Grid>

      {!!f.checks?.length && (() => {
        const cs = f.checks!, pN = cs.filter(x => x.state === 'pass').length, fN = cs.filter(x => x.state === 'fail').length;
        const setSt = (i: number, val: 'pass' | 'fail') => {
          const checks = cs.map((y, j) => (j === i ? { ...y, state: y.state === val ? undefined : val } : y)), failed = checks.filter(y => y.state === 'fail'), pt = f.passTitle || f.title;
          up({ checks, result: failed.length ? 'fail' : 'pass', title: failed.length ? 'Fix: ' + (failed.length === 1 ? failed[0].text : pt) : pt });
        };
        return <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Head label="Checklist" count={f.isCheck ? [pN ? pN + ' pass' : '', fN ? fN + ' fail' : '', cs.length - pN - fN ? cs.length - pN - fN + ' to check' : ''].filter(Boolean).join(' · ') : `${cs.filter(x => x.done).length} of ${cs.length} done`} />
          {cs.map((x, i) => f.isCheck ? (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 6px 6px 12px', borderRadius: 12, background: 'var(--card2)', border: `1px solid ${x.state === 'fail' ? 'rgba(242,104,95,.45)' : x.state === 'pass' ? 'rgba(63,207,142,.35)' : 'transparent'}` }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{x.text}</span>
              {(['pass', 'fail'] as const).map(k => { const on = x.state === k, col = k === 'pass' ? 'var(--up)' : 'var(--down)'; return <button key={k} type="button" className="plain" aria-pressed={on} onClick={() => setSt(i, k)} style={{ height: 32, padding: '0 12px', borderRadius: 9, display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, border: `1.5px solid ${on ? col : 'var(--line2)'}`, background: on ? (k === 'pass' ? 'rgba(63,207,142,.16)' : 'rgba(242,104,95,.16)') : 'transparent', color: on ? col : 'var(--mut)' }}><Icon n={k === 'pass' ? 'check' : 'x'} s={14} w={2.4} />{k === 'pass' ? 'Pass' : 'Fail'}</button>; })}
            </div>
          ) : (
            <button key={i} type="button" className="plain" aria-pressed={!!x.done} onClick={() => up({ checks: cs.map((y, j) => (j === i ? { ...y, done: !y.done } : y)) })} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'var(--card2)' }}>
              <span style={{ width: 20, height: 20, flex: 'none', borderRadius: 6, border: `2px solid ${x.done ? 'var(--up)' : 'var(--line2)'}`, background: x.done ? 'var(--up)' : 'transparent', color: '#0d0e10', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{x.done && <Icon n="check" s={12} w={3} />}</span>
              <span style={{ fontSize: 14, color: x.done ? 'var(--mut)' : 'var(--fg)', textDecoration: x.done ? 'line-through' : 'none' }}>{x.text}</span>
            </button>
          ))}
          {f.isCheck && <span style={{ fontSize: 12, color: fN ? 'var(--down)' : 'var(--mut)' }}>{fN ? 'A failed item adds a high-priority fix to the top of the Backlog. The check is rescheduled.' : 'Mark each item. All passing logs the check and schedules the next one.'}</span>}
        </div>;
      })()}

      {showUsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Head label="Parts used" count={usedRows.length ? `${usedRows.length} · ${calc.money(usedTotal, true)}` : ''} />
          {usedRows.map(r => (
            <div key={r.key} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 8px 8px 12px', borderRadius: 10, background: 'var(--card2)' }}>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}><span style={{ fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span><span className="mono mut" style={{ fontSize: 11 }}>{r.meta}</span></span>
              <span className="mono" style={{ fontSize: 13, flex: 'none' }}>{r.c ? calc.money(r.c, true) : '—'}</span>
              <button type="button" className="plain ghost-del" onClick={r.remove} title="Remove from this entry" aria-label="Remove from this entry" style={{ width: 28, height: 28, flex: 'none', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mut)' }}><Icon n="x" s={13} /></button>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr) 90px auto', gap: 6, alignItems: 'center' }}>
            <select aria-label="Add from parts list" className="field" value="" onChange={e => e.target.value && up({ usedParts: [...ids, e.target.value] })} style={{ height: 36, padding: '0 8px', fontSize: 13 }}>
              <option value="">{avail.length ? 'Add from parts list…' : 'Parts list is empty'}</option>{avail.map(p => <option key={p.id} value={p.id}>{p.name || 'Untitled'} · {p.status}</option>)}
            </select>
            <input aria-label="New part" className="field" placeholder="or a new part" value={np.name} onChange={e => setNp({ ...np, name: e.target.value })} style={{ height: 36, padding: '0 10px', fontSize: 13 }} />
            <input aria-label="New part price" className="field" type="number" step="0.01" placeholder="Price" value={np.cost} onChange={e => setNp({ ...np, cost: e.target.value })} style={{ height: 36, padding: '0 10px', fontSize: 13, ...mono }} />
            <button type="button" className="plain" onClick={() => { if (!np.name.trim()) return; up({ newParts: [...nps, { id: 'n' + uid(), name: np.name.trim(), cost: np.cost }] }); setNp({ name: '', cost: '' }); }} style={{ height: 36, padding: '0 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', background: np.name.trim() ? 'var(--acc)' : 'var(--card)', color: np.name.trim() ? 'var(--accfg)' : 'var(--mut)' }}>Add</button>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="label">Labour</span>
            <input aria-label="Labour" className="field" type="number" step="0.01" min="0" placeholder="0" value={f.labour || ''} onChange={e => up({ labour: e.target.value })} style={{ height: 36, width: 120, padding: '0 10px', fontSize: 13, ...mono }} />
            <span style={{ fontSize: 12, color: 'var(--mut)' }}>Workshop or your own time. Added to the cost.</span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--mut)' }}>{usedRows.length ? `Saved parts are marked Installed and linked to this entry.${usedTotal && !+f.cost ? ` Parts come to ${cur}${usedTotal.toFixed(2)}.` : ''}` : 'Pick from this car’s parts list, or type a new one.'}</span>
        </div>
      )}
    </Shell>
  );
}

// ---------- History entry (read only) ----------
function EntryDialog({ d, calc, store, nav, narrow, close }: P<Extract<Dlg, { kind: 'entry' }>>) {
  const g = calc.g, r = g.records.find(x => x.id === d.id);
  if (!r) return null;
  const card = Object.values(g.boards[r.vid] || {}).flat().find(c => c.autoRec === r.id || (r.cardId && c.id === r.cardId));
  const own = g.parts.filter(p => p.recId === r.id && (!card || p.cardId !== card.id));
  const cardParts = card ? g.parts.filter(p => p.cardId === card.id) : [];
  const cks = r.checks || [], pf = r.type === 'Inspection', by = g.users.find(x => x.id === r.by);
  const facts = [{ k: 'Date', v: fdate(r.date) }, { k: 'Odometer', v: calc.dist(r.odo) }, { k: 'Cost', v: calc.money(r.cost, true) }, ...(r.type === 'Fuel' && r.gallons ? [{ k: 'Fuel', v: r.gallons + ' ' + (calc.u === 'km' ? 'L' : 'gal') }] : [])];
  const del = () => nav.ask({ title: 'Delete this entry?', body: `“${r.title}” · ${fdate(r.date)} will be removed from service history, with its attachments. This can’t be undone.`, label: 'Delete entry', fn: () => { store.update(g2 => track({ ...g2, records: g2.records.filter(x => x.id !== r.id) }, null, r.vid, `deleted entry "${r.title}"`)); close(); } });
  const line = (p: typeof own[0]) => <div key={p.id} className="row" style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, padding: '6px 0' }}><span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name || 'Untitled part'} <span className="mono mut" style={{ fontSize: 11 }}>{[p.partNo, p.qty > 1 ? '×' + p.qty : ''].filter(Boolean).join(' ')}</span></span><span className="mono" style={{ fontSize: 12 }}>{+p.cost ? calc.money(+p.cost * (p.qty || 1), true) : '—'}</span></div>;
  return (
    <Shell title={r.title} byLine={[fdate(r.date), by ? 'logged by ' + by.name : ''].filter(Boolean).join(' · ')} narrow={narrow} onClose={close} onSave={close} dirty={false} valid cta="Close" footer={<DelLink onClick={del}>Delete entry</DelLink>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 999, background: tint(TCOL[r.type] || '#8d9099', '22'), color: TCOL[r.type] || '#8d9099' }}>{r.type === 'Upgrade' ? 'Update / Modification' : r.type}</span>
        {r.where && <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 999, background: 'var(--card2)', color: 'var(--mut)' }}>{r.where === 'shop' ? 'Workshop' : 'DIY'}</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--mut)' }}>Read only</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8 }}>
        {facts.map(x => <div key={x.k} style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--card2)', display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}><span className="label">{x.k}</span><span className="mono" style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.v}</span></div>)}
      </div>
      {r.notes && <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span className="label">Notes</span><div style={{ fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.notes}</div></div>}
      {cks.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Head label="Checklist" count={`${cks.filter(c => c.done).length} of ${cks.length} ${pf ? 'passed' : 'done'}`} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '4px 16px' }}>{cks.map((c, i) => <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13, padding: '3px 0' }}><span className="mono" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', minWidth: 34, color: c.done ? 'var(--up)' : 'var(--down)' }}>{c.done ? (pf ? 'Pass' : 'Done') : pf ? 'Fail' : 'Skip'}</span><span>{c.text}</span></div>)}</div>
      </div>}
      {own.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><Head label="Parts used" count={calc.money(own.reduce((a, p) => a + +(p.cost || 0) * (p.qty || 1), 0), true)} />{own.map(line)}</div>}
      {card && <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 14, border: '1px solid var(--line)', background: 'var(--card2)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}><span className="label">From the build board</span><div style={{ fontWeight: 600, fontSize: 15, marginTop: 2 }}>{card.title}</div><div style={{ fontSize: 12, color: 'var(--mut)' }}>{[card.type, card.priority + ' priority', card.doneAt ? 'done ' + fdate(card.doneAt) : ''].filter(Boolean).join(' · ')}</div></div>
        </div>
        {card.note && <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{card.note}</div>}
        {cardParts.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span className="label">Parts · {calc.money(partsTotal(g, card.id), true)}</span>{cardParts.map(line)}</div>}
      </div>}
    </Shell>
  );
}

// ---------- Task ----------
type PM = { id?: string; name: string; url: string; cost: string; qty: string; status: (typeof PSTAT)[number] };
function CardDialog({ d, set, calc, store, me, nav, narrow, close, done, dirty }: P<Extract<Dlg, { kind: 'card' }>>) {
  const g = calc.g, f = d.form, vid = d.vid, cid = f.id || f.pid!;
  const [pm, setPm] = useState<PM | null>(null);
  const [newNote, setNewNote] = useState('');
  const up = (p: Partial<CardForm>) => set({ ...d, form: { ...f, ...p } });
  const ps = g.parts.filter(p => p.cardId === cid), ptot = partsTotal(g, cid), lb = +f.labour || 0;
  const users = g.users.filter(x => !x.removed);
  const who = (id?: string | null) => g.users.find(x => x.id === id) || { name: 'Someone', color: '#8d9099' };
  // Changes to an existing task's activity are saved straight away, like parts.
  const patchActivity = (activity: CardForm['activity']) => {
    up({ activity });
    if (f.id) store.update(g2 => { const b = structuredClone(g2.boards[vid]); (Object.keys(b) as (keyof typeof b)[]).forEach(k => { b[k] = b[k].map(x => (x.id === f.id ? { ...x, activity } : x)); }); return { ...g2, boards: { ...g2.boards, [vid]: b } }; });
  };
  const addEvent = (text: string) => patchActivity([...f.activity, ev(text, me.id)]);
  const save = () => { if (!f.title.trim()) return; store.update(g2 => saveCard(g2, vid, f, me.id, calc.TODAY)); done(); };
  const savePm = (e: FormEvent) => {
    e.preventDefault(); e.stopPropagation(); if (!pm || !pm.name.trim()) return;
    const data = { name: pm.name.trim(), url: pm.url.trim(), cost: +pm.cost || 0, qty: Math.max(1, +pm.qty || 1), status: pm.status };
    store.update(g2 => ({ ...g2, parts: pm.id ? g2.parts.map(x => (x.id === pm.id ? { ...x, ...data } : x)) : [...g2.parts, { id: uid(), vid, cardId: cid, partNo: '', vendor: '', by: me.id, at: new Date().toISOString(), ...data }] }));
    addEvent(pm.id ? `Edited part “${data.name}”` : `Added part “${data.name}” to the parts list`);
    setPm(null);
  };
  const cycle = (id: string, cur: PM['status'], name: string) => {
    const nx = PSTAT[(PSTAT.indexOf(cur) + 1) % PSTAT.length];
    const r = setPartStatus(g, id, nx, me.id);
    store.update(() => r.g);
    if (!f.id) { addEvent(`Marked “${name}” as ${nx === 'In stock' ? 'in stock' : nx.toLowerCase()}`); return; }
    // Keep the dialog's copy of the task in step with the events setPartStatus added on the board.
    const onBoard = Object.values(r.g.boards[vid]).flat().find(x => x.id === f.id)?.activity || [];
    const activity = [...f.activity, ...onBoard.filter(a => !f.activity.some(x => x.id === a.id))].sort((a, b) => a.at.localeCompare(b.at));
    up({ activity, ...(r.moved ? { col: 'parts' as const, origCol: 'parts' as const, origIdx: 0 } : {}) });
  };
  const notes = f.activity.filter(a => a.kind === 'note').length;
  const visible = f.activity.filter(a => !/^Task created|^Created from/.test(a.text));
  const created = f.activity.find(a => /^Task created|^Created from/.test(a.text));
  const creator = f.id ? (f.createdBy ? who(f.createdBy) : { name: 'Someone', color: '#8d9099' }) : me;
  const needN = ps.filter(p => p.status === 'Needed').length;
  const ftime = (iso: string) => { const x = new Date(iso); return x.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' }) + ' · ' + x.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }); };
  const sm = { height: 36 };

  return <>
    <Shell title={f.id ? 'Edit task' : 'New task'} byLine={f.createdBy ? `Added by ${f.createdBy === me.id ? 'You' : who(f.createdBy).name}` : undefined} width={940} narrow={narrow} onClose={close} onSave={save} dirty={dirty} valid={!!f.title.trim()} cta={f.id ? 'Save task' : 'Add task'}
      footer={<><Cancel onClick={close} />{f.id && <DelLink onClick={() => nav.ask({ title: 'Delete this task?', body: `“${f.title || 'Untitled'}” and its photos and notes will be removed from the board. Service history is not affected.`, label: 'Delete task', fn: () => { store.update(g2 => deleteCard(g2, vid, f.id!)); close(); } })}>Delete card</DelLink>}</>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,380px),1fr))', gap: '16px 22px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <L label="Task"><input className="field" required placeholder="Install coilovers" value={f.title} onChange={e => up({ title: e.target.value })} style={{ height: 42, fontSize: 16, fontWeight: 600 }} /></L>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,120px),1fr))', gap: 10 }}>
            <L label="Type"><select className="field" style={{ ...sm, ...sel }} value={f.type} onChange={e => up({ type: e.target.value })}>{['Upgrade', 'Repair', 'Maintenance', 'Bodywork', 'Electrical', 'Interior'].map(x => <option key={x}>{x}</option>)}</select></L>
            <L label="Priority"><select className="field" style={{ ...sm, ...sel }} value={f.priority} onChange={e => up({ priority: e.target.value as CardForm['priority'] })}><option>High</option><option>Medium</option><option>Low</option></select></L>
            <L label="Column"><select className="field" style={{ ...sm, ...sel }} value={f.col} onChange={e => up({ col: e.target.value as CardForm['col'] })}><option value="backlog">Backlog</option><option value="parts">Waiting on parts</option><option value="progress">In progress</option><option value="done">Done</option></select></L>
            <L label={`Labour (${calc.cur})`}><input className="field" type="number" min="0" placeholder="0" value={f.labour} onChange={e => up({ labour: e.target.value })} style={{ ...sm, ...mono }} /></L>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span className="label">Estimate</span>
              <div title={`Parts ${calc.money(ptot, true)} + labour ${calc.money(lb, true)}`} className="mono" style={{ height: 36, borderRadius: 10, border: '1px dashed var(--line2)', padding: '0 12px', display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 600 }}>{calc.money(ptot + lb, true)}</div>
              <span style={{ fontSize: 11, color: 'var(--mut)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Parts {calc.money(ptot, true)} + labour {calc.money(lb, true)}</span>
            </div>
            <L label="Assigned to"><select className="field" style={{ ...sm, ...sel }} value={f.assignee} onChange={e => up({ assignee: e.target.value })}><option value="">Nobody</option>{users.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></L>
            <L label="Target date"><input className="field" type="date" style={sm} value={f.due} onChange={e => up({ due: e.target.value })} /></L>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="label">Until this is fixed, the car is good for</span>
            <div role="radiogroup" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 6 }}>
              {(Object.keys(DRIVE) as Drive[]).map(k => { const on = (f.drive || 'N/A') === k, c = DRIVE[k].color; return (
                <button key={k} type="button" role="radio" aria-checked={on} className="plain" onClick={() => up({ drive: k })} style={{ padding: '7px 10px', borderRadius: 10, border: `2px solid ${on ? c : 'var(--line2)'}`, background: on ? tint(c, '1a') : 'transparent', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: on ? c : 'var(--fg)' }}>{k}</span><span style={{ fontSize: 11, color: 'var(--mut)' }}>{DRIVE[k].hint}</span>
                </button>); })}
            </div>
          </div>
          <L label="Description"><textarea className="field" value={f.note} onChange={e => up({ note: e.target.value })} style={{ height: 'auto', minHeight: 64, padding: '10px 12px', resize: 'vertical' }} /></L>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span className="label">Parts for this task</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{needN > 0 && <button type="button" className="btn-p" onClick={nav.soon} style={{ height: 28, padding: '0 12px', fontSize: 12 }}>Order {needN} needed</button>}<span className="mono mut" style={{ fontSize: 11 }}>{ps.length ? `${ps.length} · ${calc.money(ptot, true)}` : ''}</span></span>
            </div>
            {ps.map(p => { const url = p.url; return (
              <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 12, background: 'var(--card2)' }}>
                <button type="button" className="plain to-acc" onClick={() => setPm({ id: p.id, name: p.name, url: p.url || '', cost: p.cost === 0 || p.cost === '' ? '' : String(p.cost), qty: String(p.qty || 1), status: p.status })} title="Edit part" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name || 'Untitled part'}</span>
                  <span className="mono mut" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[p.qty > 1 ? 'Qty ' + p.qty : '', url ? url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : ''].filter(Boolean).join(' · ') || 'No link'}</span>
                </button>
                {/^https?:\/\//i.test(url) && <a href={url} target="_blank" rel="noopener noreferrer" title="Open link" aria-label="Open link" style={{ width: 32, height: 32, flex: 'none', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--acc)' }}><Icon n="arrow" s={15} /></a>}
                <span className="mono" style={{ fontSize: 13, flex: 'none' }}>{+p.cost ? calc.money(+p.cost * (p.qty || 1), true) : '—'}</span>
                <button type="button" className="plain" onClick={() => cycle(p.id, p.status, p.name)} title="Click to change status" style={{ height: 26, padding: '0 10px', flex: 'none', borderRadius: 999, fontSize: 11, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', background: tint(PCOL[p.status], '22'), color: PCOL[p.status] }}>{p.status}</button>
                <button type="button" className="plain ghost-del" onClick={() => store.update(g2 => ({ ...g2, parts: g2.parts.filter(x => x.id !== p.id) }))} title="Remove" aria-label="Remove part" style={{ width: 30, height: 30, flex: 'none', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mut)' }}><Icon n="x" s={14} /></button>
              </div>); })}
            <button type="button" className="dashed" onClick={() => setPm({ name: '', url: '', cost: '', qty: '1', status: 'Needed' })} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', borderRadius: 10, fontSize: 13 }}><Icon n="plus" s={15} />Add part</button>
            <span style={{ fontSize: 12, color: 'var(--mut)' }}>Click a part to edit it. The estimate is the parts total plus labour. Parts also appear in the Parts tab.</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <Head label="Activity" count={notes ? `${notes} note${notes > 1 ? 's' : ''}` : ''} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea aria-label="Add an update" className="field" placeholder="Add an update — what you did, what you found, what's next…" value={newNote} onChange={e => setNewNote(e.target.value)} style={{ height: 'auto', minHeight: 70, padding: '10px 12px', fontSize: 13, resize: 'vertical' }} />
              <button type="button" className="plain" onClick={() => { const t = newNote.trim(); if (!t) return; patchActivity([...f.activity, ev(t, me.id, 'note')]); setNewNote(''); }} style={{ alignSelf: 'flex-end', height: 36, padding: '0 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, background: newNote.trim() ? 'var(--acc)' : 'var(--card2)', color: newNote.trim() ? 'var(--accfg)' : 'var(--mut)' }}>Add note</button>
            </div>
            {visible.map(a => { const w = a.by === me.id ? { name: 'You', color: me.color } : who(a.by); return a.kind === 'note' ? (
              <div key={a.id} style={{ display: 'flex', gap: 10 }}>
                <span style={{ width: 28, height: 28, flex: 'none', borderRadius: '50%', background: w.color, color: '#0d0e10', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{w.name[0].toUpperCase()}</span>
                <div style={{ flex: 1, minWidth: 0, background: 'var(--card2)', border: '1px solid var(--line)', borderRadius: '4px 12px 12px 12px', padding: '10px 12px' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 4 }}><span style={{ fontWeight: 600, fontSize: 13 }}>{w.name}</span><span className="mono mut" style={{ fontSize: 10 }}>{ftime(a.at)}</span>
                    <button type="button" className="plain ghost-del" onClick={() => nav.ask({ title: 'Delete this note?', body: 'The note will be removed from the activity log.', label: 'Delete note', fn: () => patchActivity(f.activity.filter(x => x.id !== a.id)) })} style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--mut)' }}>Delete</button></div>
                  <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{a.text}</div>
                </div>
              </div>
            ) : (
              <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', paddingLeft: 9, fontSize: 12, color: 'var(--mut)' }}>
                <span style={{ width: 10, height: 10, flex: 'none', borderRadius: '50%', border: `2px solid ${/Done/.test(a.text) || /installed/i.test(a.text) ? 'var(--up)' : /photo/i.test(a.text) ? 'var(--warn)' : /part/i.test(a.text) ? '#e8b04b' : 'var(--acc)'}` }} />
                <span style={{ flex: 1 }}><b style={{ color: 'var(--fg)', fontWeight: 500 }}>{w.name}</b> · {a.text}</span><span className="mono" style={{ fontSize: 10 }}>{ftime(a.at)}</span>
              </div>); })}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingLeft: 9, fontSize: 12, color: 'var(--mut)' }}>
              <span style={{ width: 10, height: 10, flex: 'none', borderRadius: '50%', background: creator.color }} />
              <span style={{ flex: 1 }}><b style={{ color: 'var(--fg)', fontWeight: 500 }}>{f.id ? (f.createdBy === me.id ? 'You' : creator.name) : 'You'}</b> · {f.id ? (created ? created.text.replace('Task created', 'Created task') : 'Created this task') : 'Creating this task'}</span>
              <span className="mono" style={{ fontSize: 10 }}>{f.createdAt || created ? ftime(f.createdAt || created!.at) : f.id ? 'before tracking' : 'now'}</span>
            </div>
            {!visible.length && <span style={{ fontSize: 12, color: 'var(--mut)' }}>No updates yet.</span>}
          </div>
        </div>
      </div>
    </Shell>
    {pm && (
      <div onClick={() => setPm(null)} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <form role="dialog" aria-modal="true" aria-label={pm.id ? 'Edit part' : 'Add part'} onClick={e => e.stopPropagation()} onSubmit={savePm} style={{ width: 'min(440px,100%)', background: 'var(--card)', border: '1px solid var(--line2)', borderRadius: 22, padding: 22, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 24px 60px rgba(0,0,0,.5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><span style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 22 }}>{pm.id ? 'Edit part' : 'Add part'}</span><button type="button" className="plain icon-btn" onClick={() => setPm(null)} title="Close" aria-label="Close"><Icon n="x" /></button></div>
          <L label="Part"><input className="field" required autoFocus placeholder="Front brake pads" value={pm.name} onChange={e => setPm({ ...pm, name: e.target.value })} /></L>
          <L label="Link"><input className="field" placeholder="https://…" value={pm.url} onChange={e => setPm({ ...pm, url: e.target.value })} /></L>
          <Grid cols="minmax(0,1fr) 80px minmax(0,1fr)">
            <L label={`Price (${calc.cur})`}><input className="field" type="number" step="0.01" style={mono} value={pm.cost} onChange={e => setPm({ ...pm, cost: e.target.value })} /></L>
            <L label="Qty"><input className="field" type="number" min="1" style={mono} value={pm.qty} onChange={e => setPm({ ...pm, qty: e.target.value })} /></L>
            <L label="Status"><select className="field" style={sel} value={pm.status} onChange={e => setPm({ ...pm, status: e.target.value as PM['status'] })}>{PSTAT.map(x => <option key={x}>{x}</option>)}</select></L>
          </Grid>
          <span style={{ fontSize: 12, color: 'var(--mut)' }}>The price × qty is added to the task estimate.</span>
          <div style={{ display: 'flex', gap: 8 }}><button type="submit" className="btn-p" style={{ height: 40, padding: '0 20px' }}>{pm.id ? 'Save part' : 'Add part'}</button><Cancel onClick={() => setPm(null)} /></div>
        </form>
      </div>
    )}
  </>;
}

// ---------- Reminder ----------
function ReminderDialog({ d, set, calc, store, me, nav, narrow, close, dirty }: P<Extract<Dlg, { kind: 'reminder' }>>) {
  const f = d.form, u = calc.u, up = (p: Partial<RemForm>) => set({ ...d, form: { ...f, ...p } });
  const addItem = () => { const t = f.newItem.trim(); if (t) up({ checklist: [...f.checklist, t], newItem: '' }); };
  const save = () => { if (!f.title.trim()) return; store.update(g2 => saveReminder(g2, d.vid, f, me.id)); close(); };
  // Log it now with whatever is in the form.
  const todo = () => {
    const r = calc.g.reminders.find(x => x.id === f.id); if (!r) return;
    const v = calc.g.vehicles.find(x => x.id === d.vid)!;
    nav.open({ kind: 'record', vid: d.vid, form: remForm({ ...r, title: f.title.trim() || r.title, checklist: f.checklist.filter(Boolean) }, calc.stats(v).odo, calc.TODAY) });
  };
  const rep = !!(+f.repeatDays || +f.repeatDist), has = !!f.newItem.trim();
  return (
    <Shell title={f.id ? 'Edit reminder' : 'New reminder'} narrow={narrow} onClose={close} onSave={save} dirty={dirty} valid={!!f.title.trim()} cta={f.id ? 'Save reminder' : 'Add reminder'}
      footer={<><Cancel onClick={close} />{f.id && <button type="button" className="plain" onClick={todo} title="Log this job now" style={{ marginLeft: 'auto', height: 40, padding: '0 16px', borderRadius: 999, border: '1px solid var(--acc)', color: 'var(--acc)', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}><Icon n="check" s={15} />Create To-do</button>}</>}>
      <Grid>
        <L label="Reminder" full><input className="field" required placeholder="Valve adjustment" value={f.title} onChange={e => up({ title: e.target.value })} /></L>
        <L label="Due date"><input className="field" type="date" value={f.dueDate} onChange={e => up({ dueDate: e.target.value })} /></L>
        <L label={`Or at (${u})`}><input className="field" type="number" style={mono} value={f.dueOdo} onChange={e => up({ dueOdo: e.target.value })} /></L>
      </Grid>
      <Grid>
        <L label="Repeat every (days)"><input className="field" type="number" min="0" placeholder="e.g. 182" style={mono} value={f.repeatDays} onChange={e => up({ repeatDays: e.target.value })} /></L>
        <L label={`Repeat every (${u})`}><input className="field" type="number" min="0" placeholder="e.g. 5000" style={mono} value={f.repeatDist} onChange={e => up({ repeatDist: e.target.value })} /></L>
      </Grid>
      {rep && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}><div style={{ fontSize: 14 }}>Next due counts from</div><div style={{ fontSize: 12, color: 'var(--mut)' }}>{f.repeatFrom === 'fixed' ? 'Keeps the original schedule, even if you do it early or late' : 'Counts from the date and odometer when you log it'}</div></div>
        <div role="radiogroup" style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--card2)', borderRadius: 12 }}>
          {([['done', 'When it’s done'], ['fixed', 'Fixed schedule']] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={f.repeatFrom === k} className="plain" onClick={() => up({ repeatFrom: k })} style={{ padding: '6px 12px', borderRadius: 9, fontSize: 13, background: f.repeatFrom === k ? 'var(--acc)' : 'transparent', color: f.repeatFrom === k ? 'var(--accfg)' : 'var(--mut)' }}>{l}</button>)}
        </div>
      </div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="label">When marking done, ask for</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {([['cost', 'Cost'], ['odo', 'Odometer'], ['notes', 'Notes']] as const).map(([k, l]) => { const on = f.tpl[k]; return <button key={k} type="button" className="plain" aria-pressed={on} onClick={() => up({ tpl: { ...f.tpl, [k]: !on } })} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 999, border: `1px solid ${on ? 'var(--acc)' : 'var(--line2)'}`, background: on ? 'var(--accs)' : 'transparent', color: on ? 'var(--fg)' : 'var(--mut)', fontSize: 13 }}>{on && <Icon n="check" s={13} w={2.4} />}{l}</button>; })}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Head label="Checklist" count={f.checklist.length ? `${f.checklist.length} item${f.checklist.length > 1 ? 's' : ''}` : ''} />
        {f.checklist.map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ width: 18, height: 18, flex: 'none', borderRadius: 5, border: '2px solid var(--line2)' }} />
            <input aria-label={`Checklist item ${i + 1}`} className="field" value={t} onChange={e => up({ checklist: f.checklist.map((x, j) => (j === i ? e.target.value : x)) })} style={{ height: 36, flex: 1, fontSize: 13 }} />
            <button type="button" className="plain ghost-del" onClick={() => up({ checklist: f.checklist.filter((_, j) => j !== i) })} title="Remove" aria-label="Remove item" style={{ width: 32, height: 32, flex: 'none', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mut)' }}><Icon n="x" s={14} /></button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ width: 18, height: 18, flex: 'none', borderRadius: 5, border: '2px dashed var(--line2)' }} />
          <input aria-label="New checklist item" className="field" placeholder="Add a tick box, e.g. Inspect tyre tread" value={f.newItem} onChange={e => up({ newItem: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }} style={{ height: 36, flex: 1, fontSize: 13 }} />
          <button type="button" className="plain" onClick={addItem} style={{ height: 36, padding: '0 14px', flex: 'none', borderRadius: 999, fontSize: 13, fontWeight: 600, background: has ? 'var(--acc)' : 'var(--card2)', color: has ? 'var(--accfg)' : 'var(--mut)', display: 'flex', alignItems: 'center' }}>Add</button>
        </div>
      </div>
      <L label="Notes"><textarea className="field" placeholder="Anything to remember, e.g. use the Motul oil, check the rear diff too" value={f.notes} onChange={e => up({ notes: e.target.value })} style={{ height: 'auto', minHeight: 64, resize: 'vertical', padding: '10px 12px', lineHeight: 1.5 }} /></L>
      <button type="button" role="switch" aria-checked={f.isCheck} className="plain" onClick={() => up({ isCheck: !f.isCheck })} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', borderRadius: 12, background: 'var(--card2)' }}>
        <span><span style={{ display: 'block', fontSize: 14 }}>Pass / fail check</span><span style={{ display: 'block', fontSize: 12, color: 'var(--mut)' }}>A fail adds a fix-it task to the build board</span></span><Switch on={f.isCheck} />
      </button>
      <span style={{ fontSize: 12, color: 'var(--mut)' }}>Whichever comes first. Leave repeat blank for a one-off. When you mark it done, the next due date and reading are set from the service you log.</span>
    </Shell>
  );
}

// ---------- Odometer ----------
function OdoDialog({ d, set, calc, store, me, narrow, close, dirty }: P<Extract<Dlg, { kind: 'odo' }>>) {
  const f = d.form, u = calc.u, g = calc.g, v = g.vehicles.find(x => x.id === d.vid)!;
  const fix = f.reading !== '', nx = fix ? +f.reading : f.cur + (+f.add || 0), bad = nx < f.cur;
  const rows = [...(v.odoLog || []).map(x => ({ date: x.date, odo: +x.odo, src: x.src === 'correction' ? 'Correction' : x.src === 'import' ? 'Imported' : 'Odometer update' })),
    ...g.records.filter(r => r.vid === v.id && +r.odo > 0).map(r => ({ date: r.date, odo: +r.odo, src: r.type === 'Fuel' ? 'Fill-up' : r.title }))].sort((a, b) => b.date.localeCompare(a.date) || b.odo - a.odo).slice(0, 6);
  const save = () => { if (bad) return; store.update(g2 => setOdometer(g2, d.vid, f.cur, f.add, f.reading, me.id, calc.TODAY)); close(); };
  return (
    <Shell title="Update odometer" narrow={narrow} onClose={close} onSave={save} dirty={dirty} valid={!bad} cta="Save reading" footer={<Cancel onClick={close} />}>
      <Grid>
        <L label={`Distance driven (${u})`}><input className="field" type="number" min="0" autoFocus placeholder="e.g. 120" style={mono} value={f.add} onChange={e => set({ ...d, form: { ...f, add: e.target.value } })} /></L>
        {f.fix || fix ? <L label="Correct the reading"><input className="field" type="number" min="0" placeholder="What the dash shows" style={mono} value={f.reading} onChange={e => set({ ...d, form: { ...f, reading: e.target.value } })} /></L>
          : <button type="button" className="plain" onClick={() => set({ ...d, form: { ...f, fix: true } })} style={{ alignSelf: 'end', height: 40, fontSize: 13, color: 'var(--acc)' }}>Reading wrong? Correct it</button>}
      </Grid>
      <div className="mono" style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'var(--card2)' }}>
        <span className="mut" style={{ fontSize: 13 }}>{f.cur.toLocaleString()} {u}</span><span className="mut">→</span><span style={{ fontSize: 18, fontWeight: 700, color: bad ? 'var(--down)' : nx > f.cur ? 'var(--up)' : 'var(--fg)' }}>{nx.toLocaleString()} {u}</span>
      </div>
      {bad && <span role="alert" style={{ fontSize: 12, color: 'var(--down)' }}>That reading is lower than the current one. Odometers only go up — correct old entries in Service history instead.</span>}
      {rows.length > 0 && <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 6 }}><span className="label">Recent readings</span><span style={{ fontSize: 12, color: 'var(--mut)' }}>≈ {Math.round(calc.kmPerDay(v.id) * 7)} {u}/week</span></div>
        {rows.map((r, i) => <div key={i} className="row" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', fontSize: 13 }}><span>{fdate(r.date)} <span className="mut">· {r.src}</span></span><span className="mono">{r.odo.toLocaleString()} {u}</span></div>)}
      </div>}
    </Shell>
  );
}

// ---------- Add vehicle ----------
function VehicleDialog({ d, set, calc, store, me, nav, narrow, close, dirty }: P<Extract<Dlg, { kind: 'vehicle' }>>) {
  const f = d.form, u = calc.u, up = (p: Partial<VehForm>) => set({ ...d, form: { ...f, ...p } });
  const valid = !!(f.year && f.make.trim() && f.model.trim());
  const save = () => {
    if (!valid) return;
    const r = addVehicle(calc.g, f, me.id);
    store.update(() => r.g);
    close(); nav.go({ view: 'car', activeId: r.id, sec: 'reminders', tplOpen: true });
  };
  return (
    <Shell title="Add a vehicle" narrow={narrow} onClose={close} onSave={save} dirty={dirty} valid={valid} cta="Add to garage" footer={<Cancel onClick={close} />}>
      <Grid>
        <L label="Year"><input className="field" type="number" required value={f.year} onChange={e => up({ year: e.target.value })} /></L>
        <L label="Make"><input className="field" required value={f.make} onChange={e => up({ make: e.target.value })} /></L>
        <L label="Model"><input className="field" required value={f.model} onChange={e => up({ model: e.target.value })} /></L>
        <L label="Nickname"><input className="field" value={f.nickname} onChange={e => up({ nickname: e.target.value })} /></L>
        <L label="Use" full><select className="field" style={sel} value={f.usage} onChange={e => up({ usage: e.target.value as VehForm['usage'] })}><option value="daily">Daily — reminders rank higher</option><option value="weekend">Weekend</option><option value="track">Track</option><option value="storage">In storage</option></select></L>
        <L label="Rego number"><input className="field" placeholder="ABC-123" style={mono} value={f.plate} onChange={e => up({ plate: e.target.value })} /></L>
        <L label="Rego expiry"><input className="field" type="date" value={f.regoExpiry} onChange={e => up({ regoExpiry: e.target.value })} /></L>
        <L label={`Odometer (${u})`}><input className="field" type="number" value={f.odometer} onChange={e => up({ odometer: e.target.value })} /></L>
        <L label="Purchase price"><input className="field" type="number" value={f.purchasePrice} onChange={e => up({ purchasePrice: e.target.value })} /></L>
      </Grid>
    </Shell>
  );
}

/** Renders whichever dialog is open. Parts added to a task that's then cancelled are taken back out. */
export function Dialogs({ dlg, setDlg, calc, store, me, nav, narrow }: { dlg: Dlg; setDlg: (d: Dlg | null) => void; calc: Calc; store: Store; me: User; nav: Nav; narrow: boolean }) {
  const init = useRef(JSON.stringify(dlg));
  const kindKey = dlg.kind + ('vid' in dlg ? dlg.vid : '') + ('form' in dlg && 'id' in dlg.form ? dlg.form.id || '' : '') + ('form' in dlg && 'pid' in dlg.form ? (dlg.form as CardForm).pid || '' : '');
  useEffect(() => { init.current = JSON.stringify(dlg); }, [kindKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(dlg) !== init.current;
  const close = () => {
    if (dlg.kind === 'card' && !dlg.form.id && dlg.form.pid) { const pid = dlg.form.pid; store.update(g2 => ({ ...g2, parts: g2.parts.filter(p => p.cardId !== pid) })); }
    setDlg(null);
  };
  const common = { calc, store, me, nav, narrow, close, done: () => setDlg(null), dirty };
  switch (dlg.kind) {
    case 'record': return <RecordDialog key={kindKey} d={dlg} set={setDlg} {...common} />;
    case 'entry': return <EntryDialog d={dlg} set={setDlg} {...common} />;
    case 'card': return <CardDialog key={kindKey} d={dlg} set={setDlg} {...common} />;
    case 'reminder': return <ReminderDialog key={kindKey} d={dlg} set={setDlg} {...common} />;
    case 'odo': return <OdoDialog d={dlg} set={setDlg} {...common} />;
    case 'vehicle': return <VehicleDialog d={dlg} set={setDlg} {...common} />;
  }
}
