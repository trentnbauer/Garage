import { type ChangeEvent, useState } from 'react';
import { download, fdate, FUELS, fuelSys, syncRego, today, type Vehicle } from '../lib/model.ts';
import { fmtSize, upload } from '../lib/files.ts';
import { track } from '../lib/actions.ts';
import { Icon } from '../ui/icons.tsx';
import type { Tab } from './Car.tsx';

type Field = { label: string; k: keyof Vehicle; num?: boolean; mono?: boolean; wide?: boolean; type?: string; ph?: string; options?: (string | [string | number, string])[]; noBlank?: boolean; def?: string | number };
const DOCS: [NonNullable<Vehicle['docs']>[0]['kind'], string, string][] = [['rego', 'Rego certificate', 'Current registration papers'], ['rwc', 'Roadworthy certificate', 'Needed to sell or re-register'], ['insurance', 'Insurance policy', 'Certificate of currency or PDS'], ['purchase', 'Purchase receipt', 'Bill of sale, invoice or contract']];
const card = { breakInside: 'avoid' as const, marginBottom: 12, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 20, padding: 20, display: 'flex', flexDirection: 'column' as const, gap: 14 };

export function Details({ calc, car, nav, store, me }: Tab) {
  const g = calc.g, u = calc.u, vid = car.id;
  const [photoMsg, setPhotoMsg] = useState(''), [docMsg, setDocMsg] = useState('');
  const setCar = (p: Partial<Vehicle>, rego = false) => store.update(g2 => { const vehicles = g2.vehicles.map(x => (x.id === vid ? { ...x, ...p } : x)); return rego ? { ...g2, vehicles, reminders: syncRego(vehicles, g2.reminders) } : { ...g2, vehicles }; });
  const onField = (f: Field) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const raw = e.target.value, val = f.num ? (raw === '' ? '' : +raw) : raw;
    setCar({ [f.k]: val } as Partial<Vehicle>, /^rego|^insuranceRenewal$/.test(String(f.k)));
  };
  const pick = (fn: (f: File) => Promise<void>) => (e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) fn(f); };

  const looks = fuelSys({ ...car, fuelSystem: '' });
  const logOdo = Math.max(0, ...g.records.filter(r => r.vid === vid).map(r => +r.odo || 0));
  const showIns = !!(car.insurer || car.policyNo); // the full insurance group appears once there's an insurer
  const groups: { title: string; note?: string; fields: Field[] }[] = [
    { title: 'Identity', note: 'Daily drivers rank higher in the Due list when reminders fall on the same day.', fields: [
      { label: 'Name', k: 'nickname', wide: true, ph: 'Shown large — falls back to model' }, { label: 'Use', k: 'usage', def: 'weekend', noBlank: true, options: [['daily', 'Daily'], ['weekend', 'Weekend'], ['track', 'Track'], ['storage', 'In storage']] },
      { label: 'Year', k: 'year', num: true }, { label: 'Make', k: 'make' }, { label: 'Model', k: 'model' }, { label: 'Chassis code', k: 'chassisCode', mono: true, ph: 'e.g. W123, E30' }, { label: 'Colour', k: 'colour' }, { label: 'VIN / chassis no.', k: 'vin', mono: true, wide: true }] },
    { title: 'Registration', note: car.regoExpiry ? `A “Rego renewal” reminder follows this expiry. Marking it done rolls the expiry forward ${+(car.regoTerm || 12)} months.` : 'Set an expiry date and a renewal reminder is created automatically.', fields: [
      { label: 'Rego number', k: 'plate', mono: true, ph: 'ABC-123' }, { label: 'Rego period', k: 'regoTerm', num: true, def: 12, noBlank: true, options: [[3, '3 months'], [6, '6 months'], [12, '12 months']] }, { label: 'Rego expiry', k: 'regoExpiry', type: 'date', wide: true }] },
    showIns
      ? { title: 'Insurance', note: car.insuranceRenewal ? 'An “Insurance renewal” reminder follows the renewal date and rolls forward a year when you mark it done.' : 'Add the renewal date and Garage reminds you before it lapses.', fields: [
          { label: 'Insurer', k: 'insurer' }, { label: 'Policy number', k: 'policyNo', mono: true }, { label: 'Cover type', k: 'coverType', ph: 'Agreed value, comprehensive' }, { label: 'Agreed value', k: 'agreedValue', num: true },
          { label: 'Renewal date', k: 'insuranceRenewal', type: 'date' }, { label: 'Annual premium', k: 'premium', num: true }, { label: 'Claims phone', k: 'claimsPhone', mono: true, wide: true, ph: '13 00 00' }] }
      : { title: 'Insurance', note: 'Just the basics for now. More fields (policy number, cover, premium) appear once you add the insurer.', fields: [{ label: 'Insurer', k: 'insurer', ph: 'e.g. Shannons' }, { label: 'Renewal date', k: 'insuranceRenewal', type: 'date' }] },
    { title: 'Mechanical', note: 'Oil, tyres, torque settings and part numbers live in Specs.', fields: [
      { label: 'Engine', k: 'engine' }, { label: 'Transmission', k: 'transmission' }, { label: 'Fuel system', k: 'fuelSystem', options: ['Carburettor', 'Fuel injection', 'Diesel', 'Electric'], ph: looks ? 'Looks like ' + looks.toLowerCase() : '' },
      { label: 'Fuel type', k: 'fuelType', options: [...FUELS, 'Electric', 'Hybrid'] }] },
    { title: 'Ownership', note: `Odometer comes from your latest log (${logOdo.toLocaleString()} ${u}). Use the correction only if the car reads higher.`, fields: [
      { label: 'Purchase date', k: 'purchaseDate', type: 'date' }, { label: 'Purchase price', k: 'purchasePrice', num: true }, { label: 'Odometer at purchase', k: 'purchaseOdo', num: true, ph: 'For cost per ' + u },
      { label: 'Estimated value today', k: 'estValue', num: true, ph: 'Optional' }, { label: 'Bought from', k: 'boughtFrom', wide: true }, { label: `Odometer correction (${u})`, k: 'odometer', num: true, ph: 'Only if higher than logs' }] },
  ];

  const docs = car.docs || [];
  const uploadDoc = (kind: (typeof DOCS)[0][0], label: string) => pick(async f => {
    setDocMsg('');
    if (!/^image\//.test(f.type) && f.size > 25 * 1048576) { setDocMsg('That file is over 25 MB. Save a smaller PDF or a photo of it.'); return; }
    try { const ref = await upload(f); store.update(g2 => track({ ...g2, vehicles: g2.vehicles.map(x => (x.id === vid ? { ...x, docs: [...(x.docs || []).filter(d => d.kind !== kind), { ...ref, kind }] } : x)) }, me.id, vid, `added the ${label.toLowerCase()}`)); }
    catch (e) { setDocMsg((e as Error).message); }
  });
  const removeCar = () => nav.ask({ title: `Remove ${car.nickname || car.model}?`, body: `“${car.year} ${car.make} ${car.model}” and all its history, reminders, parts, tasks and notes will be deleted. Export a backup first if you might want it back.`, label: 'Delete vehicle',
    fn: () => { store.update(g2 => { const boards = { ...g2.boards }, notes = { ...g2.notes }; delete boards[vid]; delete notes[vid];
      return { ...g2, vehicles: g2.vehicles.filter(x => x.id !== vid), records: g2.records.filter(x => x.vid !== vid), reminders: g2.reminders.filter(x => x.vid !== vid), parts: g2.parts.filter(x => x.vid !== vid), boards, notes }; }); nav.go({ view: 'home' }); } });
  const unsell = () => store.update(g2 => { const vehicles = g2.vehicles.map(x => (x.id === vid ? { ...x, sold: null } : x)); return track({ ...g2, vehicles, reminders: syncRego(vehicles, g2.reminders) }, me.id, vid, 'undid the sale'); });
  const backup = () => { const { vehicles, records, reminders, parts, boards, notes, settings, shelf } = g; download(`garage-backup-${today()}.json`, JSON.stringify({ app: 'garage', version: 3, vehicles, records, reminders, parts, boards, notes, settings, shelf }, null, 2), 'application/json'); };

  return <>
    <div style={{ columns: '3 340px', columnGap: 12 }}>
      <div style={card}>
        <span className="card-t">Photo</span>
        <div style={{ height: 200, borderRadius: 14, overflow: 'hidden', background: 'var(--card2)' }}>
          {car.photo ? <div role="img" aria-label="Car photo" style={{ width: '100%', height: '100%', backgroundImage: `url("${car.photo}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--mut)' }}>No photo yet</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="btn-p" style={{ cursor: 'pointer' }}><Icon n="upload" s={15} />{car.photo ? 'Replace photo' : 'Upload photo'}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={pick(async f => { setPhotoMsg('Processing…'); try { const ref = await upload(f, 1200); setCar({ photo: ref.src }); setPhotoMsg(''); } catch (e) { setPhotoMsg((e as Error).message); } })} /></label>
          {car.photo && <button className="btn" onClick={() => nav.ask({ title: 'Remove the car photo?', body: 'The photo will be removed from this car.', label: 'Remove photo', fn: () => setCar({ photo: '' }) })}>Remove</button>}
          <span role="status" style={{ fontSize: 12, color: 'var(--mut)' }}>{photoMsg}</span>
        </div>
      </div>

      <div style={card}>
        <div className="card-h" style={{ gap: 12 }}><span className="card-t">Workshop manual</span><span className="mono mut" style={{ fontSize: 11 }} /></div>
        <span style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 1.45 }}>Upload the factory or Haynes manual as a PDF. When you ask AI about a task, it looks up the relevant pages here first and cites them.</span>
        <button className="dashed" onClick={nav.soon} style={{ boxSizing: 'border-box', height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13 }}><Icon n="upload" />Upload workshop manual (PDF)</button>
      </div>

      <div style={card}>
        <div className="card-h" style={{ gap: 12 }}><span className="card-t">Documents</span><span className="mono mut" style={{ fontSize: 11 }}>{docs.length ? docs.length + ' of 4' : ''}</span></div>
        {DOCS.map(([k, label, hint]) => { const d = docs.find(x => x.kind === k); return (
          <div key={k} className="row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14 }}>{label}</div>
              {d ? <a href={d.src} download={d.name} style={{ display: 'block', fontSize: 12, color: 'var(--acc)', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name} · {[fmtSize(d.size), fdate(d.at.slice(0, 10))].filter(Boolean).join(' · ')}</a>
                : <div style={{ fontSize: 12, color: 'var(--mut)' }}>{hint}</div>}</div>
            <label className="btn" style={{ height: 30, padding: '0 12px', fontSize: 12, flex: 'none', cursor: 'pointer' }}>{d ? 'Replace' : 'Upload'}<input type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={uploadDoc(k, label)} aria-label={`Upload ${label.toLowerCase()}`} /></label>
            {d && <button type="button" className="plain ghost-del" onClick={() => nav.ask({ title: `Remove the ${label.toLowerCase()}?`, body: 'The file will be removed from this car.', label: 'Remove', fn: () => setCar({ docs: docs.filter(x => x.kind !== k) }) })} style={{ fontSize: 12, color: 'var(--mut)', flex: 'none' }}>Remove</button>}
          </div>); })}
        {docMsg && <span role="alert" style={{ fontSize: 12, color: 'var(--down)' }}>{docMsg}</span>}
      </div>

      {groups.map(gr => (
        <div key={gr.title} style={card}>
          <span className="card-t">{gr.title}</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
            {gr.fields.map(f => { const v = (car[f.k] as string | number | undefined) ?? f.def ?? ''; return (
              <label key={String(f.k)} style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: f.wide ? '1 / -1' : 'auto' }}>
                <span className="label">{f.label}</span>
                {f.options
                  ? <select className="field" style={{ padding: '0 10px' }} value={String(v)} onChange={onField(f)}>{!f.noBlank && <option value="">Not set</option>}{f.options.map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return <option key={ov} value={ov}>{ol}</option>; })}</select>
                  : <input className="field" type={f.type || (f.num ? 'number' : 'text')} placeholder={f.ph} value={String(v)} onChange={onField(f)} style={{ fontFamily: f.mono || f.num ? 'var(--mono)' : "'Geist',system-ui,sans-serif" }} />}
              </label>); })}
          </div>
          {gr.note && <span style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 1.45 }}>{gr.note}</span>}
        </div>
      ))}
    </div>
    <span style={{ fontSize: 12, color: 'var(--mut)' }}>Changes save as you type.</span>
    <div style={{ background: 'var(--card)', border: '1px solid rgba(242,104,95,.25)', borderRadius: 20, padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div><div className="card-t">Sold it, or remove it</div><div style={{ fontSize: 12, color: 'var(--mut)' }}>Mark as sold to archive the car and keep its history. Delete removes everything — export a backup first.</div></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn" onClick={nav.soon}>Export paperwork</button>
        <button className="btn" onClick={backup}>Export backup</button>
        <button className="btn" onClick={car.sold ? unsell : () => nav.open({ kind: 'sell', vid, form: { date: today(), price: '', to: '' } })} style={{ borderColor: 'var(--acc)' }}>{car.sold ? 'Undo sale' : 'Mark as sold'}</button>
        <button className="plain" onClick={removeCar} style={{ height: 36, padding: '0 14px', borderRadius: 999, background: 'rgba(242,104,95,.14)', color: 'var(--down)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center' }}>Remove car</button>
      </div>
    </div>
  </>;
}
