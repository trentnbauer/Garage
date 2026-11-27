import { type CSSProperties, useEffect, useState } from 'react';
import { accentTheme, Calc, type Sec } from './lib/model.ts';
import { useStore, usePersisted } from './lib/store.ts';
import { Login } from './screens/Login.tsx';
import { Home } from './screens/Home.tsx';
import { Car } from './screens/Car.tsx';

export type Ui = { view: 'home' | 'car'; activeId: string; sec: Sec };
export type Nav = { ui: Ui; go: (p: Partial<Ui>) => void; soon: () => void };

export function App() {
  const store = useStore();
  const [ui, setUi] = usePersisted<Ui>('garage-ui', { view: 'home', activeId: 'v1', sec: 'overview' });
  const [narrow, setNarrow] = useState(() => window.innerWidth < 760);
  const [toast, setToast] = useState('');
  useEffect(() => { const h = () => setNarrow(window.innerWidth < 760); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2500); return () => clearTimeout(t); }, [toast]);

  const { g, me } = store;
  const t = accentTheme(g?.settings.accent);
  const rootStyle = { '--acc': t.acc, '--accs': t.accs, '--accfg': t.fg, minHeight: '100vh', display: 'flow-root' } as CSSProperties;
  const cls = [narrow ? 'narrow' : '', g?.settings.fullWidth ? 'full' : ''].join(' ');

  if (!g) return <div className={cls} style={rootStyle}><div className="frame" style={{ display: 'grid', placeItems: 'center', color: 'var(--mut)' }}>{store.error || ''}</div></div>;

  const meU = g.users.find(u => u.id === me && !u.removed);
  const nav: Nav = { ui, go: p => setUi(u => ({ ...u, ...p })), soon: () => setToast('That part of Garage isn’t built yet.') };
  const calc = new Calc(g);
  const car = g.vehicles.find(v => v.id === ui.activeId) || g.vehicles[0];

  return (
    <div className={cls} style={rootStyle}>
      {!meU ? <Login store={store} />
        : ui.view === 'car' && car ? <Car store={store} me={meU} calc={calc} car={car} nav={nav} narrow={narrow} />
        : <Home store={store} me={meU} calc={calc} nav={nav} narrow={narrow} />}
      {(toast || store.error) && <div role="status" style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 60, background: 'var(--card)', border: '1px solid var(--line2)', borderRadius: 999, padding: '10px 18px', fontSize: 13, boxShadow: '0 16px 40px rgba(0,0,0,.5)', color: store.error ? 'var(--down)' : 'var(--fg)' }}>{store.error || toast}</div>}
    </div>
  );
}
