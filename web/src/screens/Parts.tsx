import { useState } from 'react';
import { cardForm, setPartStatus } from '../lib/actions.ts';
import { type Col, COLNAME, fdate, type Part, PCOL, PSTAT, tint } from '../lib/model.ts';
import { Icon } from '../ui/icons.tsx';
import type { Tab } from './Car.tsx';

export const partForm = (p?: Part) => ({ id: p?.id, name: p?.name || '', partNo: p?.partNo || '', vendor: p?.vendor || '', qty: String(p?.qty || 1), cost: p && p.cost !== '' ? String(p.cost) : '', status: p?.status || 'Needed' as Part['status'], cardId: p?.cardId || '', url: p?.url || '' });

export function Parts({ calc, car, nav, store, me }: Tab) {
  const g = calc.g, board = g.boards[car.id] || { backlog: [], parts: [], progress: [], done: [] };
  const [pf, setPf] = useState<'All' | Part['status']>('All');
  const vParts = g.parts.filter(p => p.vid === car.id);
  const sum = (l: Part[]) => calc.money(l.reduce((a, p) => a + +(p.cost || 0) * (p.qty || 1), 0), true);
  const where: Record<string, { c: (typeof board.backlog)[0]; k: Col; i: number }> = {};
  (Object.keys(board) as Col[]).forEach(k => board[k].forEach((c, i) => { where[c.id] = { c, k, i }; }));
  const rows = vParts.filter(p => pf === 'All' || p.status === pf).sort((x, y) => PSTAT.indexOf(x.status) - PSTAT.indexOf(y.status));
  const shelf = g.shelf.reduce((a, p) => a + (+p.qty || 1), 0);
  const cols = 'minmax(0,1.3fr) minmax(0,1fr) 44px 96px 104px 44px';

  return <>
    <div style={{ fontSize: 13, color: 'var(--mut)', lineHeight: 1.5, maxWidth: 780 }}>The shopping list for this car. Link a part to a build task and it shows on the task card. Marking a part <b style={{ color: 'var(--fg)', fontWeight: 500 }}>Ordered</b> moves its task to Waiting on parts, and finishing the task marks in-stock parts as installed.</div>
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 13, color: 'var(--mut)', flexWrap: 'wrap' }}>
      <div role="tablist" style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, flexWrap: 'wrap' }}>
        {(['All', ...PSTAT] as const).map(t => <button key={t} role="tab" aria-selected={pf === t} className="plain" onClick={() => setPf(t)} style={{ padding: '6px 12px', borderRadius: 9, fontSize: 13, background: pf === t ? 'var(--card2)' : 'transparent', color: pf === t ? 'var(--fg)' : 'var(--mut)' }}>{t} <span className="mono" style={{ fontSize: 11, opacity: 0.6 }}>{t === 'All' ? vParts.length : vParts.filter(p => p.status === t).length}</span></button>)}
      </div>
      <span>To buy <b className="mono" style={{ color: 'var(--fg)', fontWeight: 500 }}>{sum(vParts.filter(p => p.status === 'Needed'))}</b></span>
      <span>Ordered <b className="mono" style={{ color: 'var(--fg)', fontWeight: 500 }}>{sum(vParts.filter(p => p.status === 'Ordered'))}</b></span>
      <span>On the shelf <b className="mono" style={{ color: 'var(--fg)', fontWeight: 500 }}>{sum(vParts.filter(p => p.status === 'In stock'))}</b></span>
      <button className="btn" onClick={() => nav.open({ kind: 'shelf' })} style={{ marginLeft: 'auto', color: 'var(--fg)' }}>From the shelf <span className="mono mut" style={{ fontSize: 11 }}>{shelf}</span></button>
      <button className="btn" onClick={() => nav.open({ kind: 'part', vid: car.id, form: partForm() })} style={{ color: 'var(--fg)' }}><Icon n="plus" s={15} />Add part</button>
    </div>
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 20, overflow: 'hidden' }}>
      <div className="label" style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--line)' }}><span>Part</span><span>For task</span><span>Qty</span><span style={{ textAlign: 'right' }}>Total</span><span>Status</span><span /></div>
      {!rows.length && <div style={{ padding: '24px 18px', color: 'var(--mut)' }}>No parts here yet.</div>}
      {rows.map(p => {
        const w = p.cardId ? where[p.cardId] : undefined, rr = !w && p.recId ? g.records.find(x => x.id === p.recId) : undefined;
        const url = /^https?:\/\//i.test(p.url) ? p.url : '';
        const edit = () => nav.open({ kind: 'part', vid: car.id, form: partForm(p) });
        return (
          <div key={p.id} className="frow" style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '12px 18px', alignItems: 'center', borderBottom: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <button className="plain to-acc" onClick={edit} title="Edit part" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name || 'Untitled part'}</span><span className="mono mut" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[p.partNo, p.vendor].filter(Boolean).join(' · ') || '—'}</span></button>
              {url && <a href={url} target="_blank" rel="noopener noreferrer" title="Open link" aria-label="Open link" style={{ flex: 'none', color: 'var(--acc)', display: 'flex' }}><Icon n="link" s={14} /></a>}
            </div>
            <button className="plain dim" title={w ? 'Open task' : rr ? 'Open service entry' : 'Edit part to link it'} onClick={() => (w ? nav.open({ kind: 'card', vid: car.id, form: cardForm(w.c, w.k, w.i) }) : rr ? nav.open({ kind: 'entry', vid: car.id, id: rr.id }) : edit())}
              style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, color: w || rr ? 'var(--fg)' : 'var(--mut)' }}>
              <span style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w ? w.c.title : rr ? rr.title : 'Link to a task'}</span><span style={{ fontSize: 11, color: 'var(--mut)' }}>{w ? COLNAME[w.k] : rr ? 'Service history · ' + fdate(rr.date) : ''}</span>
            </button>
            <span className="mono" style={{ fontSize: 12 }}>{p.qty || 1}</span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}><span className="mono" style={{ fontSize: 13 }}>{calc.money(+(p.cost || 0) * (p.qty || 1), true)}</span><span className="mono mut" style={{ fontSize: 10 }}>{p.qty > 1 ? `${calc.money(+(p.cost || 0), true)} each` : ''}</span></span>
            <span><button className="plain" onClick={() => store.update(g2 => setPartStatus(g2, p.id, PSTAT[(PSTAT.indexOf(p.status) + 1) % PSTAT.length], me.id).g)} title="Click to change status" style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, background: tint(PCOL[p.status], '22'), color: PCOL[p.status] }}>{p.status}</button></span>
            <button className="plain ghost-del" onClick={() => nav.ask({ title: 'Delete this part?', body: `${p.name || 'This part'} will be removed from the parts list.`, label: 'Delete part', fn: () => store.update(g2 => ({ ...g2, parts: g2.parts.filter(x => x.id !== p.id) })) })} title="Delete" aria-label="Delete part" style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mut)' }}><Icon n="trash" s={15} /></button>
          </div>
        );
      })}
    </div>
  </>;
}
