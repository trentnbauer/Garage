import type { CSSProperties } from 'react';
import type { Nav } from '../App.tsx';
import { cardForm, remEditForm } from '../lib/actions.ts';
import { odoForm } from '../ui/Dialogs.tsx';
import { type Calc, COLS, days, fdate, RTYPES, TCOL, type Vehicle } from '../lib/model.ts';

const sDate = (d: string) => fdate(d).replace(/,? \d{4}$/, '');

export function Overview({ calc, car, nav }: { calc: Calc; car: Vehicle; nav: Nav }) {
  const g = calc.g, T = calc.TODAY, u = calc.u, cur = calc.cur, showTotals = g.settings.showTotals !== false;
  const st = calc.stats(car), rems = calc.activeRems(car, st.odo);
  const board = g.boards[car.id] || { backlog: [], parts: [], progress: [], done: [] };

  // Stat tiles
  const last = st.recs.filter(r => ['Service', 'Repair', 'Upgrade'].includes(r.type)).sort((a, b) => b.date.localeCompare(a.date))[0];
  const nx = rems[0];
  const yr = st.recs.filter(r => r.date.startsWith(T.slice(0, 4)));
  const old = st.recs.filter(r => days(r.date, T) > 30).map(r => +r.odo);
  const moved = old.length ? st.odo - Math.max(...old) : 0;
  const toGet = g.parts.filter(p => p.vid === car.id && (p.status === 'Needed' || p.status === 'Ordered')).length;
  const stats = [
    { k: 'Last service', v: last ? sDate(last.date) : '—', sub: last ? `${last.title} · ${(st.odo - +last.odo).toLocaleString()} ${u} ago` : 'No service logged', tag: last ? `${days(last.date, T)}d` : '', tagFg: 'var(--mut)' },
    { k: 'Next due', v: nx ? nx.r.title : 'All clear', sub: nx ? nx.i.short : 'No reminders', tag: nx ? nx.i.status.toUpperCase() : '', tagFg: nx ? nx.i.color : 'var(--up)' },
    { k: 'Odometer', v: Number(st.odo).toLocaleString(), sub: u === 'km' ? 'kilometres' : 'miles', tag: moved > 0 ? `▲ ${moved.toLocaleString()} / 30d` : '', tagFg: 'var(--up)', act: true },
    showTotals
      ? { k: `Spent ${T.slice(0, 4)}`, v: calc.money(yr.reduce((a, r) => a + +(r.cost || 0), 0)), sub: `${yr.length} entries · ${calc.money(st.total)} all time`, tag: '', tagFg: 'var(--mut)' }
      : { k: 'Build board', v: `${st.open} open`, sub: `${st.doneN} done · ${toGet} parts to get`, tag: '', tagFg: 'var(--mut)' },
  ];

  // Spend over the last 12 months
  const end = new Date(T + 'T00:00');
  const months = Array.from({ length: 12 }, (_, j) => {
    const d = new Date(end.getFullYear(), end.getMonth() - 11 + j, 1), key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { key, label: d.toLocaleDateString('en-AU', { month: 'short' }), total: st.recs.filter(r => r.date.startsWith(key)).reduce((a, r) => a + +(r.cost || 0), 0) };
  });
  const max = Math.max(1, ...months.map(m => m.total));
  const kfmt = (n: number) => (!n ? '' : n >= 1000 ? cur + (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : cur + Math.round(n));

  // Cost of ownership
  const pp = +(car.purchasePrice || 0), tot = pp + st.total, val = car.estValue === '' || car.estValue == null ? null : +car.estValue;
  const recO = st.recs.filter(r => +r.odo > 0).map(r => +r.odo);
  const startO = car.purchaseOdo !== '' && car.purchaseOdo != null && +car.purchaseOdo > 0 ? +car.purchaseOdo : recO.length ? Math.min(...recO) : null;
  const drove = startO != null ? st.odo - startO : 0, perKm = !!car.purchaseOdo && drove > 0;
  const sale = car.sold && car.sold.price != null ? +car.sold.price : null;
  const tcoRows = [
    { k: 'Purchase price', v: pp ? calc.money(pp) : '—', fg: 'var(--fg)' },
    { k: 'Spent since', v: calc.money(st.total), fg: 'var(--fg)' },
    { k: `Per ${u}`, v: perKm ? calc.money(st.total / drove, true) : 'Add odometer at purchase', fg: perKm ? 'var(--fg)' : 'var(--mut)' },
    { k: 'Estimated value', v: val != null ? calc.money(val) : 'Not set', fg: val != null ? 'var(--fg)' : 'var(--mut)' },
  ];

  // Build progress
  const total = st.open + st.doneN, pct = total ? st.doneN / total : 0;
  // Where the money goes
  const cat = RTYPES.map(t => ({ k: t, n: st.recs.filter(r => r.type === t).reduce((a, r) => a + +(r.cost || 0), 0) })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
  const cmax = Math.max(1, ...cat.map(x => x.n));
  const upcoming = calc.dueFor([car], true).slice(0, 10);
  const recent = [...st.recs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,150px),1fr))', gap: 12 }}>
        {stats.map(s => (
          <div key={s.k} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--mut)' }}>{s.k}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="mono" style={{ fontSize: 11, color: s.tagFg }}>{s.tag}</span>
                {s.act && <button className="plain" onClick={() => nav.open({ kind: 'odo', vid: car.id, form: odoForm(calc, car.id) })} title="Add distance driven" style={{ height: 22, padding: '0 8px', borderRadius: 999, background: 'var(--accs)', color: 'var(--acc)', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <svg className="i" viewBox="0 0 24 24" width={11} height={11} style={{ strokeWidth: 2.6 }} aria-hidden="true"><path d="M5 12h14" /><path d="M12 5v14" /></svg>{u}
                </button>}
              </span>
            </div>
            <div className="mono" style={{ fontWeight: 700, fontSize: 20, letterSpacing: '-.01em', lineHeight: 1.2, textWrap: 'balance', overflowWrap: 'anywhere' } as CSSProperties}>{s.v}</div>
            <div style={{ fontSize: 12, color: 'var(--mut)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,150px),1fr))', gap: 12 }}>
        <div className="card" style={{ gridColumn: 'span 2', gap: 10, minHeight: 250 }}>
          <div className="card-h"><span className="card-t">Spend, 12 months</span>{showTotals && <span className="mono mut" style={{ fontSize: 12 }}>{calc.money(months.reduce((a, m) => a + m.total, 0))}</span>}</div>
          <div style={{ flex: 1, minHeight: 170, display: 'grid', gridTemplateColumns: 'repeat(12,minmax(0,1fr))', gap: 6, alignItems: 'end', borderBottom: '1px solid var(--line)' }}>
            {months.map((m, i) => (
              <div key={m.key} className="bar" title={`${m.label}: ${calc.money(m.total)}`} style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
                <span className="mono" style={{ fontSize: 9.5, color: m.total === max ? 'var(--fg)' : 'var(--mut)', whiteSpace: 'nowrap' }}>{kfmt(m.total)}</span>
                <div style={{ width: '100%', maxWidth: 34, height: m.total ? Math.max(3, (m.total / max) * 100) + '%' : 2, borderRadius: '5px 5px 0 0', background: !m.total ? 'var(--line2)' : i === 11 ? 'var(--acc)' : '#5a5a5a' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,minmax(0,1fr))', gap: 6 }}>
            {months.map((m, i) => <span key={m.key} style={{ fontSize: 10, color: i === 11 ? 'var(--fg)' : 'var(--mut)', textAlign: 'center' }}>{m.label}</span>)}
          </div>
        </div>

        <div className="card" style={{ gap: 12 }}>
          <div className="card-h"><span className="card-t">Cost of ownership</span><button className="link" onClick={() => nav.go({ sec: 'details' })}>Edit</button></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="mono" style={{ fontWeight: 700, fontSize: 26 }}>{calc.money(tot)}</span>
            <span style={{ fontSize: 12, color: 'var(--mut)' }}>{sale != null ? `Net ${calc.money(tot - sale)} after selling for ${calc.money(sale)}` : val != null ? `Net ${calc.money(tot - val)} after its estimated value` : 'Purchase price plus everything spent since'}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
            {tcoRows.map(t => <div key={t.k} className="row" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', fontSize: 13 }}><span className="mut">{t.k}</span><span className="mono" style={{ color: t.fg }}>{t.v}</span></div>)}
          </div>
        </div>

        <div className="card" style={{ gap: 10 }}>
          <div className="card-h" style={{ gap: 0 }}><span className="card-t">Build progress</span><button className="link" onClick={() => nav.go({ sec: 'board' })}>Board</button></div>
          <div style={{ position: 'relative', width: 150, height: 150, alignSelf: 'center', margin: '6px 0' }}>
            <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }} aria-hidden="true">
              <circle cx="50" cy="50" r="40" style={{ fill: 'none', stroke: '#262626', strokeWidth: 12 }} />
              <circle cx="50" cy="50" r="40" style={{ fill: 'none', stroke: '#e0e0e0', strokeWidth: 12, strokeLinecap: 'round', strokeDasharray: `${(pct * 251.3).toFixed(1)} 300` }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span className="mono" style={{ fontWeight: 700, fontSize: 26 }}>{Math.round(pct * 100)}%</span>
              <span style={{ fontSize: 11, color: 'var(--mut)' }}>{st.doneN} of {total} tasks</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 'auto' }}>
            {COLS.map(([k, label, color]) => (
              <div key={k} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}><div style={{ height: 6, borderRadius: 3, background: color }} /><span style={{ fontSize: 10, color: 'var(--mut)', whiteSpace: 'nowrap' }}>{label.split(' ')[0]} {board[k].length}</span></div>
            ))}
          </div>
        </div>

        <div className="card" style={{ gap: 12 }}>
          <span className="card-t">Where it goes</span>
          {cat.map(c => (
            <div key={c.k} style={{ display: 'grid', gridTemplateColumns: '70px minmax(0,1fr) 62px', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--mut)' }}>{c.k}</span>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--card2)' }}><div style={{ height: '100%', borderRadius: 4, width: ((c.n / cmax) * 100).toFixed(1) + '%', background: TCOL[c.k] }} /></div>
              <span className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{calc.money(c.n)}</span>
            </div>
          ))}
        </div>

        <div className="card" style={{ gridColumn: 'span 2', gap: 4 }}>
          <div className="card-h" style={{ marginBottom: 6 }}><span className="card-t">Due</span><button className="link" onClick={() => nav.go({ sec: 'reminders' })}>All</button></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,240px),1fr))', columnGap: 24 }}>
            {upcoming.map(x => {
              const r = x.kind === 'rem' ? { key: x.r.id, title: x.r.title, short: x.i.short, color: x.i.color, go: () => nav.open({ kind: 'reminder', vid: car.id, form: remEditForm(x.r) }) }
                : { key: x.c.id, title: x.c.title, short: 'Task · ' + x.short, color: x.color, go: () => nav.open({ kind: 'card', vid: car.id, form: cardForm(x.c, x.k, board[x.k].findIndex(c => c.id === x.c.id)) }) };
              return (
                <button key={r.key} className="plain row" onClick={r.go} title="Edit reminder" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: r.color }} />
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 500 }}>{r.title}</div><div style={{ fontSize: 11, color: 'var(--mut)' }}>{r.short}</div></div>
                </button>
              );
            })}
          </div>
          {!upcoming.length && <span style={{ fontSize: 13, color: 'var(--mut)' }}>Nothing scheduled.</span>}
        </div>

        <div className="card" style={{ gap: 4 }}>
          <div className="card-h" style={{ marginBottom: 6 }}><span className="card-t">Recent</span><button className="link" onClick={() => nav.go({ sec: 'history' })}>History</button></div>
          {recent.map(r => (
            <div key={r.id} className="row" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0' }}>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div><div style={{ fontSize: 11, color: 'var(--mut)' }}>{r.type} · {fdate(r.date)}</div></div>
              <span className="mono" style={{ fontSize: 12 }}>{calc.money(r.cost)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
