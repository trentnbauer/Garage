// Workshop manual: search every page's text, read the PDF page by page with matches highlighted.
import { useEffect, useMemo, useRef, useState } from 'react';
import { pagesOf, pdfOf } from '../lib/manual.ts';
import { Icon } from '../ui/icons.tsx';
import type { Tab } from './Car.tsx';

const seg = (txt: string, terms: string[]) => {
  if (!terms.length) return [txt];
  const re = new RegExp('(' + terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
  return txt.split(re).filter(Boolean).map((p, i) => (terms.includes(p.toLowerCase()) ? <mark key={i} style={{ background: 'rgba(255,210,0,.85)', color: '#1a1408', borderRadius: 3 }}>{p}</mark> : <span key={i}>{p}</span>));
};
const iconBtn = { width: 32, height: 32, borderRadius: 9 };

export function Manual({ car, nav }: Tab) {
  const ms = car.manuals || [];
  const [id, setId] = useState(ms[0]?.id || ''), m = ms.find(x => x.id === id) || ms[0];
  const [q, setQ] = useState(''), [page, setPage] = useState(1), [zoom, setZoom] = useState(1), [pages, setPages] = useState<string[] | null>(null), [err, setErr] = useState('');
  const cv = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);
  useEffect(() => { setPages(null); setPage(1); if (m) pagesOf(m).then(setPages); }, [m?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const terms = useMemo(() => [...new Set(q.toLowerCase().match(/[a-z0-9]+/g) || [])].filter(t => t.length > 1), [q]);
  const results = useMemo(() => {
    if (!pages || !terms.length) return [];
    return pages.flatMap((txt, i) => {
      const low = txt.toLowerCase(); if (!terms.every(t => low.includes(t))) return [];
      let hits = 0; terms.forEach(t => { let at = low.indexOf(t); while (at > -1) { hits++; at = low.indexOf(t, at + t.length); } });
      const st = Math.max(0, low.indexOf(terms[0]) - 70);
      return [{ page: i + 1, hits, snip: (st ? '…' : '') + txt.slice(st, st + 180) + (txt.length > st + 180 ? '…' : '') }];
    });
  }, [pages, terms]);
  const isPdf = !!m && /\.pdf$/i.test(m.name);
  // Draw the page to fit the viewer (zoom 1 = fit), then highlight the search terms on it.
  useEffect(() => {
    if (!m || !isPdf || !cv.current || !box.current) return;
    let live = true, task: { cancel: () => void } | null = null;
    pdfOf(m).then(async doc => {
      const pg = await doc.getPage(Math.min(page, doc.numPages)); if (!live || !cv.current || !box.current) return;
      const w = Math.max(320, box.current.clientWidth - 32), h = Math.max(360, box.current.clientHeight - 32), base = pg.getViewport({ scale: 1 });
      const scale = Math.min(w / base.width, h / base.height) * zoom, vp = pg.getViewport({ scale }), dpr = window.devicePixelRatio || 1, c = cv.current;
      c.width = Math.floor(vp.width * dpr); c.height = Math.floor(vp.height * dpr); c.style.width = Math.floor(vp.width) + 'px'; c.style.height = Math.floor(vp.height) + 'px';
      const ctx = c.getContext('2d')!, t = pg.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }); task = t;
      await t.promise; if (!live || !terms.length) return;
      const tc = await pg.getTextContent(); ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgba(255,210,0,.6)';
      for (const it of tc.items) {
        if (!('str' in it) || !it.str) continue;
        const str = it.str.toLowerCase(), tx = [vp.transform[0] * it.transform[0] + vp.transform[2] * it.transform[1], vp.transform[1] * it.transform[0] + vp.transform[3] * it.transform[1], vp.transform[0] * it.transform[2] + vp.transform[2] * it.transform[3], vp.transform[1] * it.transform[2] + vp.transform[3] * it.transform[3], vp.transform[0] * it.transform[4] + vp.transform[2] * it.transform[5] + vp.transform[4], vp.transform[1] * it.transform[4] + vp.transform[3] * it.transform[5] + vp.transform[5]];
        const fh = Math.hypot(tx[2], tx[3]), wd = (it.width || 0) * scale;
        for (const term of terms) { let at = str.indexOf(term); while (at > -1) { ctx.fillRect(tx[4] + (wd * at) / str.length - 1, tx[5] - fh * 0.95, (wd * term.length) / str.length + 2, fh * 1.25); at = str.indexOf(term, at + term.length); } }
      }
      ctx.restore(); setErr('');
    }).catch(e => { if (live && !/cancel/i.test(String(e?.name))) setErr(e?.message || 'Couldn’t show this page.'); });
    return () => { live = false; try { task?.cancel(); } catch { /* already done */ } };
  }, [m, isPdf, page, zoom, terms]);

  if (!m) return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 20, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
      <span className="card-t">No workshop manual for this car</span><span style={{ fontSize: 13, color: 'var(--mut)' }}>Upload one in Car details to read and search it here.</span>
      <button className="btn-p" onClick={() => nav.go({ sec: 'details' })}>Go to Car details</button>
    </div>
  );
  const go = (n: number) => setPage(Math.min(Math.max(1, n), m.pages));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px,320px) minmax(0,1fr)', gap: 12, alignItems: 'start', height: 'calc(100vh - 110px)' }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 20, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
        {ms.length > 1 && <select className="field" aria-label="Manual" value={m.id} onChange={e => setId(e.target.value)} style={{ padding: '0 10px', fontSize: 13 }}>{ms.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
        <input className="field" type="search" aria-label="Search the manual" placeholder="Search the manual" value={q} onChange={e => setQ(e.target.value)} />
        <span className="mono mut" style={{ fontSize: 11 }}>{!terms.length ? `${m.pages} pages · type to search` : !pages ? 'Loading text…' : results.length ? `${results.length} page${results.length > 1 ? 's' : ''} match` : 'No matches'}</span>
        <div style={{ overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2, margin: '0 -6px', minHeight: 0 }}>
          {results.slice(0, 200).map(r => (
            <button key={r.page} type="button" className="plain hov" onClick={() => go(r.page)} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: 8, borderRadius: 10, background: r.page === page ? 'var(--accs)' : undefined }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span className="mono" style={{ fontSize: 11, fontWeight: 600 }}>Page {r.page}</span><span className="mono mut" style={{ fontSize: 10 }}>{r.hits} hit{r.hits > 1 ? 's' : ''}</span></span>
              <span style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 1.45, overflowWrap: 'anywhere' }}>{seg(r.snip, terms)}</span>
            </button>
          ))}
        </div>
      </div>
      <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
          <button type="button" className="plain icon-btn" title="Previous page" aria-label="Previous page" onClick={() => go(page - 1)} style={iconBtn}><Icon n="chevron" style={{ transform: 'rotate(90deg)' }} /></button>
          <input type="number" min={1} max={m.pages} aria-label="Page" value={page} onChange={e => { const n = parseInt(e.target.value, 10); if (n) go(n); }} className="mono" style={{ height: 32, width: 64, borderRadius: 8, border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--fg)', padding: '0 8px', fontSize: 13, textAlign: 'center' }} />
          <span className="mono mut" style={{ fontSize: 12 }}>of {m.pages}</span>
          <button type="button" className="plain icon-btn" title="Next page" aria-label="Next page" onClick={() => go(page + 1)} style={iconBtn}><Icon n="chevron" style={{ transform: 'rotate(-90deg)' }} /></button>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--mut)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>{m.name}</span>
          {isPdf && <>
            <button type="button" className="plain icon-btn" title="Zoom out" aria-label="Zoom out" onClick={() => setZoom(Math.max(0.5, zoom - 0.25))} style={iconBtn}><svg className="i" viewBox="0 0 24 24" width={16} height={16} aria-hidden="true"><path d="M5 12h14" /></svg></button>
            <span className="mono mut" style={{ fontSize: 12, minWidth: 40, textAlign: 'center' }}>{zoom === 1 ? 'Fit' : Math.round(zoom * 100) + '%'}</span>
            <button type="button" className="plain icon-btn" title="Zoom in" aria-label="Zoom in" onClick={() => setZoom(Math.min(3, zoom + 0.25))} style={iconBtn}><Icon n="plus" /></button>
          </>}
          <a className="btn" href={m.src} target="_blank" rel="noreferrer" style={{ height: 32, padding: '0 12px', fontSize: 12, textDecoration: 'none', color: 'var(--fg)' }}>Open file</a>
        </div>
        {err && <div role="alert" style={{ padding: '10px 14px', fontSize: 13, color: 'var(--down)' }}>{err}</div>}
        <div ref={box} style={{ padding: 16, overflow: 'auto', background: 'var(--card2)', flex: 1, minHeight: 0, display: 'flex', justifyContent: 'safe center', alignItems: 'flex-start' }}>
          {isPdf ? <canvas ref={cv} aria-label={`Page ${page} of ${m.name}`} style={{ display: 'block', flex: 'none', background: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,.4)' }} />
            : <div className="mono" style={{ maxWidth: 760, width: '100%', background: 'var(--card)', padding: 24, borderRadius: 12, fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{pages ? seg(pages[page - 1] || '', terms) : 'Loading…'}</div>}
        </div>
      </div>
    </div>
  );
}
