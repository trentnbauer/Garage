import { type DragEvent, useState } from 'react';
import { type Col, COLS, days, DRIVE, fdate, moveCard, type Part, TCOL, tint } from '../lib/model.ts';
import { Icon } from '../ui/icons.tsx';
import { cardForm, newCardForm } from '../lib/actions.ts';
import { blankRecord } from '../ui/Dialogs.tsx';
import type { Tab } from './Car.tsx';

const PRIO: Record<string, string> = { High: '#f2685f', Medium: '#e8b04b', Low: '#8d9099' };

export function Board({ calc, car, nav, store, me, narrow }: Tab & { narrow: boolean }) {
  const g = calc.g, T = calc.TODAY, set = g.settings;
  const board = g.boards[car.id] || { backlog: [], parts: [], progress: [], done: [] };
  const [drag, setDrag] = useState<{ id: string; col: Col } | null>(null);
  const [drop, setDrop] = useState<{ col: Col; idx: number } | null>(null);
  const [showOld, setShowOld] = useState(false);

  // Done keeps the three most recent cards plus anything finished within hideDoneDays.
  const hideDays = set.hideDoneDays ?? 7;
  const recDate = (id?: string) => g.records.find(x => x.id === id)?.date;
  const doneAt = (c: typeof board.done[0]) => c.doneAt || recDate(c.autoRec) || '';
  const keep = new Set([...board.done].sort((a, b) => doneAt(b).localeCompare(doneAt(a))).slice(0, 3).map(c => c.id));
  const isOld = (c: typeof board.done[0]) => !keep.has(c.id) && (!doneAt(c) || days(doneAt(c), T) > hideDays);
  const visIdx: Record<Col, number[]> = { backlog: [], parts: [], progress: [], done: [] };
  COLS.forEach(([k]) => { visIdx[k] = board[k].map((_, i) => i).filter(i => k !== 'done' || showOld || !isOld(board[k][i])); });
  const vis = (k: Col) => visIdx[k].map(i => board[k][i]);

  const fromIdx = drag ? vis(drag.col).findIndex(x => x.id === drag.id) : -1;
  const noop = drag && drop && drop.col === drag.col && (drop.idx === fromIdx || drop.idx === fromIdx + 1);
  const showAt = (col: Col, i: number) => !!(drag && drop && !noop && drop.col === col && drop.idx === i);
  const over = (col: Col, idx: number) => (e: DragEvent) => { if (!drag) return; e.preventDefault(); e.stopPropagation(); if (!drop || drop.col !== col || drop.idx !== idx) setDrop({ col, idx }); };
  const move = (id: string, col: Col, idx: number) => store.update(g2 => moveCard(g2, car.id, id, col, idx, me.id, T));
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    if (drag && drop) { const m = visIdx[drop.col]; const idx = drop.idx < m.length ? m[drop.idx] : m.length ? m[m.length - 1] + 1 : 0; move(drag.id, drop.col, idx); }
    setDrag(null); setDrop(null);
  };

  const pBy: Record<string, Part[]> = {};
  g.parts.forEach(p => { if (p.cardId) (pBy[p.cardId] = pBy[p.cardId] || []).push(p); });
  const open = [...board.backlog, ...board.parts, ...board.progress];
  const colsShown = COLS.filter(([k]) => set.showDoneCol !== false || k !== 'done');
  const gridCols = colsShown.map(([k]) => (vis(k).length || board[k].length || (drag && drop && drop.col === k) ? 'minmax(240px,1fr)' : 'minmax(170px,.55fr)')).join(' ');
  const line = <div style={{ height: 3, margin: '-5.5px 4px', borderRadius: 2, background: 'var(--acc)' }} />;

  return <>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--mut)' }}>
      <span>Remaining <b className="mono" style={{ color: 'var(--fg)', fontWeight: 500 }}>{calc.money(open.reduce((a, x) => a + (+x.est || 0), 0))}</b></span>
      <span>Done <b className="mono" style={{ color: 'var(--fg)', fontWeight: 500 }}>{board.done.length} of {open.length + board.done.length}</b></span>
      <span style={{ marginLeft: 'auto' }}>{narrow ? 'Tap a task to change its column · moving to Done adds it to service history' : 'Drag between columns · drop on a header to send to the top · moving to Done adds it to service history'}</span>
    </div>
    <div style={{ flex: '1 0 auto', display: 'grid', gridTemplateColumns: gridCols, gap: 12, overflowX: 'auto', maxWidth: '100%', paddingBottom: 6, alignItems: 'stretch' }}>
      {colsShown.map(([col, label, dot]) => {
        const list = vis(col), hiddenN = col === 'done' ? board.done.filter(isOld).length : 0;
        return (
          <div key={col} onDragOver={over(col, list.length)} onDrop={onDrop} style={{ background: 'var(--card)', border: `1px solid ${drag && drop?.col === col ? 'rgba(255,255,255,.35)' : 'var(--line)'}`, borderRadius: 20, display: 'flex', flexDirection: 'column', minHeight: 'max(420px, calc(100vh - 250px))', minWidth: 0 }}>
            <div onDragOver={over(col, 0)} style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />
              <span style={{ fontWeight: 600, fontSize: 14 }}>{label}</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--mut)', background: 'var(--card2)', padding: '2px 7px', borderRadius: 999 }}>{board[col].length}</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--mut)', marginLeft: 'auto' }}>{list.length ? calc.money(list.reduce((a, x) => a + (+x.est || 0), 0)) : ''}</span>
              <button className="plain ghost" onClick={() => nav.open({ kind: 'card', vid: car.id, form: newCardForm(col) })} title="Add card" aria-label={`Add card to ${label}`} style={{ width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon n="plus" s={15} /></button>
            </div>
            <div style={{ padding: '4px 10px 12px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
              {list.map((cd, i) => {
                const ps = pBy[cd.id] || [], rd = ps.filter(p => p.status === 'In stock' || p.status === 'Installed').length, all = ps.length > 0 && rd === ps.length;
                const notes = (cd.activity || []).filter(a => a.kind === 'note').length, drive = cd.drive && cd.drive !== 'N/A' && col !== 'done' ? DRIVE[cd.drive] : null;
                const by = g.users.find(u => u.id === cd.assignee);
                return <div key={cd.id} style={{ display: 'contents' }}>
                  {showAt(col, i) && line}
                  <div className="task" draggable role="button" tabIndex={0} aria-label={cd.title} onClick={() => nav.open({ kind: 'card', vid: car.id, form: cardForm(cd, col, board[col].indexOf(cd)) })} onKeyDown={e => e.key === 'Enter' && nav.open({ kind: 'card', vid: car.id, form: cardForm(cd, col, board[col].indexOf(cd)) })}
                    onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', cd.id); setTimeout(() => setDrag({ id: cd.id, col }), 0); }}
                    onDragEnd={() => { setDrag(null); setDrop(null); }}
                    onDragOver={e => { if (!drag) return; const r = e.currentTarget.getBoundingClientRect(); over(col, e.clientY < r.top + r.height / 2 ? i : i + 1)(e); }}
                    style={{ opacity: drag?.id === cd.id ? 0.35 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: tint(TCOL[cd.type] || '#8d9099', '22'), color: TCOL[cd.type] || '#8d9099' }}>{cd.type}</span>
                      {drive && <span title="Drivability until fixed" style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: tint(drive.color, '22'), color: drive.color }}>{cd.drive}</span>}
                      <span style={{ flex: 1 }} />
                      {i > 0 && <button className="plain task-top" onClick={e => { e.stopPropagation(); move(cd.id, col, 0); }} title="Move to top" aria-label="Move to top" style={{ width: 24, height: 24, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mut)' }}><Icon n="totop" s={14} /></button>}
                    </div>
                    <div style={{ fontWeight: 500, fontSize: 14, lineHeight: 1.35, textDecoration: col === 'done' ? 'line-through' : 'none', color: col === 'done' ? 'var(--mut)' : 'var(--fg)' }}>{cd.title}</div>
                    {cd.note && !set.compact && <div style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 1.4 }}>{cd.note}</div>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--mut)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIO[cd.priority] }} />{cd.priority}</span>
                      <span className="mono">{cd.est ? calc.money(cd.est) : ''}</span>
                      {cd.due && col !== 'done' && <span title="Target date" className="mono" style={{ color: cd.due < T ? 'var(--down)' : 'var(--mut)' }}>{fdate(cd.due).replace(/,? \d{4}$/, '')}</span>}
                      {!!cd.photos?.length && <span title="Photos" className="mono" style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--mut)' }}><Icon n="camera" s={12} />{cd.photos.length}</span>}
                      {notes > 0 && <span title="Updates" className="mono" style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--mut)' }}><Icon n="chat" s={12} />{notes}</span>}
                      {ps.length > 0 && <span title={`${rd} of ${ps.length} parts in hand`} className="mono" style={{ display: 'flex', alignItems: 'center', gap: 3, color: all ? 'var(--up)' : 'var(--mut)' }}><Icon n="box" s={12} />{all && col !== 'done' ? 'Parts ready' : `${rd}/${ps.length}`}</span>}
                      {by && <span title={'Assigned to ' + by.name} style={{ marginLeft: 'auto', width: 20, height: 20, flex: 'none', borderRadius: '50%', background: by.color, color: '#0d0e10', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{by.name[0].toUpperCase()}</span>}
                      {col === 'done' && !cd.logged && <button className="plain" onClick={e => { e.stopPropagation(); nav.open({ kind: 'record', vid: car.id, form: blankRecord(calc, car.id, { type: cd.type === 'Repair' ? 'Repair' : cd.type === 'Maintenance' ? 'Service' : 'Upgrade', title: cd.title, cost: String(cd.est || ''), fromCard: cd.id, usedParts: g.parts.filter(p => p.cardId === cd.id && !p.recId).map(p => p.id) }) }); }} style={{ marginLeft: 'auto', color: 'var(--acc)', fontWeight: 500 }}>Log it</button>}
                      {col === 'done' && cd.logged && <span style={{ marginLeft: 'auto', color: 'var(--up)' }}>In history</span>}
                    </div>
                  </div>
                </div>;
              })}
              {((list.length > 0 && showAt(col, list.length)) || (list.length === 0 && showAt(col, 0))) && line}
              {list.length === 0 && !showAt(col, 0) && <div style={{ fontSize: 13, color: 'var(--mut)', border: '1px dashed var(--line2)', borderRadius: 14, padding: '24px 14px' }}>Drop cards here</div>}
              {hiddenN > 0 && <button className="plain to-fg" onClick={() => setShowOld(!showOld)} style={{ marginTop: 'auto', padding: '8px 4px 0', fontSize: 12, color: 'var(--mut)', display: 'flex', alignItems: 'center', gap: 6 }}><Icon n="archive" s={14} />{showOld ? `Hide ${hiddenN} older than ${hideDays} days` : `${hiddenN} older hidden · Show`}</button>}
            </div>
          </div>
        );
      })}
    </div>
  </>;
}
