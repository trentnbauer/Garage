import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react';
import type { Tab } from './Car.tsx';

// Inline markdown: `code`, **bold**, *italic*. Built as React nodes, so nothing is injected as HTML.
function inline(t: string, key = 0): ReactNode[] {
  const m = t.match(/`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/);
  if (!m || m.index == null) return t ? [t] : [];
  const before = t.slice(0, m.index), rest = t.slice(m.index + m[0].length);
  const node = m[1] != null ? <code key={key} style={{ fontFamily: 'var(--mono)', fontSize: '.9em', background: 'var(--card2)', padding: '1px 5px', borderRadius: 4 }}>{m[1]}</code>
    : m[2] != null ? <b key={key}>{m[2]}</b> : <i key={key}>{m[3]}</i>;
  return [...(before ? [before] : []), node, ...inline(rest, key + 1)];
}

/** The markdown Garage notes support: ## headings, - lists, | tables |, and inline code/bold/italic. */
export function Markdown({ src }: { src: string }) {
  const out: ReactNode[] = [];
  let list: string[] | null = null, tbl: string[][] | null = null;
  const flush = () => {
    if (list) { out.push(<ul key={out.length} style={{ margin: '6px 0 12px', paddingLeft: 20, lineHeight: 1.7 }}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>); list = null; }
    if (tbl) {
      out.push(<table key={out.length} style={{ borderCollapse: 'collapse', margin: '8px 0 14px', fontSize: 14 }}><tbody>{tbl.map((r, i) => <tr key={i}>{r.map((c, j) => {
        const st = { textAlign: 'left' as const, padding: '5px 14px 5px 0', borderBottom: '1px solid var(--line)', ...(i ? {} : { color: 'var(--mut)', fontWeight: 500 }) };
        return i ? <td key={j} style={st}>{inline(c.trim())}</td> : <th key={j} style={st}>{inline(c.trim())}</th>;
      })}</tr>)}</tbody></table>);
      tbl = null;
    }
  };
  src.split('\n').forEach(l => {
    const h = l.match(/^(#{1,3})\s+(.*)/);
    if (h) { flush(); const n = h[1].length; const H = (['h2', 'h3', 'h4'] as const)[n - 1]; out.push(<H key={out.length} style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: [24, 20, 17][n - 1], margin: '18px 0 6px' }}>{inline(h[2])}</H>); return; }
    const li = l.match(/^\s*[-*]\s+(.*)/);
    if (li) { if (tbl) flush(); (list = list || []).push(li[1]); return; }
    if (/^\s*\|/.test(l)) { if (list) flush(); if (/^\s*\|?\s*:?-{2,}/.test(l)) return; (tbl = tbl || []).push(l.replace(/^\s*\||\|\s*$/g, '').split('|')); return; }
    flush(); if (l.trim()) out.push(<p key={out.length} style={{ margin: '6px 0', lineHeight: 1.7 }}>{inline(l)}</p>);
  });
  flush();
  return <Fragment>{out}</Fragment>;
}

export function Notes({ calc, car, store }: Tab) {
  const text = calc.g.notes[car.id] || '';
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const t = useRef<number>();
  useEffect(() => () => window.clearTimeout(t.current), []);
  const set = (v: string) => {
    store.update(g => ({ ...g, notes: { ...g.notes, [car.id]: v } }));
    setState('saving'); window.clearTimeout(t.current); t.current = window.setTimeout(() => setState('saved'), 1000);
  };
  const addSec = (title: string) => { if (text.includes('## ' + title)) return; set((text.trim() ? text.replace(/\s*$/, '') + '\n\n' : '') + '## ' + title + '\n- '); };

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 12px', borderBottom: '1px solid var(--line)' }}>
        <div role="tablist" style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--card2)', borderRadius: 10 }}>
          {([['edit', 'Write'], ['preview', 'Preview']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={mode === k} type="button" className="plain" onClick={() => setMode(k)} style={{ padding: '5px 12px', borderRadius: 8, fontSize: 13, background: mode === k ? 'var(--card)' : 'transparent', color: mode === k ? 'var(--fg)' : 'var(--mut)' }}>{l}</button>)}
        </div>
        {mode === 'edit' && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['Torque specs', 'Fluids & capacities', 'Wiring', 'Known quirks'].map(l => <button key={l} type="button" className="btn ghost" onClick={() => addSec(l)} title="Add a section" style={{ height: 30, padding: '0 10px', fontSize: 12, gap: 4 }}><span>+</span><span>{l}</span></button>)}
        </div>}
        <span role="status" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--mut)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: state === 'saving' ? 'var(--warn)' : 'var(--up)' }} />{state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Saved automatically'}
        </span>
      </div>
      {mode === 'edit' ? <>
        <textarea aria-label="Notes" value={text} onChange={e => set(e.target.value)} placeholder="Write anything about this car. Markdown works: ## Heading, - list item, **bold**, `code`." style={{ width: '100%', minHeight: 440, border: 0, background: 'transparent', color: 'var(--fg)', padding: 18, fontSize: 15, lineHeight: 1.7, resize: 'vertical', fontFamily: 'var(--mono)' }} />
        <div style={{ padding: '8px 18px 12px', fontSize: 12, color: 'var(--mut)' }}>Markdown: ## heading · - list · **bold** · `code` · | tables | too |</div>
      </> : <div style={{ padding: '6px 22px 22px', minHeight: 440 }}><div style={{ fontSize: 15, color: 'var(--fg)' }}>{text.trim() ? <Markdown src={text} /> : <p style={{ color: 'var(--mut)' }}>Nothing written yet.</p>}</div></div>}
    </div>
  );
}
