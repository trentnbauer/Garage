// Export paperwork: choose what goes in the handover pack, then open it (print to PDF) or download it.
import { useEffect, useState } from 'react';
import { track } from '../lib/actions.ts';
import { type Calc, fdate, type Vehicle } from '../lib/model.ts';
import { packHTML, packSources, PW0, type PackOpts } from '../lib/pack.ts';
import type { Store } from '../lib/store.ts';
import { Icon } from './icons.tsx';

const dataUrl = (b: Blob) => new Promise<string>(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => ok(''); r.readAsDataURL(b); });
const Switch = ({ on }: { on: boolean }) => <span style={{ width: 44, height: 26, borderRadius: 999, flex: 'none', position: 'relative', background: on ? '#7a7a7a' : '#2e2e2e' }}><span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} /></span>;

export function Paperwork({ calc, car, store, seller0, me, onClose }: { calc: Calc; car: Vehicle; store: Store; seller0: string; me: string; onClose: () => void }) {
  const g = calc.g;
  const [o, setO] = useState<PackOpts>(PW0), [seller, setSeller] = useState(seller0), [note, setNote] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  const recs = g.records.filter(r => r.vid === car.id), n = (ts: string[]) => recs.filter(r => ts.includes(r.type)).length;
  const b = g.boards[car.id], openN = b ? b.backlog.length + b.parts.length + b.progress.length : 0, remN = g.reminders.filter(r => r.vid === car.id && !r.done).length;
  const photoN = b ? Object.values(b).flat().reduce((a, c) => a + (c.photos || []).length, 0) : 0, fileN = recs.reduce((a, r) => a + (r.files || []).length, 0) + photoN;
  const sections: [keyof PackOpts, string, string][] = [
    ['details', 'Vehicle details', 'VIN, rego, engine'], ['specs', 'Specs', 'Torque settings, fluids, tyres, part numbers'], ['docs', 'Car documents', `${(car.docs || []).length} uploaded — rego, roadworthy, purchase`],
    ['history', 'Service & repair history', `${n(['Service', 'Repair', 'Other'])} entries`], ['inspections', 'Inspections & MOT', `${n(['Inspection'])} results, with their checklists`], ['mods', 'Modifications', `${n(['Upgrade'])} updates / modifications`],
    ['schedule', 'Maintenance schedule', `${remN} upcoming reminders, so the next owner knows what's due`], ['rego', 'Registration', car.regoExpiry ? `Expires ${fdate(car.regoExpiry)}` : `${n(['Registration'])} entries`],
    ['files', 'Receipts & attachments', fileN ? `${fileN} file${fileN === 1 ? "" : "s"}, embedded in the pack` : 'None yet — open an entry in Service history to attach receipts'],
    ['issues', 'Known open issues', openN ? `${openN} open tasks from the build board. Disclosing them protects you as the seller.` : 'Nothing open on the board'], ['fuel', 'Fuel log', `${n(['Fuel'])} fill-ups and average economy`], ['notes', "Owner's notes", 'Your free-form notes for this car'],
  ];
  const privacy: [keyof PackOpts, string, string][] = [['costs', 'Show costs', 'The price of each entry and the total spent'], ['who', 'Show who did the work', 'Owner (DIY) or workshop on each entry'], ['private', 'Purchase & insurance details', 'Purchase price, insurer and policy number. Usually left out.']];
  const row = ([k, label, hint]: [keyof PackOpts, string, string]) => (
    <button key={k} type="button" role="switch" aria-checked={o[k]} className="plain" onClick={() => { setO({ ...o, [k]: !o[k] }); setMsg(''); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
      <span style={{ minWidth: 0 }}><span style={{ display: 'block', fontSize: 14 }}>{label}</span><span style={{ display: 'block', fontSize: 12, color: 'var(--mut)' }}>{hint}</span></span><Switch on={o[k]} />
    </button>
  );

  const out = async (mode: 'open' | 'download') => {
    if (busy) return; setBusy(true); setMsg('Gathering receipts and photos…');
    // Fetch every stored file the pack shows and inline it, so the pack works offline.
    const inline: Record<string, string> = {};
    for (const src of packSources(calc, car, o)) { const r = await fetch(src, { credentials: 'same-origin' }).catch(() => null); if (r?.ok) inline[src] = await dataUrl(await r.blob()); }
    const html = packHTML(calc, car, o, { seller, note }, inline);
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' })), fname = `${(car.nickname || car.model || 'car').replace(/[^\w-]+/g, '-')}-paperwork-${calc.TODAY}.html`;
    store.update(g2 => track(g2, me, car.id, mode === 'open' ? 'opened the paperwork pack' : 'exported the paperwork pack'));
    setBusy(false);
    if (mode === 'open') { const w = window.open(url, '_blank'); if (w) { setMsg('Opened in a new tab — use Print / Save as PDF there.'); setTimeout(() => URL.revokeObjectURL(url), 60000); return; } }
    const a = document.createElement('a'); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    setMsg(mode === 'open' ? `Pop-ups are blocked here, so it downloaded instead: ${fname}. Open it and print to PDF.` : `Downloaded ${fname}`);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label="Export paperwork" onClick={e => e.stopPropagation()} style={{ width: 'min(620px,100%)', maxHeight: '90vh', overflow: 'auto', background: 'var(--card)', border: '1px solid var(--line2)', borderRadius: 22, padding: 22, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 24px 60px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}><span style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 24 }}>Export paperwork</span><span style={{ fontSize: 13, color: 'var(--mut)', lineHeight: 1.45 }}>A handover pack for the {car.year} {car.make} {car.model}: everything the next owner needs, in one file you can print or save as PDF.</span></div>
          <button type="button" className="plain icon-btn" onClick={onClose} title="Close" aria-label="Close"><Icon n="x" /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 'none' }}><span className="label" style={{ marginBottom: 4 }}>Include</span>{sections.map(row)}</div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 'none' }}><span className="label" style={{ marginBottom: 4 }}>Privacy</span>{privacy.map(row)}</div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span className="label">Prepared by</span><input className="field" placeholder="Your name" value={seller} onChange={e => setSeller(e.target.value)} /></label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span className="label">Note to the new owner</span><textarea className="field" placeholder="Quirks, where the spare keys are, which shop knows the car…" value={note} onChange={e => setNote(e.target.value)} style={{ height: 'auto', minHeight: 80, padding: '10px 12px', resize: 'vertical' }} /></label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn-p" onClick={() => out('open')} style={{ height: 40, padding: '0 20px' }}>Open pack</button>
          <button type="button" className="btn" onClick={() => out('download')} style={{ height: 40, padding: '0 18px', fontSize: 14 }}>Download .html</button>
          <button type="button" className="plain to-fg" onClick={onClose} style={{ height: 40, padding: '0 14px', fontSize: 14, color: 'var(--mut)' }}>Cancel</button>
        </div>
        {msg && <span role="status" style={{ fontSize: 12, color: busy ? 'var(--mut)' : 'var(--up)' }}>{msg}</span>}
        <span style={{ fontSize: 12, color: 'var(--mut)' }}>One self-contained file: receipts are embedded, so it works offline and can be emailed or put on a USB stick with the keys.</span>
      </div>
    </div>
  );
}
