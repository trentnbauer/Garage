import { useState } from 'react';
import type { Nav } from '../App.tsx';
import { type Calc, DRIVE, driveLimit, fdate, tint, type User, type Vehicle } from '../lib/model.ts';
import type { Store } from '../lib/store.ts';
import { AccountMenu } from '../ui/AccountMenu.tsx';
import { Icon } from '../ui/icons.tsx';

export function Home({ store, me, calc, nav, narrow }: { store: Store; me: User; calc: Calc; nav: Nav; narrow: boolean }) {
  const g = calc.g;
  const [scrolled, setScrolled] = useState(false);
  const [soldOpen, setSoldOpen] = useState(false);
  const open = (v: Vehicle) => nav.go({ view: 'car', activeId: v.id, sec: (g.settings.defaultSec as Nav['ui']['sec']) || 'overview' });
  const live = g.vehicles.filter(v => !v.sold), sold = g.vehicles.filter(v => v.sold);
  const hr = new Date().getHours();
  const pad = narrow ? 16 : 40;

  let tasks = 0, over = 0;
  const cars = live.map(v => {
    const st = calc.stats(v), rems = calc.activeRems(v, st.odo), n = rems[0], lim = driveLimit(g.boards[v.id] || {});
    tasks += st.open; over += rems.filter(x => x.i.rank === 0).length;
    return { v, n, lim };
  });
  const needed = g.parts.filter(p => p.status === 'Needed' && live.some(v => v.id === p.vid)).length;
  const shelf = g.shelf.reduce((a, p) => a + (+p.qty || 1), 0);

  const due = calc.dueFor(live, false);
  const nBlk = due.filter(x => x.kind === 'task' && x.blk).length, nOver = due.filter(x => x.rank === 0 && !(x.kind === 'task' && x.blk)).length, nSoon = due.filter(x => x.rank === 1).length;
  const vLabel = (v: Vehicle) => (v.nickname || v.model) + (v.usage === 'daily' ? ' · Daily' : '');

  return (
    <div className="frame" onScroll={e => setScrolled(e.currentTarget.scrollTop > 8)}>
      <div style={{ maxWidth: g.settings.fullWidth || narrow ? 'none' : 1680, margin: '0 auto', padding: `0 ${pad}px 64px`, display: 'flex', flexDirection: 'column', gap: 32 }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 30, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: `${narrow ? 20 : 40}px 0 16px`, marginBottom: -16, background: g.settings.fullWidth || narrow ? 'var(--bg)' : 'var(--frame)', borderBottom: `1px solid ${scrolled ? 'var(--line)' : 'transparent'}` }}>
          <div>
            <div className="kicker">{(hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') + ', ' + me.name}</div>
            <div className="title" style={{ marginTop: 6 }}>Which car today?</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
            <button className="plain dim" onClick={nav.soon} title="Add vehicle" aria-label="Add vehicle" style={{ width: 34, height: 34, margin: '5px 0', borderRadius: '50%', background: 'var(--fg)', color: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon n="plus" s={20} w={2.2} /></button>
            <AccountMenu big me={me} onSwitch={store.logout} onSignOut={store.logout} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          {g.settings.showTotals !== false && <div />}{/* totals slot, kept for the design's spacing */}
          <div style={{ display: 'flex', gap: 8, paddingBottom: 8 }}>
            <span title="Tasks not in Done, across every car's board. The Due list only shows the ones that block driving or have a target date." className="mono" style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, background: 'rgba(63,207,142,.12)', color: 'var(--up)', cursor: 'help' }}>{tasks} task{tasks === 1 ? '' : 's'} on boards</span>
            {over > 0 && <span className="mono" style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, background: 'rgba(242,104,95,.12)', color: 'var(--down)' }}>{over} overdue</span>}
          </div>
          <button className="btn" onClick={nav.soon} style={{ marginLeft: 'auto', marginBottom: 6, padding: '0 16px', fontWeight: 600, gap: 8 }}><Icon n="shelf" />Shelf<span className="mono" style={{ fontSize: 11, color: 'var(--mut)' }}>{shelf}</span></button>
          <button className="btn" onClick={nav.soon} style={{ marginBottom: 6, padding: '0 16px', fontWeight: 600, gap: 8 }}><Icon n="cart" />Shopping list<span className="mono" style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--acc)', color: 'var(--accfg)' }}>{needed}</span></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,320px),1fr))', gap: 16 }}>
          {cars.map(({ v, n, lim }) => {
            const urgent = n && n.i.rank < 2;
            return (
              <div key={v.id} className="car-card">
                <div className="car-img" onClick={() => open(v)} title="Open car">
                  <span style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap', maxWidth: 'calc(100% - 20px)', overflow: 'hidden', textOverflow: 'ellipsis', background: urgent ? n.i.color : '#3fcf8e', color: '#140f05', boxShadow: '0 2px 8px rgba(0,0,0,.35)' }}>
                    {urgent ? `${n.i.rank === 0 ? 'Overdue' : 'Due'} · ${n.r.title}` : 'All clear'}
                  </span>
                  {lim && (
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: DRIVE[lim.drive!].color, color: '#140f05', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: '.02em' }}>
                      <Icon n="alert" w={2.4} /><span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lim.drive} only</span>
                    </div>
                  )}
                  {v.photo
                    ? <div role="img" aria-label="Car photo" style={{ width: '100%', height: '100%', backgroundImage: `url("${v.photo}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(120% 90% at 50% 0%, var(--accs), transparent 70%)' }}>
                        <span style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 54, lineHeight: 1, letterSpacing: '-.02em', color: 'var(--acc)' }}>{(v.model || v.make || '').split(' ')[0].slice(0, 6)}</span>
                      </div>}
                </div>
                <button className="plain" onClick={() => open(v)} style={{ padding: '12px 10px 10px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                    <div className="mono" style={{ fontSize: 12, letterSpacing: '.04em', color: 'var(--mut)', lineHeight: 1.3 }}>{v.year} · {v.make} {v.model}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 26, lineHeight: 1.1, minWidth: 0 }}>{v.nickname || v.model}</div>
                      {v.plate && <span className="rego">{v.plate}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }} />{/* stats slot, kept for the design's spacing */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: 'var(--mut)' }}>
                    <span>{n ? `${n.r.title} · ${n.i.short}` : 'Nothing scheduled'}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--fg)', fontWeight: 500 }}>Open<Icon n="arrow" s={15} /></span>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
        {!cars.length && <div style={{ color: 'var(--mut)', fontSize: 14 }}>No cars yet. Add your first one with the + button.</div>}

        {sold.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="plain" onClick={() => setSoldOpen(!soldOpen)} aria-expanded={soldOpen} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--mut)' }}>
              <span className="label">Sold &amp; archived</span><span className="mono" style={{ fontSize: 11 }}>{sold.length}</span><span>{soldOpen ? '▴' : '▾'}</span>
            </button>
            {soldOpen && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,280px),1fr))', gap: 10 }}>
                {sold.map(v => (
                  <button key={v.id} className="plain" onClick={() => open(v)} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 2, opacity: 0.8 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{v.nickname || v.model}</span>
                    <span style={{ fontSize: 12, color: 'var(--mut)' }}>{v.year} {v.make} {v.model} · sold {fdate(v.sold!.date)}{v.sold!.to ? ' to ' + v.sold!.to : ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {due.length > 0 && (
          <div className="card" style={{ gap: 4 }}>
            <div className="card-h" style={{ marginBottom: 8 }}>
              <span className="card-t">Due</span>
              <span className="mono mut" style={{ fontSize: 11 }}>{[nBlk ? `${nBlk} blocker${nBlk > 1 ? 's' : ''}` : '', `${nOver} overdue`, `${nSoon} due soon`].filter(Boolean).join(' · ')}</span>
            </div>
            {due.map(x => {
              const t = x.kind === 'rem'
                ? { key: x.r.id, title: x.r.title, status: x.i.status, bg: tint(x.i.color, '22'), fg: x.i.color, due: x.i.due, btn: 'Mark done', go: nav.soon }
                : { key: x.c.id, title: x.c.title, status: x.status, bg: x.blk ? x.color : tint(x.color, '22'), fg: x.blk ? '#140f05' : x.color, due: x.due, btn: 'View task', go: () => nav.go({ view: 'car', activeId: x.v.id, sec: 'board' }) };
              return (
                <div key={t.key} className="row" style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '10px 0' }}>
                  <span className="pill" style={{ minWidth: 72, textAlign: 'center', background: t.bg, color: t.fg }}>{t.status}</span>
                  <button className="plain dim" onClick={t.go} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{t.title} <span style={{ fontWeight: 400, color: 'var(--mut)' }}>· {vLabel(x.v)}</span></span>
                    <span style={{ fontSize: 12, color: 'var(--mut)' }}>{t.due}</span>
                  </button>
                  <button className="btn" onClick={t.go} style={{ boxSizing: 'border-box', height: 32, padding: '0 12px', fontSize: 12 }}><Icon n="check" s={14} w={2.2} />{t.btn}</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
