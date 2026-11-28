import { useState } from 'react';
import { track } from '../lib/actions.ts';
import { excerpts, mergeSpecs, SPEC_QUERY, specPrompt } from '../lib/manual.ts';
import { SPEC_DEF, type SpecRow, type Specs as SpecsT, uid } from '../lib/model.ts';
import { Icon } from '../ui/icons.tsx';
import type { Tab } from './Car.tsx';

type Group = { key: string; title: string; hint: string; cols: [string, string, string, number][]; rows: SpecRow[]; addLabel: string; custom: boolean; canHide: boolean;
  add: () => void; setCell: (i: number, f: string, v: string) => void; removeRow: (i: number) => void; hide: () => void; onTitle?: (t: string) => void; titleV?: string };

export function Specs({ calc, car, nav, store, me }: Tab) {
  const sp: SpecsT = car.specs || {}, shown: string[] = sp._shown || [];
  const setSp = (fn: (o: SpecsT) => SpecsT) => store.update(g => ({ ...g, vehicles: g.vehicles.map(x => (x.id === car.id ? { ...x, specs: fn(structuredClone(x.specs || {})) } : x)) }));
  const filled = (rows: SpecRow[]) => rows.some(r => Object.values(r || {}).some(Boolean));

  const groups: Group[] = [];
  Object.entries(SPEC_DEF).forEach(([k, [title, hint, cols, core, noun]]) => {
    const rows: SpecRow[] = sp[k] || [];
    if (!core && !rows.length && !shown.includes(k)) return;
    groups.push({ key: k, title, hint, cols, rows, addLabel: '+ Add ' + noun, custom: false, canHide: !core,
      add: () => setSp(o => ({ ...o, [k]: [...(o[k] || []), {}] })),
      setCell: (i, f, v) => setSp(o => { const r = [...(o[k] || [])]; r[i] = { ...(r[i] || {}), [f]: v }; return { ...o, [k]: r }; }),
      removeRow: i => setSp(o => ({ ...o, [k]: (o[k] || []).filter((_: SpecRow, j: number) => j !== i) })),
      hide: () => { const go = () => setSp(o => ({ ...o, [k]: [], _shown: (o._shown || []).filter((x: string) => x !== k) })); if (filled(rows)) nav.ask({ title: `Remove ${title}?`, body: 'Its rows will be deleted from this car.', label: 'Remove', fn: go }); else go(); } });
  });
  (sp.custom || []).forEach((c: { id: string; title: string; rows: SpecRow[] }) => {
    const upd = (fn: (x: typeof c) => typeof c) => setSp(o => ({ ...o, custom: (o.custom || []).map((x: typeof c) => (x.id === c.id ? fn({ ...x, rows: [...(x.rows || [])] }) : x)) }));
    groups.push({ key: 'c' + c.id, title: c.title || 'Untitled section', hint: 'Your own section', cols: [['item', 'Item', 'e.g. Diff ratio', 1.3], ['value', 'Value', 'e.g. 4.30:1', 1.2]], rows: c.rows || [], addLabel: '+ Add row', custom: true, canHide: true, titleV: c.title || '',
      onTitle: t => upd(x => ({ ...x, title: t })), add: () => upd(x => ({ ...x, rows: [...x.rows, {}] })),
      setCell: (i, f, v) => upd(x => { x.rows[i] = { ...(x.rows[i] || {}), [f]: v }; return x; }), removeRow: i => upd(x => ({ ...x, rows: x.rows.filter((_, j) => j !== i) })),
      hide: () => nav.ask({ title: `Delete “${c.title || 'this section'}”?`, body: 'The section and its rows will be removed.', label: 'Delete', fn: () => setSp(o => ({ ...o, custom: (o.custom || []).filter((x: typeof c) => x.id !== c.id) })) }) });
  });
  const avail = Object.entries(SPEC_DEF).filter(([k, d]) => !d[3] && !(sp[k] || []).length && !shown.includes(k))
    .map(([k, d]) => ({ label: '+ ' + d[0], add: () => setSp(o => ({ ...o, _shown: [...(o._shown || []), k], [k]: o[k]?.length ? o[k] : (d[5] || ['']).map(t => ({ [d[2][0][0]]: t })) })) }));
  avail.push({ label: '+ Custom section', add: () => setSp(o => ({ ...o, custom: [...(o.custom || []), { id: uid(), title: '', rows: [{}] }] })) });
  const hasManual = !!car.manuals?.length, aiOn = !!calc.g.ai?.enabled;
  const [ai, setAi] = useState<{ busy?: boolean; ok?: boolean; msg?: string; undo?: SpecsT | null }>({});
  const can = hasManual && aiOn && !ai.busy;
  const fill = async () => {
    if (!can) { if (!hasManual) nav.go({ sec: 'details' }); return; }
    setAi({ busy: true });
    try {
      const ex = await excerpts(car, SPEC_QUERY);
      if (!ex.length) throw new Error('Couldn’t find spec pages in the manual. Check its text is searchable on the Manual tab.');
      const r = await store.ai(specPrompt([car.year, car.make, car.model, car.engine].filter(Boolean).join(' '), SPEC_DEF, ex));
      if (r.error) throw new Error(r.error);
      const before = structuredClone(car.specs || {}), m = mergeSpecs(before, r.text || '', SPEC_DEF), n = m.added + m.filled;
      if (n) store.update(g => track({ ...g, vehicles: g.vehicles.map(x => (x.id === car.id ? { ...x, specs: m.specs } : x)) }, me.id, car.id, `filled ${n} specs from the manual with AI`));
      setAi({ ok: true, undo: n ? before : null, msg: n ? `Added ${m.added} spec${m.added === 1 ? '' : 's'}${m.filled ? ` and filled ${m.filled} blank value${m.filled === 1 ? '' : 's'}` : ''} from the manual${m.pages.length ? ' (p. ' + m.pages.slice(0, 8).join(', ') + (m.pages.length > 8 ? '…' : '') + ')' : ''}. Check them against the page before relying on them.` : 'Nothing new found — everything the manual covers is already filled in.' });
    } catch (e) { setAi({ ok: false, msg: (e as Error).message || 'The AI request failed.' }); }
  };

  return <>
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 20, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 240 }}><div className="card-t">Fill from the workshop manual</div>
        <div role={ai.msg ? (ai.ok ? 'status' : 'alert') : undefined} style={{ fontSize: 12, color: ai.msg && !ai.ok ? 'var(--down)' : 'var(--mut)', lineHeight: 1.5 }}>{ai.msg || (!hasManual ? 'Upload a workshop manual in Car details and AI can pull torque settings, capacities, tune and alignment specs from it.' : !aiOn ? 'AI help is turned off. An admin can turn it on in Admin settings → AI help.' : 'AI reads the spec pages of your manual and adds what it finds. It only fills blanks — nothing you’ve entered is changed.')}</div></div>
      {ai.undo && !ai.busy && <button type="button" className="btn" onClick={() => { const prev = ai.undo!; setSp(() => prev); setAi({ ok: true, msg: 'Undone.' }); }}>Undo</button>}
      <button type="button" className="plain" onClick={fill} title={!hasManual ? 'Upload a workshop manual first' : !aiOn ? 'AI help is off in Admin settings' : 'Find specs in the manual and add them here'}
        style={{ cursor: can ? 'pointer' : 'not-allowed', height: 36, padding: '0 16px', borderRadius: 999, background: can ? 'var(--acc)' : 'var(--card2)', color: can ? 'var(--accfg)' : 'var(--mut)', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}><Icon n="sparkle" s={15} />{ai.busy ? 'Reading the manual…' : 'Fill with AI'}</button>
    </div>
    <div style={{ columns: '2 420px', columnGap: 12 }}>
      {groups.map(gr => (
        <div key={gr.key} style={{ breakInside: 'avoid', marginBottom: 12, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 20, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            {gr.custom ? <input aria-label="Section name" placeholder="Section name, e.g. Gearbox" value={gr.titleV} onChange={e => gr.onTitle!(e.target.value)} style={{ all: 'unset', flex: 1, minWidth: 0, fontWeight: 600, fontSize: 15, borderBottom: '1px dashed var(--line2)', padding: '2px 0' }} />
              : <span className="card-t">{gr.title}</span>}
            <span style={{ fontSize: 12, color: 'var(--mut)' }}>{gr.hint}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6, paddingRight: 34 }}>{gr.cols.map(c => <span key={c[0]} className="label" style={{ flex: c[3], minWidth: 0 }}>{c[1]}</span>)}</div>
            {gr.rows.map((row, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {gr.cols.map(([f, label, ph, flex], ci) => <input key={f} aria-label={`${label} ${i + 1}`} placeholder={ph} value={row[f] || ''} onChange={e => gr.setCell(i, f, e.target.value)}
                  style={{ flex, width: 0, height: 36, minWidth: 0, borderRadius: 10, border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--fg)', padding: '0 10px', fontSize: 13, fontFamily: ci === 0 ? 'inherit' : 'var(--mono)' }} />)}
                <button type="button" className="plain ghost-del" onClick={() => gr.removeRow(i)} title="Remove row" aria-label="Remove row" style={{ width: 28, height: 28, flex: 'none', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mut)' }}><Icon n="x" s={14} /></button>
              </div>
            ))}
            {!gr.rows.length && <span style={{ fontSize: 13, color: 'var(--mut)', padding: '6px 0' }}>Nothing recorded yet.</span>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <button type="button" className="dashed" onClick={gr.add} style={{ alignSelf: 'flex-start', height: 32, padding: '0 14px', borderRadius: 999, fontSize: 13, display: 'flex', alignItems: 'center' }}>{gr.addLabel}</button>
            {gr.canHide && <button type="button" className="plain ghost-del" onClick={gr.hide} style={{ fontSize: 12, color: 'var(--mut)' }}>Remove section</button>}
          </div>
        </div>
      ))}
    </div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <span className="label">Add a section</span>
      {avail.map(a => <button key={a.label} type="button" className="btn" onClick={a.add} style={{ height: 32 }}>{a.label}</button>)}
    </div>
    <span style={{ fontSize: 12, color: 'var(--mut)' }}>Changes save as you type. AI help reads these specs, and they're included in the paperwork pack.</span>
  </>;
}
