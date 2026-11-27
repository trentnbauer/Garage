import { type ReactNode, useEffect } from 'react';
import { Icon } from './icons.tsx';

/** Esc closes the top-most dialog. */
function useEsc(onClose: () => void) {
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
}

export function Modal({ title, sub, onClose, width = 640, children }: { title: string; sub?: string; onClose: () => void; width?: number; children: ReactNode }) {
  useEsc(onClose);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()} style={{ width: `min(${width}px,100%)`, maxHeight: '88vh', overflow: 'auto', background: 'var(--card)', border: '1px solid var(--line2)', borderRadius: 22, padding: 22, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 24px 60px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div><div style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 24 }}>{title}</div>{sub && <div style={{ fontSize: 13, color: 'var(--mut)' }}>{sub}</div>}</div>
          <button type="button" className="plain icon-btn" onClick={onClose} title="Close" aria-label="Close"><Icon n="x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export type Ask = { title: string; body: string; label: string; fn: () => void };

export function Confirm({ ask, onClose }: { ask: Ask; onClose: () => void }) {
  useEsc(onClose);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="alertdialog" aria-modal="true" aria-label={ask.title} onClick={e => e.stopPropagation()} style={{ width: 'min(400px,100%)', background: 'var(--card)', border: '1px solid var(--line2)', borderRadius: 22, padding: 22, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 24px 60px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ width: 36, height: 36, flex: 'none', borderRadius: '50%', background: 'rgba(242,104,95,.14)', color: 'var(--down)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon n="trash" s={18} /></span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={{ fontWeight: 600, fontSize: 16 }}>{ask.title}</span><span style={{ fontSize: 13, color: 'var(--mut)', lineHeight: 1.45 }}>{ask.body}</span></div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
          <button type="button" className="btn" style={{ padding: '0 16px' }} onClick={onClose} autoFocus>Cancel</button>
          <button type="button" className="btn-danger" onClick={() => { onClose(); ask.fn(); }}>{ask.label}</button>
        </div>
      </div>
    </div>
  );
}
