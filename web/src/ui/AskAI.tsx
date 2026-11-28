// The "Ask AI" panel over a task. It sits above the task dialog; replies can be kept as task notes.
import { type CSSProperties, useEffect, useState } from 'react';
import type { CardForm } from '../lib/actions.ts';
import { AI0, AI_PROV, AI_QUICK, aiContext, type AiMsg, aiPrompt } from '../lib/ai.ts';
import type { Calc } from '../lib/model.ts';
import type { Store } from '../lib/store.ts';
import { excerpts, refsLine } from '../lib/manual.ts';
import { Icon } from './icons.tsx';

const info = <svg className="i" viewBox="0 0 24 24" width={14} height={14} aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>;
const chip: CSSProperties = { boxSizing: 'content-box', height: 30, padding: '0 12px', borderRadius: 999, border: '1px solid var(--line2)', fontSize: 12, display: 'flex', alignItems: 'center' };

export function AskAI({ calc, store, vid, form, onSave, onClose }: { calc: Calc; store: Store; vid: string; form: CardForm; onSave: (text: string) => void; onClose: () => void }) {
  const g = calc.g, cfg = { ...AI0, ...g.ai }, pv = AI_PROV[cfg.provider], v = g.vehicles.find(x => x.id === vid)!;
  const [ctx] = useState(() => aiContext(calc, vid, form)); // what was sent stays fixed while the panel is open
  const [thread, setThread] = useState<AiMsg[]>([]);
  const [prompt, setPrompt] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState(''), [showCtx, setShowCtx] = useState(false);
  // Esc closes this panel only, not the task under it.
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } }; window.addEventListener('keydown', h, true); return () => window.removeEventListener('keydown', h, true); }, [onClose]);
  const ask = async (q0?: string) => {
    const q = (q0 ?? prompt).trim(); if (!q || busy) return;
    const before = thread;
    setThread([...before, { role: 'user', text: q }]); setPrompt(''); setBusy(true); setErr('');
    const ex = cfg.shareManual ? await excerpts(v, form.title + ' ' + q).catch(() => []) : [];
    const r = await store.ai(aiPrompt(ctx, before, q, ex));
    setBusy(false);
    if (r.error) setErr(r.error); else setThread(t => [...t, { role: 'ai', text: (r.text || '').replace(/\*\*/g, '').trim(), refs: refsLine(ex) }]);
  };
  const save = (i: number) => { const m = thread[i]; if (m.saved) return; onSave('AI suggestion\n' + m.text); setThread(t => t.map((x, j) => (j === i ? { ...x, saved: true } : x))); };
  const ms = v.manuals || [], manual = !cfg.shareManual ? 'Workshop manual lookup is off in Admin settings' : ms.length ? `Checks ${ms.map(m => m.name.replace(/\.[a-z0-9]+$/i, '')).join(', ')} first` : 'No workshop manual for this car yet — add one in Car details and AI will use it first';
  const can = !!prompt.trim() && !busy;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label={'Ask AI: ' + form.title} onClick={e => e.stopPropagation()} style={{ width: 'min(660px,100%)', maxHeight: '90vh', overflow: 'auto', background: 'var(--card)', border: '1px solid var(--line2)', borderRadius: 22, padding: 22, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 24px 60px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0 }}>
            <span style={{ width: 36, height: 36, flex: 'none', borderRadius: 10, background: 'var(--accs)', color: 'var(--acc)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon n="sparkle" s={18} /></span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 24, lineHeight: 1.15 }}>{form.title}</span>
              <span style={{ fontSize: 12, color: 'var(--mut)' }}>{v.nickname || v.model} · {pv.label}{cfg.model ? ' · ' + cfg.model : ''}</span>
              <span style={{ fontSize: 12, color: 'var(--mut)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}><Icon n="book" s={13} style={{ flex: 'none' }} />{manual}</span>
            </div>
          </div>
          <button type="button" className="plain icon-btn" onClick={onClose} title="Close" aria-label="Close"><Icon n="x" /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" className="plain to-fg" aria-expanded={showCtx} onClick={() => setShowCtx(x => !x)} style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--mut)', display: 'flex', alignItems: 'center', gap: 6 }}>{info}{showCtx ? 'Hide what gets sent' : 'What gets sent'} <span className="mono" style={{ fontSize: 11 }}>{ctx.split('\n').filter(Boolean).length} lines</span></button>
          {showCtx && <pre style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.55, background: 'var(--card2)', borderRadius: 12, padding: '12px 14px', maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap', color: 'var(--mut)' }}>{ctx}</pre>}
        </div>
        {thread.map((m, i) => m.role === 'user'
          ? <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '85%', background: 'var(--accs)', borderRadius: '14px 14px 4px 14px', padding: '10px 14px', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{m.text}</div>
          : <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--card2)', border: '1px solid var(--line)', borderRadius: '4px 14px 14px 14px', padding: '12px 14px' }}>
              <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.text}</div>
              {m.refs && <span className="mono mut" style={{ fontSize: 11 }}>{m.refs}</span>}
              <button type="button" className="plain" onClick={() => save(i)} style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: 500, color: m.saved ? 'var(--up)' : 'var(--acc)' }}>{m.saved ? 'Saved to task notes' : 'Save to task notes'}</button>
            </div>)}
        {busy && <div role="status" style={{ fontSize: 13, color: 'var(--mut)' }}>Thinking…</div>}
        {err && <div role="alert" style={{ fontSize: 13, color: 'var(--down)', padding: '10px 12px', borderRadius: 10, background: 'rgba(242,104,95,.1)' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{AI_QUICK.map(([l, q]) => <button key={l} type="button" className="plain hov" style={chip} onClick={() => ask(q)}>{l}</button>)}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea aria-label="Your question" placeholder="Describe the symptoms, what you've tried, or what you're unsure about" value={prompt} onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ask(); } }}
            style={{ flex: 1, minWidth: 0, minHeight: 64, borderRadius: 12, border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--fg)', padding: '10px 12px', fontSize: 14, resize: 'vertical', fontFamily: 'inherit' }} />
          <button type="button" className="plain" onClick={() => ask()} style={{ height: 40, padding: '0 18px', borderRadius: 999, background: can ? 'var(--acc)' : 'var(--card2)', color: can ? 'var(--accfg)' : 'var(--mut)', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center' }}>Ask</button>
        </div>
        <span style={{ fontSize: 12, color: 'var(--mut)' }}>AI can be wrong. Check torque specs and anything safety-critical against a workshop manual. Ctrl / ⌘ + Enter sends.</span>
      </div>
    </div>
  );
}
