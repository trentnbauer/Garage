import { useState } from 'react';
import type { User } from '../lib/model.ts';
import { Icon } from './icons.tsx';

/** Avatar pill with the account menu. `big` is the home-page size (44px), otherwise the car header size (36px). */
export function AccountMenu({ me, big, onSwitch, onSignOut }: { me: User; big?: boolean; onSwitch: () => void; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const av = big ? 34 : 28;
  return (
    <div style={{ position: 'relative' }}>
      <button className="plain hov" onClick={() => setOpen(!open)} title="Account" aria-expanded={open}
        style={{ height: big ? 44 : 36, padding: big ? '0 12px 0 5px' : '0 10px 0 4px', borderRadius: 999, border: '1px solid var(--line2)', display: 'flex', alignItems: 'center', gap: 8, background: open ? 'var(--card2)' : 'transparent' }}>
        <span style={{ width: av, height: av, borderRadius: '50%', background: me.color, color: '#0d0e10', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>{(me.name || '?')[0].toUpperCase()}</span>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{me.name}</span>
        <Icon n="chevron" s={14} style={{ opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && <>
        <div className="scrim" onClick={() => setOpen(false)} />
        <div className="menu" style={{ right: 0, top: big ? 52 : 44 }}>
          <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid var(--line)', marginBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{me.name}</div>
            <div style={{ fontSize: 11, color: 'var(--mut)' }}>{(me.role === 'admin' ? 'Admin' : 'Member') + ' · this device'}</div>
          </div>
          {/* Settings and Admin settings join this menu when those screens are built. */}
          <button className="menu-i" onClick={() => { setOpen(false); onSwitch(); }}><Icon n="users" />Switch person</button>
          <button className="menu-i danger" onClick={() => { setOpen(false); onSignOut(); }}><Icon n="logout" />Sign out of this device</button>
        </div>
      </>}
    </div>
  );
}
