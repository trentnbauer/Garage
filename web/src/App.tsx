import { type CSSProperties, useEffect, useState } from 'react';
import { accentTheme, Calc, type Sec } from './lib/model.ts';
import { useStore, usePersisted } from './lib/store.ts';
import { Login } from './screens/Login.tsx';
import { Home } from './screens/Home.tsx';
import { Car } from './screens/Car.tsx';
import { Settings } from './screens/Settings.tsx';
import { Admin } from './screens/Admin.tsx';
import { type Ask, Confirm } from './ui/Dialog.tsx';
import { type Dlg, Dialogs } from './ui/Dialogs.tsx';

export type Ui = { view: 'home' | 'car' | 'settings' | 'admin'; activeId: string; sec: Sec; tplOpen?: boolean };
export type Nav = { ui: Ui; go: (p: Partial<Ui>) => void; soon: () => void; ask: (a: Ask) => void; open: (d: Dlg) => void; view: (src: string) => void };

export function App() {
  const store = useStore();
  const [ui, setUi] = usePersisted<Ui>('garage-ui', { view: 'home', activeId: 'v1', sec: 'overview' });
  const [narrow, setNarrow] = useState(() => window.innerWidth < 760);
  const [toast, setToast] = useState('');
  const [ask, setAsk] = useState<Ask | null>(null);
  const [dlg, setDlg] = useState<Dlg | null>(null), [photo, setPhoto] = useState('');
  useEffect(() => { const h = () => setNarrow(window.innerWidth < 760); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2500); return () => clearTimeout(t); }, [toast]);

  const { g, me } = store;
  const t = accentTheme(g?.settings.accent);
  const rootStyle = { '--acc': t.acc, '--accs': t.accs, '--accfg': t.fg, minHeight: '100vh', display: 'flow-root' } as CSSProperties;
  const cls = [narrow ? 'narrow' : '', g?.settings.fullWidth ? 'full' : ''].join(' ');

  if (!g) return <div className={cls} style={rootStyle}><div className="frame" style={{ display: 'grid', placeItems: 'center', color: 'var(--mut)' }}>{store.error || ''}</div></div>;

  const meU = g.users.find(u => u.id === me && !u.removed);
  const nav: Nav = { ui, go: p => setUi(u => ({ ...u, ...p })), soon: () => setToast('That part of Garage isn’t built yet.'), ask: setAsk, open: setDlg, view: setPhoto };
  const calc = new Calc(g);
  // Two-factor required but not set up: Settings until it is.
  const nag = !!meU && g.auth.tfaTotp !== false && !meU.hasTotp && (g.auth.tfaRequire === 'all' || (g.auth.tfaRequire === 'admins' && meU.role === 'admin'));
  const car = g.vehicles.find(v => v.id === ui.activeId) || g.vehicles[0];

  return (
    <div className={cls} style={rootStyle}>
      {!meU ? <Login store={store} />
        : nag || ui.view === 'settings' ? <Settings store={store} me={meU} calc={calc} nav={nav} narrow={narrow} nag={nag} />
        : ui.view === 'admin' && meU.role === 'admin' ? <Admin store={store} me={meU} calc={calc} nav={nav} narrow={narrow} />
        : ui.view === 'car' && car ? <Car store={store} me={meU} calc={calc} car={car} nav={nav} narrow={narrow} />
        : <Home store={store} me={meU} calc={calc} nav={nav} narrow={narrow} />}
      {dlg && meU && <Dialogs dlg={dlg} setDlg={setDlg} calc={calc} store={store} me={meU} nav={nav} narrow={narrow} />}
      {ask && <Confirm ask={ask} onClose={() => setAsk(null)} />}
      {photo && <Lightbox src={photo} onClose={() => setPhoto('')} />}
      {(toast || store.error) && <div role="status" style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 60, background: 'var(--card)', border: '1px solid var(--line2)', borderRadius: 999, padding: '10px 18px', fontSize: 13, boxShadow: '0 16px 40px rgba(0,0,0,.5)', color: store.error ? 'var(--down)' : 'var(--fg)' }}>{store.error || toast}</div>}
    </div>
  );
}

/** A photo full screen. Click or Esc closes it, before anything under it. */
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } }; window.addEventListener('keydown', h, true); return () => window.removeEventListener('keydown', h, true); }, [onClose]);
  return <div role="dialog" aria-label="Photo" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, cursor: 'zoom-out' }}><div role="img" aria-label="Photo" style={{ width: '100%', height: '100%', backgroundImage: `url("${src}")`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }} /></div>;
}
