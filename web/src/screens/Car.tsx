import { useState } from 'react';
import type { Nav } from '../App.tsx';
import { type Calc, DRIVE, driveLimit, fdate, type Sec, SECS, type User, type Vehicle } from '../lib/model.ts';
import type { Store } from '../lib/store.ts';
import { AccountMenu } from '../ui/AccountMenu.tsx';
import { Icon, type IconName } from '../ui/icons.tsx';
import { Overview } from './Overview.tsx';
import { blankRecord, fuelRecord, odoForm } from '../ui/Dialogs.tsx';
import { cardForm } from '../lib/actions.ts';
import { Board } from './Board.tsx';
import { History } from './History.tsx';
import { Fuel } from './Fuel.tsx';
import { Reminders } from './Reminders.tsx';
import { Notes } from './Notes.tsx';
import { Details } from './Details.tsx';
import { Specs } from './Specs.tsx';
import { Parts } from './Parts.tsx';

export type Tab = { calc: Calc; car: Vehicle; nav: Nav; store: Store; me: User };

const NAV: [Sec, string, IconName, string][] = [
  ['overview', 'Overview', 'grid', 'Overview'], ['details', 'Details', 'car', 'Car details'], ['specs', 'Specs', 'ruler', 'Specs'],
  ['board', 'Board', 'board', 'Build board'], ['photos', 'Photos', 'image', 'Build photos'], ['history', 'History', 'wrench', 'Service history'],
  ['fuel', 'Fuel', 'fuel', 'Fuel log'], ['reminders', 'Reminders', 'bell', 'Reminders'], ['parts', 'Parts', 'box', 'Parts'], ['notes', 'Notes', 'notes', 'Notes'],
];
const TABS: [Sec, string][] = [['overview', 'Overview'], ['board', 'Board'], ['fuel', 'Fuel'], ['reminders', 'Due']];

export function Car({ store, me, calc, car, nav, narrow }: { store: Store; me: User; calc: Calc; car: Vehicle; nav: Nav; narrow: boolean }) {
  const g = calc.g, sec = nav.ui.sec;
  const [scrolled, setScrolled] = useState(false);
  const [carMenu, setCarMenu] = useState(false);
  const st = calc.stats(car);
  const tab: Tab = { calc, car, nav, store, me };
  const board = g.boards[car.id] || { backlog: [], parts: [], progress: [], done: [] };
  const lim = driveLimit(board);
  const limN = (['backlog', 'parts', 'progress'] as const).reduce((a, k) => a + board[k].filter(c => c.drive && DRIVE[c.drive].rank > 0).length, 0);
  const full = g.settings.fullWidth || narrow;
  const name = car.nickname || car.model;
  const kicker = [car.year, car.nickname ? `${car.make} ${car.model}` : car.make].filter(Boolean).join(' · ');
  const moreOpts = (Object.entries(SECS) as [Sec, string][]).filter(([k]) => !['overview', 'board', 'fuel', 'reminders', 'manual'].includes(k));

  return (
    <>
      {narrow && <>
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 45, display: 'flex', justifyContent: 'space-around', alignItems: 'stretch', padding: '6px 4px calc(6px + env(safe-area-inset-bottom))', background: 'rgba(11,11,11,.94)', borderTop: '1px solid var(--line2)', backdropFilter: 'blur(10px)' }}>
          {TABS.map(([k, l]) => (
            <button key={k} className="plain" onClick={() => nav.go({ sec: k })} style={{ flex: 1, minHeight: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, fontSize: 11, fontWeight: sec === k ? 600 : 500, color: sec === k ? 'var(--fg)' : 'var(--mut)' }}>
              {l}<span style={{ width: 18, height: 3, borderRadius: 2, background: sec === k ? 'var(--acc)' : 'transparent' }} />
            </button>
          ))}
          <select value={TABS.some(([k]) => k === sec) ? '' : sec} onChange={e => e.target.value && nav.go({ sec: e.target.value as Sec })} title="More sections" style={{ flex: 1, minHeight: 48, background: 'transparent', border: 0, color: 'var(--mut)', fontSize: 11, textAlign: 'center' }}>
            <option value="">More</option>
            {moreOpts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <button className="plain" onClick={() => nav.open({ kind: 'record', vid: car.id, form: fuelRecord(calc, car.id) })} title="Add fill-up" style={{ position: 'fixed', right: 16, bottom: 'calc(76px + env(safe-area-inset-bottom))', zIndex: 46, height: 56, padding: '0 22px', borderRadius: 999, background: '#e8b04b', color: '#1a1408', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 10px 30px rgba(0,0,0,.5)' }}><Icon n="plus" s={18} w={2.4} />Fill-up</button>
      </>}

      <div className="frame" style={{ display: 'flex', overflow: 'clip' }}>
        <nav className="noscroll" aria-label="Car sections" style={{ width: 88, flex: 'none', borderRight: '1px solid var(--line)', display: narrow ? 'none' : 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '16px 0', height: '100%', overflowY: 'auto', background: 'var(--bg)' }}>
          <button className="plain" onClick={() => nav.go({ view: 'home' })} title="Back to garage" style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--acc)', color: 'var(--accfg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, marginBottom: 14 }}>G</button>
          {NAV.map(([k, label, ic, title]) => (
            <button key={k} className={'nav-i' + (sec === k ? ' on' : '')} onClick={() => nav.go({ sec: k })} title={title} aria-current={sec === k ? 'page' : undefined}>
              <Icon n={ic} s={k === 'overview' ? 20 : 18} /><span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="noscroll" onScroll={e => setScrolled(e.currentTarget.scrollTop > 8)} style={{ flex: 1, minWidth: 0, height: '100%', overflowY: 'auto', padding: narrow ? '0 14px 150px' : '0 28px 48px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gridAutoRows: 'max-content', alignContent: 'start', gap: 16 }}>
          <header style={{ position: 'sticky', top: 0, zIndex: 30, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', margin: narrow ? '0 -14px' : '0 -28px', padding: narrow ? '14px 14px 12px' : '20px 28px 14px', background: full ? 'var(--bg)' : 'var(--frame)', borderBottom: `1px solid ${scrolled ? 'var(--line)' : 'transparent'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
              <div style={{ position: 'relative' }}>
                <button className="plain" onClick={() => setCarMenu(!carMenu)} title="Switch car" aria-expanded={carMenu} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: narrow ? 28 : 40, lineHeight: 1.05 }}>{name}</span>
                  <Icon n="chevron" s={20} style={{ opacity: 0.6 }} />
                </button>
                {carMenu && <>
                  <div className="scrim" onClick={() => setCarMenu(false)} />
                  <div className="menu" style={{ left: 0, top: 54, minWidth: 260 }}>
                    {g.vehicles.map(v => (
                      <button key={v.id} className="menu-i" onClick={() => { setCarMenu(false); nav.go({ activeId: v.id }); }} style={{ background: v.id === car.id ? 'var(--card2)' : undefined }}>
                        <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{v.nickname || v.model}</span><span style={{ display: 'block', fontSize: 11, color: 'var(--mut)' }}>{v.year} {v.make} {v.model}</span></span>
                        {v.plate && <span className="mono" style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: 'var(--fg)', color: 'var(--bg)' }}>{v.plate}</span>}
                      </button>
                    ))}
                    <button className="menu-i" onClick={() => nav.go({ view: 'home' })} style={{ color: 'var(--mut)', borderTop: '1px solid var(--line)', marginTop: 4, borderRadius: 0 }}>All cars</button>
                  </div>
                </>}
              </div>
              <span className="mono" style={{ fontSize: 12, letterSpacing: '.04em', color: 'var(--mut)' }}>{kicker}</span>
              {car.plate && <span className="rego">{car.plate}</span>}
              {car.vin && <span title="VIN" className="mono" style={{ display: 'inline-flex', alignItems: 'center', height: 28, padding: '0 12px', border: '1px solid var(--line2)', borderRadius: 999, fontSize: 12, color: 'var(--mut)', whiteSpace: 'nowrap', letterSpacing: '.04em', gap: 6 }}><span>VIN</span><span style={{ color: 'var(--fg)' }}>{car.vin}</span></span>}
            </div>
            <div style={{ flex: 1 }} />
            {sec === 'board' && (
              <button type="button" role="switch" aria-checked={g.settings.showDoneCol !== false} className="btn" title="Show or hide the Done column" style={{ gap: 8, padding: '0 14px' }}
                onClick={() => store.update(g2 => ({ ...g2, settings: { ...g2.settings, showDoneCol: g2.settings.showDoneCol === false } }))}>
                <span>Show Done Column<br /></span>
                <span style={{ width: 36, height: 22, borderRadius: 999, flex: 'none', position: 'relative', background: g.settings.showDoneCol !== false ? 'var(--acc)' : '#2e2e2e' }}>
                  <span style={{ position: 'absolute', top: 3, left: g.settings.showDoneCol !== false ? 17 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
                </span>
              </button>
            )}
            <AccountMenu me={me} onSwitch={store.logout} onSignOut={store.logout} go={view => nav.go({ view })} />
            <button className="btn mono" onClick={() => nav.open({ kind: 'odo', vid: car.id, form: odoForm(calc, car.id) })} title="Update the odometer"><Icon n="gauge" s={15} />{Number(st.odo).toLocaleString()} {calc.u}</button>
            {!narrow && <button className="btn-fuel" onClick={() => nav.open({ kind: 'record', vid: car.id, form: fuelRecord(calc, car.id) })}><Icon n="fuel" s={15} />Add fill-up</button>}
            <button className="btn-p" onClick={() => nav.open({ kind: 'record', vid: car.id, form: blankRecord(calc, car.id) })}><Icon n="plus" w={2.2} />Log service</button>
          </header>

          {car.sold && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', borderRadius: 14, border: '1px solid var(--line2)', background: 'var(--card)' }}>
              <span className="label">Archived</span>
              <span style={{ fontSize: 14, flex: 1, minWidth: 200 }}>Sold {fdate(car.sold.date)}{car.sold.to ? ' to ' + car.sold.to : ''}{car.sold.price != null ? ' for ' + calc.money(car.sold.price) : ''}. Reminders are off; history is kept.</span>
            </div>
          )}
          {lim && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 16, background: DRIVE[lim.drive!].color, color: '#140f05', flexWrap: 'wrap' }}>
              <Icon n="alert" s={22} w={2.2} style={{ flex: 'none' }} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-.01em', textTransform: 'uppercase' }}>{lim.drive} only</div>
                <div style={{ fontSize: 13, opacity: 0.8 }}>Until “{lim.title}” is fixed{limN > 1 ? ` · ${limN - 1} more task${limN > 2 ? 's' : ''} also limit driving` : ''}</div>
              </div>
              <button className="plain" onClick={() => { nav.go({ sec: 'board' }); const k = (['backlog', 'parts', 'progress'] as const).find(c => board[c].some(x => x.id === lim.id))!; nav.open({ kind: 'card', vid: car.id, form: cardForm(lim, k, board[k].findIndex(x => x.id === lim.id)) }); }} style={{ height: 36, padding: '0 16px', borderRadius: 999, background: 'rgba(0,0,0,.82)', color: '#fff', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>View task<Icon n="arrow" s={14} /></button>
            </div>
          )}

          {sec === 'overview' ? <Overview calc={calc} car={car} nav={nav} />
            : sec === 'board' ? <Board {...tab} narrow={narrow} />
            : sec === 'history' ? <History {...tab} />
            : sec === 'fuel' ? <Fuel {...tab} />
            : sec === 'reminders' ? <Reminders {...tab} />
            : sec === 'notes' ? <Notes {...tab} />
            : sec === 'details' ? <Details {...tab} />
            : sec === 'specs' ? <Specs {...tab} />
            : sec === 'parts' ? <Parts {...tab} />
            : <div className="card" style={{ alignItems: 'flex-start', gap: 6 }}><span className="card-t">{SECS[sec]}</span><span className="mut" style={{ fontSize: 13 }}>This section isn’t built yet. It’s coming in the next updates.</span></div>}
        </div>
      </div>
    </>
  );
}
