import { useState } from 'react';
import { csv, download, econSeries, fdate, RTYPES, TCOL, tint } from '../lib/model.ts';
import { Icon } from '../ui/icons.tsx';
import type { Tab } from './Car.tsx';

const typeLabel = (t: string) => (t === 'Upgrade' ? 'Update / Modification' : t);

export function History({ calc, car, nav, me }: Tab) {
  const g = calc.g, u = calc.u, vol = u === 'km' ? 'L' : 'gal', eu = u === 'km' ? 'L/100km' : 'mpg';
  const [filter, setFilter] = useState('All'), [year, setYear] = useState(''), [q, setQ] = useState('');
  const recs = g.records.filter(r => r.vid === car.id);
  const econ: Record<string, string> = {};
  econSeries(recs.filter(r => r.type === 'Fuel' && r.gallons).sort((a, b) => +a.odo - +b.odo)).rows.forEach(x => { if (x.e) econ[x.r.id] = (u === 'km' ? 100 / x.e : x.e).toFixed(1); });
  const yRecs = recs.filter(r => !year || r.date.startsWith(year));
  const ql = q.trim().toLowerCase();
  const rows = yRecs.filter(r => (filter === 'All' || r.type === filter) && (!ql || (r.title + ' ' + r.notes).toLowerCase().includes(ql))).sort((a, b) => b.date.localeCompare(a.date) || +b.odo - +a.odo);
  const years = [...new Set(recs.map(r => r.date.slice(0, 4)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  const by = (id?: string | null) => { const x = g.users.find(y => y.id === id); return x ? x.name : 'Someone'; };

  const exportCsv = () => {
    const rs = recs.filter(r => r.type !== 'Fuel').sort((a, b) => a.date.localeCompare(b.date));
    const slug = (car.nickname || car.model || 'car').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    download(slug + '-history.csv', csv([['Date', 'Type', 'Title', `Odometer (${u})`, 'Cost', 'Done by', 'Notes', 'Parts'],
      ...rs.map(r => [r.date, typeLabel(r.type), r.title, r.odo || '', r.cost == null ? '' : r.cost, r.where === 'shop' ? 'Workshop' : 'DIY', r.notes || '', g.parts.filter(p => p.recId === r.id).map(p => p.name + (p.qty > 1 ? ' x' + p.qty : '')).join('; ')])]));
  };
  const cols = '110px 130px minmax(0,1fr) 130px 100px';

  return <>
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <div role="tablist" style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, flexWrap: 'wrap' }}>
        {['All', ...RTYPES].map(t => (
          <button key={t} role="tab" aria-selected={filter === t} className="plain" onClick={() => setFilter(t)} style={{ padding: '6px 12px', borderRadius: 9, fontSize: 13, background: filter === t ? 'var(--card2)' : 'transparent', color: filter === t ? 'var(--fg)' : 'var(--mut)' }}>
            {t} <span className="mono" style={{ fontSize: 11, opacity: 0.6 }}>{t === 'All' ? yRecs.length : yRecs.filter(r => r.type === t).length}</span>
          </button>
        ))}
      </div>
      <select value={year} onChange={e => setYear(e.target.value)} title="Filter by year" className="mono" style={{ height: 36, minWidth: 0, borderRadius: 999, border: '1px solid var(--line2)', background: 'var(--card)', color: 'var(--fg)', padding: '0 12px', fontSize: 13 }}>
        <option value="">All years</option>
        {years.map(y => <option key={y} value={y}>{y} · {recs.filter(r => r.date.startsWith(y)).length}</option>)}
      </select>
      <button className="btn" onClick={exportCsv} title="Download service history as CSV" style={{ height: 40 }}>Export CSV</button>
      <input placeholder="Search history" aria-label="Search history" value={q} onChange={e => setQ(e.target.value)} style={{ height: 40, width: 240, borderRadius: 12, border: '1px solid var(--line2)', background: 'var(--card)', color: 'var(--fg)', padding: '0 14px', fontSize: 14 }} />
      {g.settings.showTotals !== false && <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--mut)' }}>Total <b className="mono" style={{ color: 'var(--fg)', fontWeight: 500 }}>{calc.money(rows.reduce((a, r) => a + +(r.cost || 0), 0), true)}</b></span>}
    </div>
    <div className="noscroll" style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 20, overflowX: 'auto' }}>
      <div className="label" style={{ display: 'grid', gridTemplateColumns: cols, minWidth: 660, gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--line)' }}><span>Date</span><span>Type</span><span>Description</span><span>Odometer</span><span style={{ textAlign: 'right' }}>Cost</span><span />{/* wraps to a second row, as in the design */}</div>
      {rows.map(r => {
        const extra = [r.type === 'Fuel' && r.gallons ? `${r.gallons} ${vol}` + (econ[r.id] ? ` · ${econ[r.id]} ${eu}` : '') : '', r.where === 'shop' ? 'Workshop' : '', r.checks ? `${r.checks.filter(x => x.done).length}/${r.checks.length} checks` : '', r.notes, r.by ? 'by ' + (r.by === me.id ? 'You' : by(r.by)) : ''].filter(Boolean).join(' · ');
        return (
          <div key={r.id} className="trow" role="button" tabIndex={0} onClick={nav.soon} onKeyDown={e => e.key === 'Enter' && nav.soon()} title="Open entry" style={{ display: 'grid', gridTemplateColumns: cols, minWidth: 660, gap: 12, padding: '12px 18px', alignItems: 'center', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}>
            <span style={{ fontSize: 13, color: 'var(--mut)' }}>{fdate(r.date)}</span>
            <span><span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, background: tint(TCOL[r.type], '22'), color: TCOL[r.type] }}>{r.type}</span></span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>{r.title}{!!r.files?.length && <span title="Attachments" className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 400, color: 'var(--mut)' }}><Icon n="clip" s={12} />{r.files.length}</span>}</div>
              <div style={{ fontSize: 12, color: 'var(--mut)' }}>{extra}</div>
            </div>
            <span className="mono" style={{ fontSize: 12, color: 'var(--mut)' }}>{calc.dist(r.odo)}</span>
            <span className="mono" style={{ fontSize: 13, textAlign: 'right' }}>{calc.money(r.cost, true)}</span>
          </div>
        );
      })}
      {!rows.length && <div style={{ padding: '24px 18px', color: 'var(--mut)' }}>No entries match.</div>}
    </div>
  </>;
}
