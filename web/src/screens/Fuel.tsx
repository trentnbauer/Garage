import { csv, download, econSeries, fdate } from '../lib/model.ts';
import { Icon } from '../ui/icons.tsx';
import { fuelRecord } from '../ui/Dialogs.tsx';
import type { Tab } from './Car.tsx';

/** Smooth path through points (Catmull-Rom as cubic Béziers). */
function smooth(p: number[][]) {
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export function Fuel({ calc, car, nav, store }: Tab) {
  const g = calc.g, u = calc.u, vol = u === 'km' ? 'L' : 'gal', eu = u === 'km' ? 'L/100km' : 'mpg';
  const show = (e: number | null) => (e == null ? '—' : (u === 'km' ? 100 / e : e).toFixed(1));
  const fl = g.records.filter(r => r.vid === car.id && r.type === 'Fuel').sort((a, b) => +a.odo - +b.odo || a.date.localeCompare(b.date));
  const eOf: Record<string, number | null> = {};
  econSeries(fl.filter(r => r.gallons)).rows.forEach(x => { eOf[x.r.id] = x.e; });
  const rowsAsc = fl.map((r, i) => ({ r, d: i ? +r.odo - +fl[i - 1].odo : null, e: eOf[r.id] ?? null }));
  const avg = calc.stats(car).econ;
  const spend = fl.reduce((a, r) => a + +(r.cost || 0), 0), gal = fl.reduce((a, r) => a + +(r.gallons || 0), 0);
  const stats = [{ k: `Average ${eu}`, v: show(avg) }, { k: `Avg price / ${vol}`, v: gal ? calc.money(spend / gal, true) : '—' }, g.settings.showTotals !== false ? { k: 'Fuel spend', v: calc.money(spend) } : { k: 'Fill-ups', v: String(fl.length) }];

  const pts = rowsAsc.filter(x => x.e);
  const dv = (e: number) => (u === 'km' ? 100 / e : e);
  let chart: { line: string; dots: { x: string; y: string; tip: string }[] } | null = null;
  if (pts.length >= 2) {
    const vs = pts.map(x => dv(x.e!)), lo = Math.min(...vs) * 0.9, hi = Math.max(...vs) * 1.05;
    const xy = pts.map((x, i) => [i * (600 / (pts.length - 1)), 130 - ((dv(x.e!) - lo) / (hi - lo || 1)) * 115]);
    chart = { line: smooth(xy), dots: xy.map((p, i) => ({ x: (p[0] / 6).toFixed(2) + '%', y: (p[1] / 1.4).toFixed(2) + '%', tip: `${fdate(pts[i].r.date)} · ${show(pts[i].e)} ${eu}` })) };
  }

  const exportCsv = () => {
    const slug = (car.nickname || car.model || 'car').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    download(slug + '-fuel.csv', csv([['Date', `Odometer (${u})`, `Fuel (${vol})`, 'Cost', `Price per ${vol}`, 'Partial fill', eu, 'Notes'],
      ...fl.map(r => [r.date, r.odo, r.gallons || '', r.cost == null ? '' : r.cost, r.gallons ? (+(r.cost || 0) / r.gallons).toFixed(3) : '', r.partial ? 'yes' : '', eOf[r.id] ? show(eOf[r.id]) : '', [r.title !== 'Fill-up' ? r.title : '', r.notes].filter(Boolean).join(' · ')])]));
  };
  const del = (id: string, title: string, date: string) => nav.ask({ title: 'Delete this entry?', body: `${title} · ${fdate(date)} will be removed from service history.`, label: 'Delete entry', fn: () => store.update(g2 => ({ ...g2, records: g2.records.filter(x => x.id !== id) })) });
  const cols = '110px 120px 100px 90px 90px 90px 90px minmax(0,1fr) 44px';

  return <>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,150px),1fr))', gap: 12 }}>
      <div className="card" style={{ gridColumn: 'span 3', gap: 10, minHeight: 230 }}>
        <div className="card-h"><span className="card-t">Economy per fill-up</span><span style={{ display: 'flex', alignItems: 'center', gap: 12 }}><button className="link" onClick={exportCsv}>Export CSV</button><span className="mono mut" style={{ fontSize: 12 }}>{eu}</span></span></div>
        {chart ? <>
          <div style={{ position: 'relative', flex: 1, minHeight: 140 }}>
            <svg viewBox="0 0 600 140" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }} aria-hidden="true">
              <defs><linearGradient id="fuelArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e8b04b" stopOpacity={0.3} /><stop offset="1" stopColor="#e8b04b" stopOpacity={0} /></linearGradient></defs>
              <path d="M0 35H600M0 70H600M0 105H600" style={{ stroke: 'rgba(255,255,255,.05)', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' }} />
              <path d={chart.line + ' L600,140 L0,140 Z'} style={{ fill: 'url(#fuelArea)' }} />
              <path d={chart.line} style={{ fill: 'none', stroke: '#e8b04b', strokeWidth: 2.5, vectorEffect: 'non-scaling-stroke', strokeLinejoin: 'round' }} />
            </svg>
            {chart.dots.map(d => <div key={d.tip} title={d.tip} style={{ position: 'absolute', left: d.x, top: d.y, width: 10, height: 10, margin: '-5px 0 0 -5px', borderRadius: '50%', background: 'var(--bg)', border: '2px solid #e8b04b'}} />)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--mut)' }}><span>{fdate(pts[0].r.date)}</span><span>{eu} · {u === 'km' ? 'lower' : 'higher'} is better</span><span>{fdate(pts[pts.length - 1].r.date)}</span></div>
        </> : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mut)', fontSize: 13 }}>{pts.length === 1 ? 'Log one more fill-up to see a trend.' : fl.length === 1 ? 'Economy needs two full fill-ups. Log one more to see it.' : 'Log two full fill-ups to see economy.'}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button className="plain fill-big" onClick={() => nav.open({ kind: 'record', vid: car.id, form: fuelRecord(calc, car.id) })} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 16, background: '#e8b04b', color: '#1a1408', fontWeight: 700, fontSize: 14 }}><Icon n="plus" s={17} w={2.2} />Add fill-up</button>
        {stats.map(s => <div key={s.k} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', flex: 1 }}><div style={{ fontSize: 12, color: 'var(--mut)' }}>{s.k}</div><div className="mono" style={{ fontWeight: 700, fontSize: 20 }}>{s.v}</div></div>)}
      </div>
    </div>
    <div className="noscroll" style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 20, overflowX: 'auto' }}>
      <div className="label" style={{ display: 'grid', gridTemplateColumns: cols, minWidth: 900, gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--line)' }}><span>Date</span><span>Odometer</span><span>Distance</span><span>Volume</span><span>Cost</span><span>Price</span><span>Economy</span><span>Notes</span><span /></div>
      {[...rowsAsc].reverse().map(({ r, d, e }) => (
        <div key={r.id} className="frow mono" style={{ display: 'grid', gridTemplateColumns: cols, minWidth: 900, gap: 12, padding: '12px 18px', alignItems: 'center', borderBottom: '1px solid var(--line)', fontSize: 12 }}>
          <span style={{ fontFamily: 'Geist, sans-serif', fontSize: 13, color: 'var(--mut)' }}>{fdate(r.date)}</span>
          <span>{Number(r.odo).toLocaleString()}</span><span className="mut">{d != null ? `+${d.toLocaleString()}` : '—'}</span><span>{r.gallons ? `${r.gallons} ${vol}` : '—'}</span>
          <span>{calc.money(r.cost, true)}</span><span className="mut">{r.gallons ? calc.money(+(r.cost || 0) / r.gallons, true) : '—'}</span>
          <span style={{ color: e && avg ? (e >= avg ? 'var(--up)' : 'var(--down)') : 'var(--fg)', fontWeight: 700 }}>{show(e)}</span>
          <span style={{ fontFamily: 'Geist, sans-serif', fontSize: 12, color: 'var(--mut)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[r.title !== 'Fill-up' ? r.title : '', r.partial ? 'Partial fill' : '', r.missed ? 'Missed fill-up before' : '', r.notes].filter(Boolean).join(' · ')}</span>
          <button className="plain ghost-del" onClick={() => del(r.id, r.title, r.date)} title="Delete" aria-label="Delete fill-up" style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mut)' }}><Icon n="trash" s={15} /></button>
        </div>
      ))}
      {!fl.length && <div style={{ padding: '24px 18px', color: 'var(--mut)' }}>No fill-ups yet.</div>}
    </div>
  </>;
}
