// Build photos: every task with photos, newest first, grouped Before / After as tagged in the task.
import { cardForm } from '../lib/actions.ts';
import { COLS, fdate, type Task } from '../lib/model.ts';
import type { Tab } from './Car.tsx';

export function Photos({ calc, car, nav }: Tab) {
  const b = calc.g.boards[car.id];
  const items = COLS.flatMap(([k, name, dot]) => (b?.[k] || []).map((c: Task, idx) => {
    const ph = (c.photos || []).filter(p => p?.src); if (!ph.length) return null;
    const d = c.doneAt || (c.createdAt || '').slice(0, 10);
    const groups = [['Before', ph.filter(p => p.phase === 'before')], ['After', ph.filter(p => p.phase === 'after')], [ph.some(p => p.phase) ? 'Other' : 'Photos', ph.filter(p => !p.phase)]] as const;
    return { c, k, idx, d, name, dot, groups: groups.filter(g => g[1].length) };
  })).filter(x => !!x).sort((a, z) => (z!.d || '').localeCompare(a!.d || ''));
  if (!items.length) return <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 20, padding: '40px 20px', textAlign: 'center', color: 'var(--mut)', fontSize: 14, lineHeight: 1.6 }}>No build photos yet. Add photos to a task on the board and tag them Before or After — they line up here by date.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map(t => t && (
        <div key={t.c.id} style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 16, borderTop: `2px solid ${t.dot}` }}><span className="mono" style={{ fontSize: 12 }}>{t.d ? fdate(t.d) : ''}</span><span style={{ fontSize: 11, color: 'var(--mut)' }}>{t.name}</span></div>
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button type="button" className="plain to-acc" onClick={() => nav.open({ kind: 'card', vid: car.id, form: cardForm(t.c, t.k, t.idx) })} style={{ fontWeight: 600, fontSize: 15 }}>{t.c.title}</button>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))', gap: 12 }}>
              {t.groups.map(([label, ps]) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="label">{label}</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 6 }}>
                    {ps.map(p => <button key={p.id} type="button" className="plain" aria-label={`${label} photo, ${t.c.title}`} onClick={() => nav.view(p.src)} style={{ height: 96, borderRadius: 10, backgroundImage: `url("${p.src}")`, backgroundSize: 'cover', backgroundPosition: 'center', cursor: 'zoom-in' }} />)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
