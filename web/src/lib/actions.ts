// What each dialog does when saved. Pure: take the garage, return the new garage (or an error to show).
import { type Activity, addMonths, Calc, type Col, COLNAME, type Garage, nextDue, type Part, type Rec, type RecType, recTypeFor, type Reminder, syncRego, type Task, today, uid, type Vehicle } from './model.ts';

export const now = () => new Date().toISOString();
export const ev = (text: string, by: string | null, kind: 'event' | 'note' = 'event'): Activity => ({ id: uid(), at: now(), kind, text, by });
export const track = (g: Garage, by: string | null, vid: string | null, text: string): Garage => (text ? { ...g, log: [{ id: uid(), at: now(), by, vid, text }, ...g.log] } : g);
const findCard = (g: Garage, vid: string, id: string) => {
  const b = g.boards[vid]; if (!b) return null;
  for (const k of Object.keys(b) as Col[]) { const i = b[k].findIndex(c => c.id === id); if (i > -1) return { c: b[k][i], k, i }; }
  return null;
};
/** Add an event to a task's activity, wherever it sits on the board. */
export function cardEvent(g: Garage, vid: string, cardId: string | null | undefined, text: string, by: string | null): Garage {
  if (!cardId || !findCard(g, vid, cardId)) return g;
  const b = g.boards[vid], nb = { ...b };
  (Object.keys(b) as Col[]).forEach(k => { nb[k] = b[k].map(c => (c.id === cardId ? { ...c, activity: [...(c.activity || []), ev(text, by)] } : c)); });
  return { ...g, boards: { ...g.boards, [vid]: nb } };
}

// ---------- log service / fill-up / check ----------
export type Check = { text: string; done?: boolean; state?: 'pass' | 'fail' };
export type RecForm = {
  type: RecType; date: string; title: string; odo: string; cost: string; notes: string; where?: 'diy' | 'shop';
  gallons?: string; ppu?: string; fuelBy?: 'vol' | 'ppu'; fuelMode?: boolean; partial?: boolean; missed?: boolean;
  fromReminder?: string; linkTask?: string; fromCard?: string; labour?: string; costTouched?: boolean;
  usedParts?: string[]; newParts?: { id: string; name: string; cost: string }[];
  isCheck?: boolean; result?: 'pass' | 'fail'; passTitle?: string; checks?: Check[];
  tpl?: { cost: boolean; odo: boolean; notes: boolean };
};

/** Parts used plus labour. New entries take this as their cost unless the user types one. */
export function logCost(g: Garage, f: RecForm) {
  const ps = (f.usedParts || []).map(id => g.parts.find(p => p.id === id)).filter(Boolean).reduce((a, p) => a + +(p!.cost || 0) * (p!.qty || 1), 0)
    + (f.newParts || []).reduce((a, p) => a + (+p.cost || 0), 0);
  return Math.round((ps + (+(f.labour || 0))) * 100) / 100;
}

/** The form for marking a reminder done. */
export function remForm(r: Reminder, odo: number, TODAY = today()): RecForm {
  const t = r.title.toLowerCase();
  const type: RecType = r.auto === 'rego' || /regist|rego/.test(t) ? 'Registration' : /insur/.test(t) ? 'Insurance' : r.isCheck || /inspection|\bmot\b/.test(t) ? 'Inspection' : 'Service';
  const base: RecForm = { type, title: r.title, fromReminder: r.id, date: TODAY, odo: String(odo), cost: '', gallons: '', notes: '', where: 'diy', checks: (r.checklist || []).map(text => ({ text, done: false })) };
  return r.isCheck ? { ...base, isCheck: true, result: 'pass', passTitle: r.title } : base;
}

/** Next due after doing a reminder: from when it was done, or on its fixed schedule. One-offs are marked done. */
export function rollReminder(r: Reminder, date: string, odo: number): Reminder {
  if (!r.repeatDays && !r.repeatDist) return { ...r, done: true, lastDone: date };
  if (r.repeatFrom === 'fixed') {
    let dd = r.dueDate || '', dO = r.dueOdo === '' || r.dueOdo == null ? null : +r.dueOdo, n = 0;
    if (r.repeatDays) { if (!dd) dd = nextDue(date, +r.repeatDays); else while (dd <= date && n++ < 400) dd = nextDue(dd, +r.repeatDays); }
    n = 0;
    if (r.repeatDist) { if (dO == null) dO = odo + +r.repeatDist; else while (dO <= odo && n++ < 400) dO += +r.repeatDist; }
    return { ...r, lastDone: date, dueDate: r.repeatDays ? dd : '', dueOdo: r.repeatDist ? dO! : '' };
  }
  return { ...r, lastDone: date, dueDate: r.repeatDays ? nextDue(date, +r.repeatDays) : '', dueOdo: r.repeatDist ? odo + +r.repeatDist : '' };
}

export function saveRecord(g: Garage, vid: string, f: RecForm, by: string | null, TODAY = today()): { g: Garage } | { odoErr: string } {
  const unit = g.settings.units;
  // A failed check becomes a high-priority fix at the top of the Backlog, and the check is rescheduled.
  if (f.isCheck && f.result === 'fail') {
    const b = structuredClone(g.boards[vid] || { backlog: [], parts: [], progress: [], done: [] });
    const failed = (f.checks || []).filter(x => x.state === 'fail').map(x => x.text);
    b.backlog.unshift({ id: uid(), createdBy: by, createdAt: now(), activity: [ev('Created from a failed check', by)], title: f.title, type: 'Repair', priority: 'High', est: +f.cost || 0, labour: +f.cost || 0, drive: 'N/A',
      note: [`Failed check ${f.date}`, failed.length ? 'Failed: ' + failed.join(', ') : '', f.notes].filter(Boolean).join(' · ') });
    const reminders = g.reminders.map(r => (r.id === f.fromReminder ? rollReminder(r, f.date, +f.odo || 0) : r));
    return { g: track({ ...g, boards: { ...g.boards, [vid]: b }, reminders }, by, vid, `failed check "${f.passTitle || f.title}" → added task to Backlog`) };
  }
  const v = g.vehicles.find(x => x.id === vid);
  if (f.type === 'Fuel') {
    const last = +(v?.odometer || 0), o = +f.odo || 0;
    if (!o) return { odoErr: 'Enter the odometer reading from the dash.' };
    if (o < last) return { odoErr: `That’s lower than the last reading (${last.toLocaleString()} ${unit}). Check the dash.` };
  }
  const autoCost = !f.fuelMode && !f.costTouched ? logCost(g, f) : 0;
  const rec: Rec = { id: uid(), by, vid, type: f.type, date: f.date, odo: +f.odo || 0, title: f.title, cost: autoCost > 0 ? autoCost : f.cost === '' || f.cost == null ? null : +f.cost || 0, notes: f.notes || '' };
  if (+(f.labour || 0)) rec.labour = +f.labour!;
  if (f.fromCard) rec.cardId = f.fromCard;
  if (f.checks?.length) rec.checks = f.checks.map(x => ({ text: x.text, done: x.state ? x.state === 'pass' : !!x.done }));
  if (f.type !== 'Fuel') rec.where = f.where || 'diy';
  else {
    rec.partial = !!f.partial; if (f.missed) rec.missed = true;
    rec.gallons = f.fuelBy === 'ppu' ? (+(f.ppu || 0) ? Math.round(((+f.cost || 0) / +f.ppu!) * 100) / 100 : 0) : +(f.gallons || 0);
  }

  let boards = g.boards, linked: { c: Task; k: Col } | null = null;
  if (!f.fromCard && f.linkTask && f.type !== 'Fuel') {
    const hit = findCard(g, vid, f.linkTask);
    if (hit && hit.k !== 'done') linked = { c: hit.c, k: hit.k };
  }
  if (linked) {
    const b = structuredClone(boards[vid]);
    b[linked.k] = b[linked.k].filter(x => x.id !== linked!.c.id);
    b.done.unshift({ ...linked.c, logged: true, autoRec: rec.id, doneAt: rec.date, activity: [...(linked.c.activity || []), ev(`Moved from ${COLNAME[linked.k]} to Done — linked to “${rec.title}” in service history`, by)] });
    boards = { ...boards, [vid]: b }; rec.cardId = linked.c.id;
  }
  if (f.fromCard) { const b = structuredClone(boards[vid]); b.done = b.done.map(x => (x.id === f.fromCard ? { ...x, logged: true } : x)); boards = { ...boards, [vid]: b }; }
  const doneCard = linked ? linked.c.id : f.fromCard || null;

  let vehicles = g.vehicles.map(x => (x.id === vid && +rec.odo > +(x.odometer || 0) ? { ...x, odometer: +rec.odo } : x));
  let reminders = g.reminders.map(r => (r.id === f.fromReminder ? rollReminder(r, rec.date, +rec.odo) : r));
  const done = f.fromReminder ? g.reminders.find(r => r.id === f.fromReminder) : undefined;
  if (done?.auto === 'rego') { vehicles = vehicles.map(x => (x.id === done.vid ? { ...x, regoExpiry: addMonths(x.regoExpiry || rec.date, +(x.regoTerm || 12)) } : x)); reminders = syncRego(vehicles, reminders); }
  if (done?.auto === 'ins') { vehicles = vehicles.map(x => (x.id === done.vid ? { ...x, insuranceRenewal: addMonths(x.insuranceRenewal || rec.date, 12) } : x)); reminders = syncRego(vehicles, reminders); }

  // Parts used are installed and linked to the entry; new ones join the parts list as installed.
  const ids = f.usedParts || [];
  let parts: Part[] = g.parts.map(p => (ids.includes(p.id) ? { ...p, recId: rec.id, status: 'Installed' as const } : p));
  (f.newParts || []).forEach(n => parts.push({ id: uid(), vid, cardId: f.fromCard || null, recId: rec.id, name: n.name, partNo: '', vendor: '', qty: 1, cost: +n.cost || 0, status: 'Installed', url: '', by: by || undefined, at: now() }));
  if (doneCard) parts = parts.map(p => (p.cardId === doneCard ? { ...p, status: 'Installed' as const, recId: p.recId || rec.id } : p));

  let out: Garage = { ...g, records: [rec, ...g.records], parts, vehicles, boards, reminders };
  ids.forEach(id => { const p = g.parts.find(x => x.id === id); if (p?.cardId && p.status !== 'Installed') out = cardEvent(out, vid, p.cardId, `Marked “${p.name || 'a part'}” as installed`, by); });
  if (linked) out = track(out, by, vid, `moved "${linked.c.title}" to Done`);
  const vol = unit === 'km' ? 'L' : 'gal';
  return { g: track(out, by, vid, f.fromReminder ? (f.isCheck ? `passed check "${rec.title}"` : `completed "${rec.title}"`) : rec.type === 'Fuel' ? `added a fill-up · ${rec.gallons || 0} ${vol}` : `logged ${rec.type.toLowerCase()} "${rec.title}"`) };
}

// ---------- tasks ----------
export type CardForm = {
  id?: string; pid?: string; title: string; type: string; priority: Task['priority']; col: Col; origCol?: Col; origIdx?: number;
  labour: string; drive: Task['drive']; note: string; assignee: string; due: string; activity: Activity[];
  createdBy?: string | null; createdAt?: string; logged?: boolean; autoRec?: string; doneAt?: string; photos?: Task['photos']; files?: Task['files'];
};
export const cardForm = (c: Task, col: Col, idx: number): CardForm => ({
  id: c.id, title: c.title, type: c.type, priority: c.priority, col, origCol: col, origIdx: idx, labour: c.labour != null ? String(c.labour || '') : '',
  createdBy: c.createdBy, createdAt: c.createdAt, drive: c.drive || 'N/A', note: c.note, photos: [...(c.photos || [])], files: [...(c.files || [])],
  activity: [...(c.activity || [])].sort((a, b) => (a.at || '').localeCompare(b.at || '')), logged: c.logged, autoRec: c.autoRec, doneAt: c.doneAt, assignee: c.assignee || '', due: c.due || '',
});
export const newCardForm = (col: Col): CardForm => ({ pid: uid(), title: '', type: 'Upgrade', priority: 'Medium', col, labour: '', drive: 'N/A', note: '', assignee: '', due: '', activity: [] });
export const partsTotal = (g: Garage, cardId?: string) => Math.round(g.parts.filter(p => p.cardId === cardId).reduce((a, p) => a + +(p.cost || 0) * (p.qty || 1), 0) * 100) / 100;

export function saveCard(g: Garage, vid: string, f: CardForm, by: string | null, TODAY = today()): Garage {
  const b = structuredClone(g.boards[vid]);
  const orig = f.id ? findCard(g, vid, f.id)?.c : null;
  const id = f.id || f.pid || uid(), est = Math.round((partsTotal(g, id) + (+f.labour || 0)) * 100) / 100;
  const fields: [keyof Task, string, unknown][] = [['title', 'title', f.title], ['type', 'type', f.type], ['priority', 'priority', f.priority], ['est', 'estimate', est], ['drive', 'driving limit', f.drive], ['note', 'description', f.note], ['assignee', 'assignee', f.assignee], ['due', 'target date', f.due]];
  const changed = orig ? fields.filter(([k, , v]) => String(orig[k] ?? (k === 'drive' ? 'N/A' : '')) !== String(v ?? '')).map(x => x[1]) : [];
  let activity = [...f.activity];
  if (!f.id) activity = [ev('Task created in ' + COLNAME[f.col], by), ...activity];
  else { if (changed.length) activity.push(ev('Edited ' + changed.join(', '), by)); if (f.origCol !== f.col) activity.push(ev(`Moved from ${COLNAME[f.origCol!]} to ${COLNAME[f.col]}`, by)); }
  let card: Task = { ...(orig || {}), id, title: f.title.trim(), type: f.type, priority: f.priority, est, labour: +f.labour || 0, note: f.note || '', drive: f.drive || 'N/A', assignee: f.assignee || '', due: f.due || '',
    photos: f.photos || [], files: f.files || [], activity, createdBy: f.createdBy ?? by, createdAt: f.createdAt || (f.id ? undefined : now()), logged: f.logged, autoRec: f.autoRec, doneAt: f.doneAt };
  if (f.id) (Object.keys(b) as Col[]).forEach(k => { b[k] = b[k].filter(x => x.id !== f.id); });

  let records = g.records, parts = g.parts.filter(p => !(p.cardId === id && !String(p.name || '').trim() && !+p.cost));
  const from = f.id ? f.origCol! : null;
  if (card.autoRec && f.col === 'done') records = records.map(r => (r.id === card.autoRec ? { ...r, title: card.title, cost: card.est } : r));
  if (f.col === 'done' && from !== 'done') {
    if (!card.logged) {
      const v = g.vehicles.find(x => x.id === vid), odo = v ? new Calc(g, TODAY).stats(v).odo : 0;
      const rec: Rec = { id: uid(), vid, cardId: id, type: recTypeFor(card.type), date: TODAY, odo, title: card.title, cost: card.est, notes: 'From build board' + (card.note ? ' · ' + card.note : ''), by };
      records = [rec, ...records]; card = { ...card, logged: true, autoRec: rec.id, doneAt: TODAY };
    } else card = { ...card, doneAt: TODAY };
    parts.filter(p => p.cardId === id && p.status === 'In stock').forEach(p => card.activity!.push(ev(`Marked “${p.name || 'a part'}” as installed`, by)));
    parts = parts.map(p => (p.cardId === id && p.status === 'In stock' ? { ...p, status: 'Installed' as const } : p));
  } else if (from === 'done' && f.col !== 'done') {
    if (card.autoRec) records = records.filter(r => r.id !== card.autoRec);
    card = { ...card, logged: card.autoRec ? false : card.logged, autoRec: undefined, doneAt: undefined };
  }
  const target = b[f.col];
  if (f.id && f.origCol === f.col) target.splice(Math.min(f.origIdx ?? 0, target.length), 0, card); else target.unshift(card);
  const text = f.id ? (f.origCol !== f.col ? `moved "${card.title}" to ${COLNAME[f.col]}` : changed.length ? `edited ${changed.join(', ')} on "${card.title}"` : '') : `added task "${card.title}" to ${COLNAME[f.col]}`;
  return track({ ...g, boards: { ...g.boards, [vid]: b }, records, parts }, by, vid, text);
}

export function deleteCard(g: Garage, vid: string, id: string): Garage {
  const b = structuredClone(g.boards[vid]);
  (Object.keys(b) as Col[]).forEach(k => { b[k] = b[k].filter(x => x.id !== id); });
  return { ...g, boards: { ...g.boards, [vid]: b }, parts: g.parts.map(p => (p.cardId === id ? { ...p, cardId: null } : p)) };
}

/** Change a part's status. Ordering a part for a Backlog task moves the task to Waiting on parts. */
export function setPartStatus(g: Garage, id: string, nx: Part['status'], by: string | null): { g: Garage; moved: boolean } {
  const p = g.parts.find(x => x.id === id); if (!p) return { g, moved: false };
  let out: Garage = { ...g, parts: g.parts.map(x => (x.id === id ? { ...x, status: nx } : x)) }, moved = false;
  const b = p.cardId ? out.boards[p.vid] : null, i = b ? b.backlog.findIndex(c => c.id === p.cardId) : -1;
  if (nx === 'Ordered' && b && i > -1) {
    const nb = structuredClone(b), [cd] = nb.backlog.splice(i, 1);
    cd.activity = [...(cd.activity || []), ev(`Moved from Backlog to Waiting on parts — ${p.name || 'a part'} ordered`, by)];
    nb.parts.unshift(cd); out = { ...out, boards: { ...out.boards, [p.vid]: nb } }; moved = true;
  }
  out = cardEvent(out, p.vid, p.cardId, `Marked “${p.name || 'a part'}” as ${nx === 'In stock' ? 'in stock' : nx.toLowerCase()}`, by);
  return { g: track(out, by, p.vid, `marked "${p.name || 'a part'}" as ${nx.toLowerCase()}` + (moved ? ' → task moved to Waiting on parts' : '')), moved };
}

// ---------- reminders, odometer, vehicles ----------
export type RemForm = { id?: string; title: string; dueDate: string; dueOdo: string; repeatDays: string; repeatDist: string; isCheck: boolean; checklist: string[]; newItem: string; notes: string; repeatFrom: 'done' | 'fixed'; tpl: { cost: boolean; odo: boolean; notes: boolean } };
export const TPL0 = { cost: true, odo: true, notes: true };
export const remEditForm = (r: Reminder): RemForm => ({ id: r.id, title: r.title, dueDate: r.dueDate || '', dueOdo: r.dueOdo === '' || r.dueOdo == null ? '' : String(r.dueOdo), repeatDays: r.repeatDays ? String(r.repeatDays) : '', repeatDist: r.repeatDist ? String(r.repeatDist) : '', isCheck: !!r.isCheck, checklist: [...(r.checklist || [])], newItem: '', notes: r.notes || '', repeatFrom: r.repeatFrom === 'fixed' ? 'fixed' : 'done', tpl: { ...TPL0, ...((r as { fields?: RemForm['tpl'] }).fields || {}) } });
export const newRemForm = (): RemForm => ({ title: '', dueDate: '', dueOdo: '', repeatDays: '', repeatDist: '', isCheck: false, checklist: [], newItem: '', notes: '', repeatFrom: 'done', tpl: { ...TPL0 } });

export function saveReminder(g: Garage, vid: string, f: RemForm, by: string | null): Garage {
  const data = { title: f.title.trim(), dueDate: f.dueDate || '', dueOdo: f.dueOdo ? +f.dueOdo : '' as const, repeatDays: f.repeatDays ? +f.repeatDays : '' as const, repeatDist: f.repeatDist ? +f.repeatDist : '' as const, isCheck: !!f.isCheck, fields: { ...f.tpl },
    checklist: [...f.checklist, f.newItem].map(x => (x || '').trim()).filter(Boolean), notes: f.notes.trim(), repeatFrom: f.repeatFrom };
  if (f.id) return track({ ...g, reminders: g.reminders.map(r => (r.id === f.id ? { ...r, ...data } : r)) }, by, vid, `edited reminder "${data.title}"`);
  return track({ ...g, reminders: [...g.reminders, { id: uid(), vid, ...data, done: false }] }, by, vid, `added reminder "${data.title}"`);
}

export function setOdometer(g: Garage, vid: string, cur: number, add: string, reading: string, by: string | null, TODAY = today()): Garage {
  const fix = reading !== '' && reading != null, nx = fix ? +reading : cur + (+add || 0);
  if (nx <= cur) return g; // odometers only go up; old entries are corrected in History
  const vehicles = g.vehicles.map(v => (v.id === vid ? { ...v, odometer: nx, odoAt: TODAY, odoLog: [...(v.odoLog || []), { date: TODAY, odo: nx, src: fix ? 'correction' as const : 'reading' as const }] } : v));
  return track({ ...g, vehicles }, by, vid, `updated the odometer to ${nx.toLocaleString()} ${g.settings.units} (+${(nx - cur).toLocaleString()})`);
}

export type VehForm = { year: string; make: string; model: string; nickname: string; usage: Vehicle['usage']; plate: string; regoExpiry: string; odometer: string; purchasePrice: string };
export const newVehForm = (): VehForm => ({ year: '', make: '', model: '', nickname: '', usage: 'weekend', plate: '', regoExpiry: '', odometer: '', purchasePrice: '' });
export function addVehicle(g: Garage, f: VehForm, by: string | null): { g: Garage; id: string } {
  const id = 'v' + uid();
  const v: Vehicle = { id, year: +f.year, make: f.make.trim(), model: f.model.trim(), nickname: f.nickname.trim(), usage: f.usage || 'weekend', odometer: +f.odometer || 0, purchasePrice: +f.purchasePrice || 0, plate: f.plate.trim().toUpperCase(), regoExpiry: f.regoExpiry || '', regoTerm: 12 };
  const vehicles = [...g.vehicles, v];
  return { id, g: track({ ...g, vehicles, reminders: syncRego(vehicles, g.reminders), boards: { ...g.boards, [id]: { backlog: [], parts: [], progress: [], done: [] } }, notes: { ...g.notes, [id]: '' } }, by, id, `added ${v.year} ${v.make} ${v.model} to the garage`) };
}
