// LubeLogger → Garage: turns LubeLogger's collections into Garage objects for the review screen and the import.
// Follows the design's LUBELOGGER_IMPORT.md field by field. The server reads the source; this does the mapping.
import { addMonths, type Col, type FileRef, type Garage, type OdoReading, type Part, type Rec, type Reminder, type ShelfItem, type Task, syncRego, today, uid, type Units, type Vehicle } from './model.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Dump = Record<string, any>;
export type LubeFile = FileRef & { _z: string; _missing: boolean };
export type Plan = {
  vehicles: (Vehicle & { _photo?: string })[]; vehUpd: Record<string, Partial<Vehicle> & { srcKey?: string }>;
  records: Rec[]; reminders: Reminder[]; parts: Part[]; shelf: ShelfItem[]; cards: { vid: string; col: Col; card: Task }[];
  notes: Record<string, string>; noteKeys: Record<string, string[]>; odo: Record<string, { max: number; at: string; log: OdoReading[] }>;
  carInfo: { lid: number; name: string; target: string; why: string }[]; gaps: Record<string, number>; dup: Record<string, number>; allFiles: LubeFile[];
};
export type PlanOpts = { files: Record<string, number>; srcSet: Set<string>; vehicles: Vehicle[]; targets: Record<string, string>; unitsIn: Units; unitsOut: Units; me: string | null; noFiles?: boolean; apiReminders?: boolean; TODAY?: string };

/** Collections keyed by lower-case name, as LubeLogger's exports vary in case. */
export const lubeColls = (obj: Dump) => { const o: Dump = {}; Object.keys(obj || {}).forEach(k => { const v = obj[k]; if (Array.isArray(v)) o[k.toLowerCase().replace(/[^a-z]/g, '')] = v; }); if (obj?.config) o.config = obj.config; return o; };
const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf', eml: 'message/rfc822' };

export function lubePlan(dump: Dump, o: PlanOpts): Plan {
  const TODAY = o.TODAY || today();
  const D = lubeColls(dump), F = o.files || {}, has = (k: string) => o.srcSet.has(k), gaps: Record<string, number> = {}, gap = (k: string, n = 1) => { gaps[k] = (gaps[k] || 0) + n; }, dup: Record<string, number> = {}, dupe = (k: string) => { dup[k] = (dup[k] || 0) + 1; };
  const conv = (d: any) => { if (d == null || d === '' || (+d === 0 && typeof d !== 'string')) return null; let x = +d; if (isNaN(x) || !x) return null; if (o.unitsIn !== o.unitsOut) x = o.unitsIn === 'mi' ? x * 1.609344 : x / 1.609344; return Math.round(x); };
  // Dates in Melbourne time, as LubeLogger stores UTC and entries near midnight would otherwise shift a day.
  const dt = (v: any): string => { if (v && typeof v === 'object' && v.$date) v = v.$date; if (!v) return ''; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; const x = new Date(v); return isNaN(+x) ? String(v).slice(0, 10) : x.toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' }); };
  const money = (v: any) => (+v ? Math.round(+v * 100) / 100 : null);
  const extra = (r: any) => [(r.ExtraFields || []).filter((x: any) => x && x.Name && x.Value).map((x: any) => x.Name + ': ' + x.Value).join('\n'), (r.Tags || []).length ? 'Tags: ' + r.Tags.join(', ') : ''].filter(Boolean).join('\n');
  const files = (r: any, at: string): LubeFile[] => (r.Files || []).map((f: any) => {
    const base = String(f.Location || f.Name || '').split('/').pop() || '', z = F[base];
    const nm = f.Name && /\.\w+$/.test(f.Name) ? f.Name : (f.Name || base) + (/\.\w+$/.test(base) ? base.slice(base.lastIndexOf('.')) : '');
    return { id: uid(), name: nm, type: TYPES[(nm.split('.').pop() || '').toLowerCase()] || 'application/octet-stream', size: z || 0, src: '', at: at + 'T12:00:00.000Z', _z: base, _missing: z === undefined };
  });
  const out: Plan = { vehicles: [], vehUpd: {}, records: [], reminders: [], parts: [], shelf: [], cards: [], notes: {}, noteKeys: {}, odo: {}, carInfo: [], gaps, dup, allFiles: [] };
  const vmap: Record<string, string> = {};
  (D.vehicles || []).forEach((v: any) => {
    const key = 'lubelogger:vehicles:' + v.Id, nm = [v.Year, v.Make, v.Model].filter(Boolean).join(' ');
    // VehicleIdentifier names the field shown in place of the plate; the VIN, if any, is in an extra field.
    const ef = (v.ExtraFields || []) as { Name: string; Value: string }[];
    const vin = String((v.VehicleIdentifier && v.VehicleIdentifier !== 'LicensePlate' ? ef.find(x => x.Name === v.VehicleIdentifier)?.Value : '') || ef.find(x => /^vin$/i.test(x.Name))?.Value || (/^[A-HJ-NPR-Z0-9]{11,17}$/i.test(v.VehicleIdentifier || '') ? v.VehicleIdentifier : '')).trim();
    const plate = String(v.LicensePlate || '').replace(/\s/g, '').toUpperCase();
    const prev = o.vehicles.find(x => x.src === key || (x.srcKeys || []).includes(key));
    const byId = o.vehicles.find(x => !x.sold && ((vin.length >= 11 && x.vin && x.vin.toUpperCase() === vin.toUpperCase()) || (plate && x.plate && x.plate.replace(/\s/g, '').toUpperCase() === plate)));
    const auto = prev ? prev.id : byId ? byId.id : 'new', target = o.targets[v.Id] || auto;
    out.carInfo.push({ lid: v.Id, name: nm || 'Vehicle ' + v.Id, target, why: prev ? 'Imported before — new items merge into it' : byId ? 'Matches ' + (byId.nickname || byId.model) + ' by ' + (vin.length >= 11 && byId.vin ? 'VIN' : 'rego') : 'Not in Garage yet' });
    if (target !== 'new') { vmap[v.Id] = target; out.vehUpd[target] = { srcKey: key }; if (prev) dupe('vehicles'); return; }
    const id = 'v' + uid(); vmap[v.Id] = id;
    if (v.UseHours) gap('hours');
    const fs = v.IsElectric ? 'Electric' : v.IsDiesel ? 'Diesel' : '';
    const img = String(v.ImageLocation || ''), photo = /^\/(images|documents)\//.test(img) ? img.split('/').pop() : '';
    out.vehicles.push({ id, src: key, year: +v.Year || '', make: v.Make || '', model: v.Model || '', nickname: '', plate: String(v.LicensePlate || '').toUpperCase(), vin: vin.length >= 11 ? vin : '', colour: '', usage: v.SoldDate ? 'storage' : 'weekend', odometer: 0, purchasePrice: +v.PurchasePrice || '', purchaseDate: dt(v.PurchaseDate) || '', fuelSystem: fs, fuelType: fs,
      specs: ef.length ? { custom: [{ id: uid(), title: 'Imported from LubeLogger', rows: ef.map(x => ({ item: x.Name, value: x.Value })) }] } : undefined, sold: v.SoldDate ? { date: dt(v.SoldDate), price: +v.SoldPrice || null, to: '' } : null, _photo: photo && F[photo] !== undefined ? photo : '' });
    if ((v.Tags || []).length) out.notes[id] = 'Tags: ' + v.Tags.join(', ');
  });
  const mk = (coll: string, r: any, fn: (key: string, vid: string) => void) => { const key = 'lubelogger:' + coll + ':' + r.Id, vid = vmap[r.VehicleId]; if (!vid) return; if (has(key)) { dupe(coll); return; } fn(key, vid); };
  const odoMax = (vid: string, d: string, km: number | null) => { if (!km) return; const c = out.odo[vid] || (out.odo[vid] = { max: 0, at: '', log: [] }); if (km > c.max) { c.max = km; c.at = d; } };
  const unitCost = (p: any) => { const q = +p.Quantity || 1; return { q, cost: +p.Cost ? Math.round((+p.Cost / q) * 100) / 100 : ('' as const) }; };
  ([['servicerecords', 'Service'], ['collisionrecords', 'Repair'], ['upgraderecords', 'Upgrade']] as const).forEach(([coll, type]) => (D[coll] || []).forEach((r: any) => mk(coll, r, (key, vid) => {
    const d = dt(r.Date) || TODAY, km = conv(r.Mileage), id = uid(), loc = String(r.Location || '').trim();
    (r.RequisitionHistory || []).forEach((p: any) => { const { q, cost } = unitCost(p); out.parts.push({ id: uid(), vid, cardId: null, recId: id, name: p.Description || 'Part', partNo: p.PartNumber || '', vendor: p.PartSupplier || '', qty: q, cost, status: 'Installed', url: '', at: d + 'T12:00:00.000Z', src: key + ':part:' + (p.Id || p.Description) } as Part); });
    out.records.push({ id, src: key, vid, type, date: d, odo: km || 0, title: r.Description || type, cost: money(r.Cost), notes: [r.Notes, loc ? 'At: ' + loc : '', extra(r)].filter(Boolean).join('\n'), where: loc ? 'shop' : 'diy', by: o.me, files: files(r, d) } as Rec);
    odoMax(vid, d, km);
  })));
  (D.gasrecords || D.fuelrecords || []).forEach((r: any) => mk('gasrecords', r, (key, vid) => {
    const d = dt(r.Date) || TODAY, km = conv(r.Mileage), q = +(r.Gallons ?? r.Quantity ?? 0);
    const vol = o.unitsIn === o.unitsOut ? q : o.unitsIn === 'mi' ? q * 3.78541 : q / 3.78541;
    const rec = { id: uid(), src: key, vid, type: 'Fuel', date: d, odo: km || 0, title: 'Fill-up', cost: money(r.Cost), gallons: Math.round(vol * 100) / 100, notes: [r.Notes, extra(r)].filter(Boolean).join('\n'), files: files(r, d) } as Rec;
    if (r.IsFillToFull === false) rec.partial = true; if (r.MissedFuelUp) rec.missed = true;
    out.records.push(rec); odoMax(vid, d, km);
  }));
  (D.taxrecords || []).forEach((r: any) => mk('taxrecords', r, (key, vid) => {
    const d = dt(r.Date) || TODAY, ins = /insur/i.test(r.Description || '');
    out.records.push({ id: uid(), src: key, vid, type: ins ? 'Insurance' : 'Registration', date: d, odo: 0, title: r.Description || (ins ? 'Insurance' : 'Registration'), cost: money(r.Cost), notes: [r.Notes, extra(r)].filter(Boolean).join('\n'), files: files(r, d) } as Rec);
    if (r.IsRecurring) {
      const m = ({ OneMonth: 1, ThreeMonths: 3, SixMonths: 6, OneYear: 12, TwoYears: 24 } as Record<string, number>)[r.RecurringInterval] || +r.CustomMonthInterval || 12, u = out.vehUpd[vid] || (out.vehUpd[vid] = {}), nx = addMonths(d, m);
      if (ins) { if (!u.insuranceRenewal || nx > u.insuranceRenewal) u.insuranceRenewal = nx; } else if (!u.regoExpiry || nx > u.regoExpiry) { u.regoExpiry = nx; u.regoTerm = ([3, 6, 12].includes(m) ? m : 12) as 3 | 6 | 12; }
    }
  }));
  (D.odometerrecords || []).forEach((r: any) => mk('odometerrecords', r, (key, vid) => { const d = dt(r.Date) || TODAY, km = conv(r.Mileage); if (!km) return; odoMax(vid, d, km); out.odo[vid].log.push({ date: d, odo: km, src: 'import', key }); }));
  const MON: Record<string, number> = { OneMonth: 1, TwoMonths: 2, ThreeMonths: 3, FourMonths: 4, SixMonths: 6, OneYear: 12, TwoYears: 24, ThreeYears: 36, FiveYears: 60 };
  const DIST = (s: any) => { const w: Record<string, number> = { One: 1, Two: 2, Three: 3, Four: 4, Five: 5, Six: 6, Seven: 7, Eight: 8, Nine: 9, Ten: 10, Fifteen: 15, Twenty: 20, Thirty: 30, Forty: 40, Fifty: 50, Sixty: 60, Hundred: 100, Thousand: 1000 }; let tot = 0, cur = 0;
    String(s || '').replace(/(Miles|Kilometers|Kilometres|Km)$/i, '').match(/[A-Z][a-z]+/g)?.forEach(t => { const n = w[t]; if (n == null) return; if (n === 100) cur = (cur || 1) * 100; else if (n === 1000) { tot += (cur || 1) * 1000; cur = 0; } else cur += n; }); return tot + cur; };
  (D.reminderrecords || []).forEach((r: any) => mk('reminderrecords', r, (key, vid) => {
    const met = String(r.Metric ?? 'Date'), useD = /date|both|^0$|^2$/i.test(met), useO = /odo|both|^1$|^2$/i.test(met);
    const months = r.IsRecurring && useD ? MON[r.ReminderMonthInterval] || +r.CustomMonthInterval || 0 : 0, dist = r.IsRecurring && useO ? conv(r.ReminderMileageInterval === 'Other' || !DIST(r.ReminderMileageInterval) ? r.CustomMileageInterval : DIST(r.ReminderMileageInterval)) : 0;
    if (r.CustomThresholds || +r.UrgentDays || +r.UrgentDistance) gap('thresholds');
    if (o.apiReminders) gap('apirem');
    const lines = String(r.Notes || '').split(/\n+/).map(x => x.trim()).filter(Boolean), list = lines.length > 1 && lines.every(x => x.length < 60);
    out.reminders.push({ id: uid(), src: key, vid, title: r.Description || 'Reminder', dueDate: useD ? dt(r.Date) : '', dueOdo: useO ? conv(r.Mileage) || '' : '', repeatDays: months ? (months % 12 === 0 ? (months / 12) * 365 : Math.round(months * 30.44)) : '', repeatMonths: months || undefined, repeatDist: dist || '', repeatFrom: r.FixedIntervals ? 'fixed' : 'done', isCheck: false, checklist: list ? lines : [], notes: list ? '' : r.Notes || '', done: false } as Reminder);
  }));
  (D.planrecords || []).forEach((r: any) => mk('planrecords', r, (key, vid) => {
    const pr = String(r.Progress || 'Backlog'), col: Col = /done/i.test(pr) ? 'done' : /progress|testing/i.test(pr) ? 'progress' : 'backlog', d = dt(r.DateCreated) || TODAY, id = uid();
    if (/testing/i.test(pr)) gap('testing'); if (+r.ReminderRecordId) gap('remlink');
    const ps = (r.RequisitionHistory || []).map((p: any) => { const { q, cost } = unitCost(p); return { id: uid(), vid, cardId: id, recId: null, name: p.Description || 'Part', partNo: p.PartNumber || '', vendor: p.PartSupplier || '', qty: q, cost, status: col === 'done' ? 'Installed' : 'In stock', url: '', at: d + 'T12:00:00.000Z', src: key + ':part:' + (p.Id || p.Description) } as Part; });
    out.parts.push(...ps);
    const pt = ps.reduce((a: number, p: Part) => a + (+p.cost || 0) * (+p.qty || 1), 0), lab = Math.max(0, Math.round(((+r.Cost || 0) - pt) * 100) / 100), rl = +r.ReminderRecordId ? (D.reminderrecords || []).find((x: any) => x.Id === +r.ReminderRecordId) : null;
    out.cards.push({ vid, col, card: { id, src: key, title: r.Description || 'Task', type: ({ ServiceRecord: 'Maintenance', RepairRecord: 'Repair', UpgradeRecord: 'Upgrade' } as Record<string, string>)[r.ImportMode] || 'Maintenance', priority: (({ Critical: 'High', Normal: 'Medium', Low: 'Low' } as Record<string, string>)[r.Priority] || 'Medium') as Task['priority'],
      est: Math.round((pt + lab) * 100) / 100, labour: lab, note: [r.Notes, /testing/i.test(pr) ? 'LubeLogger status: Testing' : '', rl ? 'Linked reminder: ' + rl.Description : '', extra(r)].filter(Boolean).join('\n'), drive: 'N/A', assignee: '', due: '', photos: [], files: files(r, d),
      activity: [{ id: uid(), at: d + 'T09:00:00.000Z', kind: 'event', text: 'Imported from LubeLogger plan', by: o.me }], createdBy: o.me, createdAt: d + 'T09:00:00.000Z', ...(col === 'done' ? { logged: false, doneAt: d } : {}) } as unknown as Task });
  }));
  (D.supplyrecords || []).forEach((r: any) => {
    const key = 'lubelogger:supplyrecords:' + r.Id; if (has(key)) { dupe('supplyrecords'); return; }
    const { q, cost } = unitCost(r), d = dt(r.Date) || TODAY;
    if (!+r.VehicleId) { if (+r.Cost) gap('shelfcost'); out.shelf.push({ id: uid(), src: key, name: r.Description || 'Supply', partNo: r.PartNumber || '', qty: q, fits: '', at: d + 'T12:00:00.000Z' }); return; }
    const vid = vmap[r.VehicleId]; if (!vid) return;
    out.parts.push({ id: uid(), vid, cardId: null, recId: null, name: r.Description || 'Supply', partNo: r.PartNumber || '', vendor: r.PartSupplier || '', qty: q, cost, status: 'In stock', url: '', at: d + 'T12:00:00.000Z', src: key, files: files(r, d) } as Part);
  });
  (D.notes || []).slice().sort((a: any, b: any) => (b.Pinned ? 1 : 0) - (a.Pinned ? 1 : 0)).forEach((r: any) => mk('notes', r, (key, vid) => {
    out.notes[vid] = [out.notes[vid], '## ' + (r.Description || 'Note') + '\n' + (r.NoteText || '') + ((r.Tags || []).length ? '\nTags: ' + r.Tags.join(', ') : '')].filter(Boolean).join('\n\n');
    out.noteKeys[vid] = [...(out.noteKeys[vid] || []), key];
  }));
  out.parts = out.parts.filter(p => { if (has(p.src!)) { dupe('parts'); return false; } return true; });
  out.allFiles = [...out.records, ...out.cards.map(c => c.card), ...out.parts].flatMap(x => (x.files || []) as LubeFile[]);
  if (o.noFiles && out.allFiles.length) gap('nofiles', out.allFiles.length);
  return out;
}

/** Every src already in the garage, so a second import only brings in what's new. */
export function srcSetOf(g: { vehicles: Vehicle[]; records: Rec[]; reminders: Reminder[]; parts: Part[]; shelf: ShelfItem[]; boards: Record<string, Record<string, Task[]>> }) {
  const s = new Set<string>();
  g.vehicles.forEach(v => { if (v.src) s.add(v.src); (v.srcKeys || []).forEach(k => s.add(k)); (v.odoLog || []).forEach(x => x.key && s.add(x.key)); (v.noteKeys || []).forEach(k => s.add(k)); });
  [g.records, g.reminders, g.parts, g.shelf || []].forEach(l => (l as { src?: string }[]).forEach(x => x.src && s.add(x.src)));
  Object.values(g.boards).forEach(b => Object.values(b).forEach(l => (l || []).forEach(c => c.src && s.add(c.src))));
  return s;
}

/** How many items the plan brings in (the number on the Import button). */
export const planTotal = (p: Plan) => p.vehicles.length + p.records.length + p.reminders.length + p.cards.length + p.parts.length + p.shelf.length + Object.keys(p.notes).length + Object.values(p.odo).reduce((a, x) => a + x.log.length, 0);

/**
 * Merge a plan into the garage. stored maps each attachment's file name to what the server stored it as;
 * a file that isn't there keeps its name with no link.
 */
export function applyPlan(g: Garage, p: Plan, stored: Record<string, { id: string; type: string; size: number; src: string }>, by: string | null): Garage {
  const fill = <T extends { files?: FileRef[] }>(x: T): T => (x.files ? { ...x, files: (x.files as LubeFile[]).map(({ _z, _missing, ...f }) => { const st = stored[_z]; return st ? { ...f, id: st.id, type: st.type, size: st.size, src: st.src } : f; }) } : x);
  const nv = p.vehicles.map(({ _photo, ...v }) => {
    const o2 = p.odo[v.id], up = p.vehUpd[v.id] || {}, { srcKey: _s, ...rest } = up;
    return { ...v, ...rest, ...(_photo && stored[_photo] ? { photo: stored[_photo].src } : {}), ...(o2 ? { odometer: Math.max(+v.odometer || 0, o2.max), odoAt: o2.at, odoLog: o2.log } : {}), noteKeys: p.noteKeys[v.id] || [] } as Vehicle;
  });
  const old = g.vehicles.map(v => {
    const up = p.vehUpd[v.id], o2 = p.odo[v.id]; if (!up && !o2 && !p.noteKeys[v.id]) return v;
    const x: Vehicle = { ...v };
    if (up) {
      const { srcKey, ...rest } = up;
      if (srcKey && x.src !== srcKey && !(x.srcKeys || []).includes(srcKey)) x.srcKeys = [...(x.srcKeys || []), srcKey];
      // Only fill blanks or move dates later; what's already set in Garage wins.
      (Object.keys(rest) as (keyof typeof rest)[]).forEach(k => { const cur = x[k] as unknown, nx = rest[k] as unknown; if (!cur || (k !== 'regoTerm' && String(nx) > String(cur))) (x as unknown as Record<string, unknown>)[k] = nx; });
    }
    if (o2) { if (o2.max > (+x.odometer || 0)) { x.odometer = o2.max; x.odoAt = o2.at; } x.odoLog = [...(x.odoLog || []), ...o2.log]; }
    if (p.noteKeys[v.id]) x.noteKeys = [...(x.noteKeys || []), ...p.noteKeys[v.id]];
    return x;
  });
  const vehicles = [...old, ...nv], boards = { ...g.boards }, notes = { ...g.notes };
  nv.forEach(v => { boards[v.id] = { backlog: [], parts: [], progress: [], done: [] }; notes[v.id] = ''; });
  p.cards.forEach(({ vid, col, card }) => { const b = { ...(boards[vid] || { backlog: [], parts: [], progress: [], done: [] }) }; b[col] = [...(b[col] || []), fill(card)]; boards[vid] = b; });
  Object.entries(p.notes).forEach(([vid, t]) => { notes[vid] = [notes[vid], t].filter(x => (x || '').trim()).join('\n\n'); });
  const n = planTotal(p);
  return {
    ...g, vehicles, boards, notes, records: [...p.records.map(fill), ...g.records], reminders: syncRego(vehicles, [...g.reminders, ...p.reminders]),
    parts: [...g.parts, ...p.parts.map(fill)], shelf: [...(g.shelf || []), ...p.shelf],
    log: [{ id: uid(), at: new Date().toISOString(), by, vid: null, text: `imported ${n} item${n === 1 ? '' : 's'} from LubeLogger` }, ...g.log],
  };
}

export const LUBE_SAMPLE: Dump = {
  vehicles: [{ Id: 1, Year: 2009, Make: 'Toyota', Model: 'Hilux SR5', LicensePlate: 'XYZ123', VehicleIdentifier: 'MR0FZ29G901234567', PurchaseDate: '2019-04-12', PurchasePrice: 24500, IsDiesel: true, Tags: ['tow car'], ExtraFields: [{ Name: 'Tyre size', Value: '265/70R16' }] }],
  servicerecords: [
    { Id: 11, VehicleId: 1, Date: '2025-03-08T00:00:00Z', Mileage: 241200, Description: 'Oil & filter, fuel filter', Cost: 0, Notes: '15W-40, 7.2 L', Location: '', Files: [], Tags: [], RequisitionHistory: [{ Description: 'Oil filter', PartNumber: '90915-YZZD2', PartSupplier: 'Repco', Quantity: 1, Cost: 18 }, { Description: 'Fuel filter', PartNumber: '23390-0L041', PartSupplier: 'Repco', Quantity: 1, Cost: 62 }] },
    { Id: 12, VehicleId: 1, Date: '2025-09-20T00:00:00Z', Mileage: 249850, Description: 'Logbook service', Cost: 640, Notes: '', Location: 'Coastal Toyota', Files: [{ Name: 'invoice-0920.pdf', Location: '/documents/3f2a-invoice.pdf' }], Tags: ['logbook'] }],
  collisionrecords: [{ Id: 21, VehicleId: 1, Date: '2025-06-02T00:00:00Z', Mileage: 245900, Description: 'Replace rear wheel bearing', Cost: 310, Notes: '', Location: '', Files: [] }],
  upgraderecords: [{ Id: 31, VehicleId: 1, Date: '2024-11-15T00:00:00Z', Mileage: 236400, Description: 'Bull bar + Redarc brake controller', Cost: 2890, Notes: '', Files: [] }],
  gasrecords: [
    { Id: 41, VehicleId: 1, Date: '2025-10-04T00:00:00Z', Mileage: 250300, Gallons: 68.2, Cost: 139.8, IsFillToFull: true, MissedFuelUp: false },
    { Id: 42, VehicleId: 1, Date: '2025-10-11T00:00:00Z', Mileage: 250910, Gallons: 30, Cost: 61.2, IsFillToFull: false, MissedFuelUp: false },
    { Id: 43, VehicleId: 1, Date: '2025-10-19T00:00:00Z', Mileage: 251480, Gallons: 41.5, Cost: 85.1, IsFillToFull: true, MissedFuelUp: false },
    { Id: 44, VehicleId: 1, Date: '2025-11-02T00:00:00Z', Mileage: 252690, Gallons: 70.4, Cost: 146.4, IsFillToFull: true, MissedFuelUp: true }],
  taxrecords: [{ Id: 51, VehicleId: 1, Date: '2025-08-30T00:00:00Z', Description: 'Registration', Cost: 912, IsRecurring: true, RecurringInterval: 'OneYear' }, { Id: 52, VehicleId: 1, Date: '2025-08-01T00:00:00Z', Description: 'Insurance \u2014 comprehensive', Cost: 1180, IsRecurring: true, RecurringInterval: 'OneYear' }],
  odometerrecords: [{ Id: 61, VehicleId: 1, Date: '2025-07-14T00:00:00Z', Mileage: 247300 }, { Id: 62, VehicleId: 1, Date: '2025-11-20T00:00:00Z', Mileage: 253150 }],
  reminderrecords: [
    { Id: 71, VehicleId: 1, Description: 'Oil & filter', Metric: 'Both', Date: '2026-03-08T00:00:00Z', Mileage: 251200, IsRecurring: true, ReminderMonthInterval: 'SixMonths', ReminderMileageInterval: 'TenThousandMiles', CustomMileageInterval: 10000, FixedIntervals: false, Notes: 'Drain plug washer\nCheck diff breathers' },
    { Id: 72, VehicleId: 1, Description: 'Timing belt', Metric: 'Odometer', Mileage: 300000, IsRecurring: false, FixedIntervals: true, UrgentDays: 30, CustomThresholds: true, Notes: '' }],
  planrecords: [{ Id: 81, VehicleId: 1, Description: 'Replace front shocks', Progress: 'Testing', Priority: 'Critical', ImportMode: 'RepairRecord', Cost: 520, Notes: 'Clunk over bumps', ReminderRecordId: 0, Files: [{ Name: 'quote.pdf', Location: '/documents/a1-quote.pdf' }], RequisitionHistory: [{ Description: 'Bilstein B6 front pair', PartNumber: '24-123456', PartSupplier: 'TJM', Quantity: 2, Cost: 380 }], DateCreated: '2025-10-25T00:00:00Z' }],
  supplyrecords: [{ Id: 91, VehicleId: 0, Date: '2025-05-01T00:00:00Z', Description: 'Coolant concentrate 5 L', PartNumber: '', PartSupplier: 'Supercheap', Quantity: 2, Cost: 64 }, { Id: 92, VehicleId: 1, Date: '2025-09-01T00:00:00Z', Description: 'Air filter', PartNumber: '17801-0C010', PartSupplier: 'Toyota', Quantity: 1, Cost: 45 }],
  notes: [{ Id: 101, VehicleId: 1, Description: 'Towing setup', NoteText: 'Ball weight 350 kg max. Brake controller gain 6.5.', Pinned: true }]
};

