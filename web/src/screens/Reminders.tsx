import { useState } from 'react';
import { fdate, fmtEvery, fmtMonths, TEMPLATES, templateRem, tint, tplApplies } from '../lib/model.ts';
import { Modal } from '../ui/Dialog.tsx';
import { Icon } from '../ui/icons.tsx';
import type { Tab } from './Car.tsx';
import { newRemForm, remEditForm, remForm } from '../lib/actions.ts';

export function Reminders({ calc, car, nav, store, me }: Tab) {
  const g = calc.g, u = calc.u;
  const [tplOpen, setTplOpen0] = useState(!!nav.ui.tplOpen);
  const setTplOpen = (v: boolean) => { setTplOpen0(v); if (!v && nav.ui.tplOpen) nav.go({ tplOpen: false }); };
  const odo = calc.stats(car).odo, active = calc.activeRems(car, odo);
  const done = g.reminders.filter(r => r.vid === car.id && r.done);
  const have = new Set(active.map(x => x.r.title.toLowerCase()));
  const presets = TEMPLATES.filter(tp => tplApplies(tp, car) && !(tp[0] === 'Battery tender check' && have.has('storage check')));
  const del = (id: string, title: string, body: string) => nav.ask({ title: 'Delete this reminder?', body: `“${title}” ${body}`, label: 'Delete reminder', fn: () => store.update(g2 => ({ ...g2, reminders: g2.reminders.filter(x => x.id !== id) })) });

  return <>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="btn" onClick={() => setTplOpen(true)} style={{ padding: '0 16px', fontWeight: 500 }}><Icon n="clipboard" s={15} />Add from template</button>
      <button className="btn-p" onClick={() => nav.open({ kind: 'reminder', vid: car.id, form: newRemForm() })}><Icon n="plus" s={15} w={2.2} />New reminder</button>
    </div>

    {tplOpen && (
      <Modal title="Reminder templates" sub="Due dates count from the last matching entry in this car's history." onClose={() => setTplOpen(false)}>
        {presets.map(tp => {
          const added = have.has(tp[0].toLowerCase()) || (tp[0] === 'Brake fluid change' && have.has('brake fluid'));
          const km = tp[3] ? (u === 'km' ? tp[3].toLocaleString() + ' km' : (Math.round((tp[3] * 0.62) / 100) * 100).toLocaleString() + ' mi') : '';
          return (
            <div key={tp[0]} className="row" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '14px 0' }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><span style={{ fontWeight: 600, fontSize: 15 }}>{tp[0]}</span>{tp[4] && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--accs)', color: 'var(--acc)' }}>Pass / fail</span>}</div>
                <span className="mono mut" style={{ fontSize: 11 }}>{['Every ' + fmtEvery(tp[2]), km].filter(Boolean).join(' or ')}</span>
                <span style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 1.5 }}>{tp[5].join(' · ')}</span>
              </div>
              {added
                ? <span style={{ flex: 'none', height: 32, display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--up)' }}><Icon n="check" s={14} w={2.4} />Added</span>
                : <button className="btn-p" style={{ flex: 'none', height: 32, padding: '0 14px', gap: 4 }} onClick={() => store.update(g2 => {
                    const r = templateRem(tp, car.id, odo, u, g2.records, calc.TODAY);
                    return { ...g2, reminders: [...g2.reminders, r], log: [{ id: r.id, at: new Date().toISOString(), by: me.id, vid: car.id, text: `added reminder "${tp[0]}" (due ${fdate(r.dueDate)})` }, ...g2.log] };
                  })}><Icon n="plus" s={13} w={2.4} />Add</button>}
            </div>
          );
        })}
      </Modal>
    )}

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
      {active.map(({ r, i }) => {
        const every = [r.repeatMonths ? fmtMonths(+r.repeatMonths) : r.repeatDays ? fmtEvery(+r.repeatDays) : '', r.repeatDist ? `${(+r.repeatDist).toLocaleString()} ${u}` : ''].filter(Boolean).join(' or ');
        const repeat = [r.auto === 'rego' ? 'Auto from rego expiry' : '', every ? `↻ Every ${every}` + (r.lastDone ? ` · last ${fdate(r.lastDone)}` : '') : 'One-off'].filter(Boolean).join(' · ');
        return (
          <div key={r.id} className="card" style={{ gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span className="pill" style={{ background: tint(i.color, '22'), color: i.color, marginRight: 'auto' }}>{i.status}</span>
              <button className="plain to-up" onClick={() => nav.open({ kind: 'record', vid: car.id, form: remForm(r, odo, calc.TODAY) })} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--mut)' }}><Icon n="check" s={14} w={2.2} />Mark done</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <button className="plain to-acc" onClick={() => nav.open({ kind: 'reminder', vid: car.id, form: remEditForm(r) })} title="Edit reminder" style={{ fontWeight: 600, fontSize: 17 }}>{r.title}</button>
              <div style={{ fontSize: 12, color: 'var(--mut)', display: 'flex', alignItems: 'center', gap: 5 }}>{repeat}</div>
            </div>
            <div title="Time used since last done" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--mut)' }}><span>Interval used</span><span>{i.pct}</span></div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--card2)' }}><div style={{ height: '100%', borderRadius: 3, width: i.pct, background: i.rank === 2 ? '#3d3d3d' : i.color }} /></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--mut)', flex: 1 }}>{i.due}</span>
              <button className="plain ghost" onClick={() => nav.open({ kind: 'reminder', vid: car.id, form: remEditForm(r) })} title="Edit reminder" style={{ height: 26, padding: '0 6px', borderRadius: 7, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}><Icon n="pencil" s={14} />Edit</button>
              <button className="plain ghost-del" onClick={() => del(r.id, r.title, 'will stop repeating and be removed. Past service entries stay.')} title="Delete reminder" aria-label="Delete reminder" style={{ height: 26, padding: '0 6px', borderRadius: 7, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--mut)' }}><Icon n="trash" s={14} /><span /></button>
            </div>
          </div>
        );
      })}
      <button className="dashed" onClick={() => nav.open({ kind: 'reminder', vid: car.id, form: newRemForm() })} style={{ borderRadius: 20, padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 140 }}><Icon n="plus" />New reminder</button>
    </div>

    {done.length > 0 && <>
      <div className="mono" style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mut)', marginTop: 8 }}>Completed</div>
      {done.map(r => (
        <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line)', color: 'var(--mut)', fontSize: 13 }}>
          <span style={{ flex: 1, textDecoration: 'line-through' }}>{r.title}</span>
          <button className="plain" style={{ color: 'var(--acc)' }} onClick={() => store.update(g2 => ({ ...g2, reminders: g2.reminders.map(x => (x.id === r.id ? { ...x, done: false } : x)) }))}>Restore</button>
          <button className="plain" style={{ color: 'var(--mut)' }} onClick={() => del(r.id, r.title, 'will be removed permanently.')}>Delete</button>
        </div>
      ))}
    </>}
  </>;
}
