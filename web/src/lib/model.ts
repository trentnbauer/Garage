// Garage data model (see DATA_MODEL.md in the design handoff) and the pure logic around it.

export type Units = 'km' | 'mi';
export type Col = 'backlog' | 'parts' | 'progress' | 'done';
export type RecType = 'Service' | 'Repair' | 'Inspection' | 'Upgrade' | 'Fuel' | 'Registration' | 'Insurance' | 'Other';
export type Drive = 'N/A' | 'Around the block' | 'Moving in garage';

export interface FileRef { id: string; name: string; type: string; size: number; src: string; at: string }
export interface OdoReading { date: string; odo: number; src: 'reading' | 'correction' | 'import'; key?: string }

export interface Vehicle {
  id: string; year: number | ''; make: string; model: string; nickname?: string; plate?: string; vin?: string;
  chassisCode?: string; colour?: string; usage?: 'daily' | 'weekend' | 'track' | 'storage';
  odometer: number | ''; odoAt?: string; engine?: string; transmission?: string; fuelType?: string; fuelSystem?: string;
  purchaseDate?: string; purchasePrice?: number | ''; purchaseOdo?: number | ''; estValue?: number | '' | null;
  regoExpiry?: string; regoTerm?: 3 | 6 | 12; insurer?: string; policyNo?: string; insuranceRenewal?: string; claimsPhone?: string;
  coverType?: string; agreedValue?: number | ''; premium?: number | ''; boughtFrom?: string;
  photo?: string; docs?: (FileRef & { kind: 'rego' | 'rwc' | 'insurance' | 'purchase' })[]; specs?: Specs; manuals?: { id: string; name: string; pages: number }[];
  sold?: { date: string; price: number | null; to: string } | null; odoLog?: OdoReading[];
  src?: string; srcKeys?: string[]; noteKeys?: string[];
}

export type SpecRow = Record<string, string>;
// Groups by key (torque, fluids…) plus `custom` sections and `_shown` optional groups the user added.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Specs = Record<string, any>;

export interface Rec {
  id: string; vid: string; type: RecType; date: string; odo: number | ''; title: string; cost: number | null; labour?: number;
  notes: string; where?: 'diy' | 'shop'; by?: string | null; files?: FileRef[]; checks?: { text: string; done: boolean }[];
  cardId?: string; gallons?: number; partial?: boolean; missed?: boolean; src?: string;
}

export interface Reminder {
  id: string; vid: string; title: string; dueDate: string; dueOdo: number | ''; repeatDays?: number | '';
  repeatMonths?: number; repeatDist?: number | ''; isCheck?: boolean; checklist?: string[]; notes?: string;
  repeatFrom?: 'done' | 'fixed'; lastDone?: string; done: boolean; auto?: 'rego' | 'ins'; src?: string;
}

export interface Activity { id: string; at: string; kind: 'event' | 'note'; text: string; by: string | null }
export interface Task {
  id: string; title: string; type: string; priority: 'High' | 'Medium' | 'Low'; est: number; labour?: number; note: string;
  drive?: Drive; assignee?: string; due?: string; photos?: { id: string; src: string; phase?: 'before' | 'after' }[];
  files?: FileRef[]; activity?: Activity[]; createdBy?: string | null; createdAt?: string; logged?: boolean; autoRec?: string; doneAt?: string;
}
export type Board = Record<Col, Task[]>;

export interface Part {
  id: string; vid: string; cardId: string | null; recId?: string | null; name: string; partNo: string; vendor: string;
  qty: number; cost: number | ''; status: 'Needed' | 'Ordered' | 'In stock' | 'Installed'; url: string; files?: FileRef[]; at?: string; by?: string; src?: string;
}
export interface ShelfItem { id: string; name: string; partNo: string; qty: number; fits: string; at: string; src?: string }

export interface User {
  id: string; name: string; email?: string; provider?: string; color: string; role: 'admin' | 'member'; removed?: boolean;
  hasPin?: boolean; hasTotp?: boolean; // the PIN and TOTP secret never leave the server
}

export interface Settings {
  units: Units; currency: string; soonDays: number; soonDist: number; accent: string; fullWidth: boolean;
  showTotals: boolean; defaultSec: string; showDoneCol: boolean; hideDoneDays: number; compact?: boolean;
}

export interface Garage {
  vehicles: Vehicle[]; records: Rec[]; reminders: Reminder[]; parts: Part[]; boards: Record<string, Board>;
  notes: Record<string, string>; shelf: ShelfItem[]; users: User[]; settings: Settings;
  auth: { signins: boolean; tfaTotp?: boolean; tfaRequire?: 'off' | 'admins' | 'all' };
  log: { id: string; at: string; by: string | null; vid: string | null; text: string }[];
  /** Admin-set integrations, sent by the server. Their secrets stay there: only whether one is saved. */
  ai?: AiCfg; smtp?: SmtpCfg;
}
export type AiCfg = { enabled: boolean; provider: 'anthropic' | 'openai' | 'ollama'; model: string; baseUrl: string; shareSpecs: boolean; shareHistory: boolean; shareNotes: boolean; shareManual: boolean; hasKey: boolean };
export type SmtpCfg = { enabled: boolean; host: string; port: number; security: 'starttls' | 'ssl' | 'none'; user: string; fromName: string; fromAddr: string; replyTo: string; to: string; digest: 'off' | 'daily' | 'weekly'; overdue: boolean; blockers: boolean; summary: boolean; signin: boolean; hasPass: boolean };

export const SETTINGS0: Settings = { units: 'km', currency: '$', soonDays: 14, soonDist: 500, accent: '', fullWidth: false, showTotals: true, defaultSec: 'overview', showDoneCol: true, hideDoneDays: 7 };

// ---------- constants ----------
export const COLS: [Col, string, string][] = [['backlog', 'Backlog', '#8d9099'], ['parts', 'Waiting on parts', '#e8b04b'], ['progress', 'In progress', '#5b84ff'], ['done', 'Done', '#3fcf8e']];
export const COLNAME: Record<Col, string> = { backlog: 'Backlog', parts: 'Waiting on parts', progress: 'In progress', done: 'Done' };
export const RTYPES: RecType[] = ['Service', 'Repair', 'Inspection', 'Upgrade', 'Fuel', 'Registration', 'Insurance', 'Other'];
export const TCOL: Record<string, string> = { Service: '#5b84ff', Repair: '#f2685f', Inspection: '#c9d65b', Upgrade: '#3fcf8e', Fuel: '#e8b04b', Registration: '#b48cff', Insurance: '#4fc3d9', Other: '#a3a6ad', Maintenance: '#5b84ff', Bodywork: '#e8935b', Electrical: '#e8b04b', Interior: '#b48cff' };
export const DRIVE: Record<Drive, { rank: number; hint: string; color: string }> = { 'N/A': { rank: 0, hint: 'No limits', color: '#8d9099' }, 'Around the block': { rank: 1, hint: 'Short trips only', color: '#e8b04b' }, 'Moving in garage': { rank: 2, hint: 'Not road-safe', color: '#f2685f' } };
export const UCOLORS = ['#5b84ff', '#3fcf8e', '#e8b04b', '#f2685f', '#b48cff', '#4fc3d9'];
export const SECS = { overview: 'Overview', details: 'Car details', specs: 'Specs', board: 'Build board', photos: 'Build photos', history: 'Service history', fuel: 'Fuel log', reminders: 'Reminders', parts: 'Parts', notes: 'Notes', manual: 'Workshop manual' } as const;
export type Sec = keyof typeof SECS;
export const STATUS_COL = ['#f2685f', '#e8b04b', '#b5b5b5'];
export const FUELS = ['Petrol — 91 / Regular', 'Petrol — 95 / Mid-grade', 'Petrol — 98 / Premium', 'E10', 'E85', 'Diesel', 'LPG'];
export const PSTAT: Part['status'][] = ['Needed', 'Ordered', 'In stock', 'Installed'];
export const PCOL: Record<string, string> = { Needed: '#f2685f', Ordered: '#e8b04b', 'In stock': '#5b84ff', Installed: '#3fcf8e' };
/** The grade of the last fill-up, else the car's fuel type. */
export const lastGrade = (g: Garage, vid: string) => g.records.filter(r => r.vid === vid && r.type === 'Fuel' && r.title && r.title !== 'Fill-up').sort((a, b) => b.date.localeCompare(a.date))[0]?.title || g.vehicles.find(v => v.id === vid)?.fuelType || FUELS[0];

// ---------- dates ----------
export const liso = (x: Date) => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
export const today = () => liso(new Date());
export const days = (a: string, b: string) => Math.round((+new Date(b + 'T00:00') - +new Date(a + 'T00:00')) / 864e5);
export const addDays = (d: string, n: number) => { const x = new Date(d + 'T00:00'); x.setDate(x.getDate() + n); return liso(x); };
export const addMonths = (d: string, n: number) => { const x = new Date(d + 'T00:00'); x.setMonth(x.getMonth() + n); return liso(x); };
// Yearly repeats use calendar years so a leap day doesn't drift.
export const nextDue = (d: string, n: number) => (n && n % 365 === 0 ? addMonths(d, (n / 365) * 12) : addDays(d, n));
export const fdate = (d?: string) => (d ? new Date(d + 'T00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const uid = () => Math.random().toString(36).slice(2, 9);
export const tint = (hex: string, a: string) => hex + a;

// ---------- formatting ----------
export function money(n: number | null | '' | undefined, cur: string, dec?: boolean) {
  if (n == null || n === '') return '—';
  const x = Math.round(Number(n) * 100) / 100, d = dec || x % 1 !== 0;
  return cur + x.toLocaleString('en-US', { minimumFractionDigits: d ? 2 : 0, maximumFractionDigits: d ? 2 : 0 });
}
export const dist = (n: number | '' | null | undefined, u: Units) => (n === '' || n == null ? '—' : Number(n).toLocaleString('en-US') + ' ' + u);

/** The user-set accent, clamped to a readable lightness, with the text colour that sits on it. */
export function accentTheme(hex?: string) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return { acc: '#ececec', accs: 'rgba(255,255,255,.09)', fg: '#0b0b0b' };
  let r = parseInt(hex!.slice(1, 3), 16) / 255, g = parseInt(hex!.slice(3, 5), 16) / 255, b = parseInt(hex!.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let hh = 0, ss = 0, l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; ss = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh /= 6; }
  l = Math.min(0.82, Math.max(0.5, l));
  const f = (p: number, q: number, t: number) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  const q = l < 0.5 ? l * (1 + ss) : l + ss - l * ss, p = 2 * l - q;
  [r, g, b] = ss ? [f(p, q, hh + 1 / 3), f(p, q, hh), f(p, q, hh - 1 / 3)] : [l, l, l];
  const to = (x: number) => Math.round(x * 255), lum = 0.2126 * r ** 2.2 + 0.7152 * g ** 2.2 + 0.0722 * b ** 2.2;
  return { acc: '#' + [r, g, b].map(x => to(x).toString(16).padStart(2, '0')).join(''), accs: `rgba(${to(r)},${to(g)},${to(b)},.16)`, fg: lum > 0.28 ? '#0b0b0b' : '#ffffff' };
}

// ---------- fuel ----------
/** Economy per fill-up in distance per volume. Partial fills roll into the next full tank; a missed fill-up resets the baseline. */
export function econSeries(fl: Rec[]) {
  let lastFull: Rec | null = null, acc = 0, d0 = 0, gal = 0;
  const rows: { r: Rec; d: number | null; e: number | null }[] = [];
  fl.forEach((r, i) => {
    const prev = i ? fl[i - 1] : null, d = prev ? +r.odo - +prev.odo : null;
    let e: number | null = null;
    if (r.missed) { lastFull = r.partial ? null : r; acc = 0; rows.push({ r, d, e }); return; }
    if (lastFull) { acc += +(r.gallons || 0); if (!r.partial && acc > 0) { const dd = +r.odo - +lastFull.odo; e = dd / acc; d0 += dd; gal += acc; } }
    if (!r.partial) { lastFull = r; acc = 0; }
    rows.push({ r, d, e });
  });
  return { rows, avg: gal ? d0 / gal : null };
}

// ---------- reminders ----------
export function syncRego(vehicles: Vehicle[], reminders: Reminder[]) {
  const out = reminders.slice();
  const sync = (v: Vehicle, auto: 'rego' | 'ins', date: string | undefined, title: string, months: number) => {
    const i = out.findIndex(r => r.vid === v.id && r.auto === auto);
    if (!date || v.sold) { if (i > -1) out.splice(i, 1); return; }
    const base: Reminder = i > -1 ? out[i] : { id: uid(), vid: v.id, auto, title, dueDate: '', dueOdo: '', repeatDist: '', isCheck: false, checklist: [], done: false };
    const r: Reminder = { ...base, title: base.title || title, dueDate: date, repeatDays: months === 12 ? 365 : Math.round(months * 30.42), repeatMonths: months, done: false };
    if (i > -1) out[i] = r; else out.push(r);
  };
  vehicles.forEach(v => sync(v, 'rego', v.regoExpiry, 'Rego renewal', +(v.regoTerm || 12)));
  vehicles.forEach(v => sync(v, 'ins', v.insuranceRenewal, 'Insurance renewal', 12));
  return out;
}

export interface RemInfo { rank: 0 | 1 | 2; color: string; status: string; due: string; short: string; sortKey: number; pct: string }

export function driveLimit(board: Partial<Board>) {
  let best: Task | null = null;
  (['backlog', 'parts', 'progress'] as Col[]).forEach(k => (board[k] || []).forEach(c => {
    const d = c.drive && DRIVE[c.drive];
    if (d && d.rank > 0 && (!best || d.rank > DRIVE[best.drive!].rank)) best = c;
  }));
  return best as Task | null;
}

/** Derived numbers and lookups for one garage snapshot. Built once per render. */
export class Calc {
  private kpd: Record<string, number> = {};
  g: Garage;
  TODAY: string;
  constructor(g: Garage, TODAY = today()) { this.g = g; this.TODAY = TODAY; }
  get u() { return this.g.settings.units || 'km'; }
  get cur() { return this.g.settings.currency || '$'; }
  money = (n: number | null | '' | undefined, dec?: boolean) => money(n, this.cur, dec);
  dist = (n: number | '' | null | undefined) => dist(n, this.u);

  stats(v: Vehicle) {
    const recs = this.g.records.filter(r => r.vid === v.id);
    const total = recs.reduce((a, r) => a + (+(r.cost || 0)), 0);
    const odo = Math.max(+v.odometer || 0, ...recs.map(r => +r.odo || 0));
    const fuel = recs.filter(r => r.type === 'Fuel' && r.gallons).sort((a, b) => +a.odo - +b.odo);
    const es = econSeries(fuel);
    const b = this.g.boards[v.id] || ({} as Board);
    const open = (['backlog', 'parts', 'progress'] as Col[]).reduce((a, k) => a + (b[k] || []).length, 0);
    return { recs, total, odo, econ: es.avg, econs: es.rows.filter(x => x.e).map(x => x.e!), open, doneN: (b.done || []).length };
  }

  /** km per day from the last year of readings, falling back to a guess from how the car is used. */
  kmPerDay(vid: string) {
    if (this.kpd[vid] != null) return this.kpd[vid];
    const v = this.g.vehicles.find(x => x.id === vid) || ({} as Vehicle);
    const pts: [string, number][] = this.g.records.filter(r => r.vid === vid && +r.odo > 0 && days(r.date, this.TODAY) <= 365).map(r => [r.date, +r.odo]);
    if (v.odoAt && v.odometer) pts.push([v.odoAt, +v.odometer]);
    (v.odoLog || []).forEach(x => { if (+x.odo > 0 && days(x.date, this.TODAY) <= 365) pts.push([x.date, +x.odo]); });
    pts.sort((a, b) => a[0].localeCompare(b[0]));
    let rate: number | null = null;
    if (pts.length >= 2) { const d = days(pts[0][0], pts[pts.length - 1][0]), k = pts[pts.length - 1][1] - pts[0][1]; if (d >= 21 && k > 0) rate = k / d; }
    if (rate == null) rate = ({ daily: 40, weekend: 10, track: 5 } as Record<string, number>)[v.usage || 'weekend'] || 10;
    return (this.kpd[vid] = rate);
  }

  kmPause(vid: string) {
    const v = this.g.vehicles.find(x => x.id === vid);
    if (v?.usage === 'storage') return 'in storage';
    const b = this.g.boards[vid] || ({} as Board);
    return (['backlog', 'parts', 'progress'] as Col[]).some(k => (b[k] || []).some(c => c.drive === 'Moving in garage')) ? 'it’s limited to moving in the garage' : '';
  }

  /** Status of a reminder: whichever of the date or distance limit comes first. */
  remInfo(r: Reminder, odo: number): RemInfo {
    const u = this.u, sw = +this.g.settings.soonDays || 14, sd = +this.g.settings.soonDist || 500;
    const dueDate = r.dueDate || (r.repeatDays && r.lastDone ? nextDue(r.lastDone, +r.repeatDays) : '');
    const dD = dueDate ? days(this.TODAY, dueDate) : null;
    const hasOdo = r.dueOdo !== '' && r.dueOdo != null, left = hasOdo ? +r.dueOdo - odo : null;
    const pause = hasOdo && left! > 0 ? this.kmPause(r.vid) : '', kpd = this.kmPerDay(r.vid);
    const estD = hasOdo ? (left! <= 0 ? 0 : pause ? null : Math.round(left! / kpd)) : null;
    const odoOver = hasOdo && left! <= 0, dateOver = dD != null && dD <= 0, overdue = odoOver || dateOver;
    const soon = !overdue && ((dD != null && dD <= sw) || (hasOdo && left! <= sd) || (estD != null && estD <= sw));
    const kmTxt = (n: number) => Math.abs(n).toLocaleString() + ' ' + u;
    let due: string, short: string;
    if (dateOver) { due = fdate(dueDate) + ' · ' + -dD! + 'd overdue'; short = -dD! + ' days overdue'; }
    else if (odoOver) { due = 'at ' + this.dist(r.dueOdo) + ' · ' + kmTxt(left!) + ' over'; short = kmTxt(left!) + ' over'; }
    else if (dD != null && (estD == null || dD <= estD)) { due = fdate(dueDate) + ' · in ' + dD + 'd'; short = 'in ' + dD + ' days'; }
    else if (estD != null) { const est = addDays(this.TODAY, estD); due = 'at ' + this.dist(r.dueOdo) + ' · ' + kmTxt(left!) + ' to go · ≈ ' + fdate(est) + ' at ' + Math.round(kpd * 7) + ' ' + u + '/wk'; short = kmTxt(left!) + ' to go · ≈ ' + fdate(est).replace(/,? \d{4}$/, ''); }
    else { due = 'at ' + this.dist(r.dueOdo) + ' · ' + kmTxt(left!) + ' to go · date estimate paused while ' + pause; short = kmTxt(left!) + ' to go'; }
    let pct = 0;
    if (dD != null) pct = Math.max(pct, Math.min(1, 1 - dD / (+(r.repeatDays || 0) || 180)));
    if (hasOdo) pct = Math.max(pct, Math.min(1, 1 - left! / (+(r.repeatDist || 0) || 3000)));
    const rank = (overdue ? 0 : soon ? 1 : 2) as 0 | 1 | 2;
    const sortKey = Math.min(dD != null ? dD : Infinity, estD != null ? estD : hasOdo ? 1e5 : Infinity);
    return { rank, color: STATUS_COL[rank], status: ['Overdue', 'Due soon', 'Upcoming'][rank], due, short, sortKey, pct: Math.round(Math.max(pct, 0.04) * 100) + '%' };
  }

  activeRems(v: Vehicle, odo = this.stats(v).odo) {
    return this.g.reminders.filter(r => r.vid === v.id && !r.done).map(r => ({ r, i: this.remInfo(r, odo) })).sort((a, b) => a.i.rank - b.i.rank || a.i.sortKey - b.i.sortKey);
  }

  /** One Due list: reminders plus tasks that block driving or have a target date. */
  dueFor(vs: Vehicle[], withUpcoming: boolean) {
    const soon = +this.g.settings.soonDays || 14;
    type Item = { kind: 'rem'; v: Vehicle; r: Reminder; i: RemInfo; rank: number; key: number }
      | { kind: 'task'; v: Vehicle; c: Task; k: Col; blk: boolean; rank: number; key: number; color: string; status: string; due: string; short: string };
    const items: Item[] = [];
    vs.forEach(v => {
      const odo = this.stats(v).odo;
      this.g.reminders.filter(r => r.vid === v.id && !r.done).forEach(r => { const i = this.remInfo(r, odo); if (!withUpcoming && i.rank === 2) return; items.push({ kind: 'rem', v, r, i, rank: i.rank, key: i.sortKey }); });
      const b = this.g.boards[v.id] || ({} as Board);
      (['backlog', 'parts', 'progress'] as Col[]).forEach(k => (b[k] || []).forEach(c => {
        const d = c.drive ? DRIVE[c.drive] : null, blk = !!(d && d.rank > 0), dd = c.due ? days(this.TODAY, c.due) : null;
        const rank = blk || (dd != null && dd < 0) ? 0 : dd != null && dd <= soon ? 1 : dd != null ? 2 : null;
        if (rank == null || (!withUpcoming && rank === 2)) return;
        items.push({ kind: 'task', v, c, k, blk, rank, key: blk ? -1e6 - d!.rank : dd!, color: blk ? d!.color : STATUS_COL[rank],
          status: blk ? c.drive! : dd! < 0 ? 'Overdue' : rank === 1 ? 'Due soon' : 'Planned',
          due: blk ? `Blocker · ${d!.hint.toLowerCase()} until fixed · ${COLNAME[k]}` : `Task · target ${fdate(c.due)}${dd! < 0 ? ' · ' + -dd! + 'd late' : dd === 0 ? ' · today' : ' · in ' + dd + 'd'} · ${COLNAME[k]}`,
          short: blk ? c.drive + ' until fixed' : dd! < 0 ? -dd! + ' days late' : dd === 0 ? 'today' : 'in ' + dd + ' days' });
      }));
    });
    return items.sort((a, b) => a.rank - b.rank || a.key - b.key);
  }
}

// ---------- board ----------
export const recTypeFor = (taskType: string): RecType => (taskType === 'Repair' ? 'Repair' : taskType === 'Maintenance' ? 'Service' : taskType === 'Upgrade' ? 'Upgrade' : 'Other');
const ev = (text: string, by: string | null): Activity => ({ id: uid(), at: new Date().toISOString(), kind: 'event', text, by });

/** Move a task. Done logs it to service history and installs its in-stock parts; moving it back out undoes the auto entry. */
export function moveCard(g: Garage, vid: string, id: string, toCol: Col, idx: number, by: string | null, TODAY = today()): Garage {
  const b = structuredClone(g.boards[vid]);
  const f = (Object.keys(b) as Col[]).find(k => b[k].some(x => x.id === id));
  if (!f) return g;
  const fi = b[f].findIndex(x => x.id === id);
  let [card] = b[f].splice(fi, 1);
  if (f === toCol && fi < idx) idx--;
  let records = g.records, parts = g.parts, log = g.log;
  if (f !== toCol) {
    card = { ...card, activity: [...(card.activity || []), ev(`Moved from ${COLNAME[f]} to ${COLNAME[toCol]}`, by)] };
    log = [{ id: uid(), at: new Date().toISOString(), by, vid, text: `moved "${card.title}" to ${COLNAME[toCol]}` }, ...log];
  }
  if (toCol === 'done' && f !== 'done') {
    if (!card.logged) {
      const v = g.vehicles.find(x => x.id === vid), odo = v ? new Calc(g, TODAY).stats(v).odo : 0;
      const rec: Rec = { id: uid(), vid, cardId: card.id, type: recTypeFor(card.type), date: TODAY, odo, title: card.title, cost: +card.est || 0, notes: 'From build board' + (card.note ? ' · ' + card.note : ''), by };
      records = [rec, ...records];
      card = { ...card, logged: true, autoRec: rec.id, doneAt: TODAY };
    } else card = { ...card, doneAt: TODAY };
    const inst = parts.filter(p => p.cardId === id && p.status === 'In stock');
    card = { ...card, activity: [...(card.activity || []), ...inst.map(p => ev(`Marked “${p.name || 'a part'}” as installed`, by))] };
    parts = parts.map(p => (p.cardId === id && p.status === 'In stock' ? { ...p, status: 'Installed' as const } : p));
  } else if (f === 'done' && toCol !== 'done') {
    if (card.autoRec) records = records.filter(r => r.id !== card.autoRec);
    card = { ...card, logged: card.autoRec ? false : card.logged, autoRec: undefined, doneAt: undefined };
  }
  b[toCol].splice(idx, 0, card);
  return { ...g, boards: { ...g.boards, [vid]: b }, records, parts, log };
}

// ---------- reminders ----------
export const fmtMonths = (m: number) => (m === 1 ? 'month' : m === 12 ? 'year' : m % 12 === 0 ? `${m / 12} years` : `${m} months`);
export const fmtEvery = (d: number) => (!d ? '' : d % 365 === 0 ? (d === 365 ? 'year' : `${d / 365} years`) : d >= 28 ? fmtMonths(Math.round(d / 30.42)) : d === 7 ? 'week' : `${d} days`);

// [title, history match, repeat days, repeat km, pass/fail check, checklist]
export const TEMPLATES: [string, RegExp, number, number | '', boolean, string[]][] = [
  ['Oil change', /oil change|oil &|oil and/i, 182, 8000, false, ['Engine oil', 'Oil filter']],
  ['Brake fluid change', /brake fluid/i, 730, '', false, ['Check brake pads', 'Check rotors', 'Flush fluid']],
  ['Tyre check', /tyre|tire/i, 30, '', true, ['Inspect tyre tread', 'Check sidewalls for cracks or bulges', 'Pump up tyre pressure']],
  ['Coolant flush', /coolant/i, 730, '', false, ['Drain coolant', 'Flush system', 'Refill 50/50 mix', 'Bleed air from system']],
  ['Spark plugs', /spark plug|plugs/i, 730, 48000, false, ['Remove and inspect plugs', 'Check and set gaps', 'Inspect leads for cracks', 'Anti-seize on threads']],
  ['Timing belt', /timing belt/i, 1460, 60000, false, ['Timing belt', 'Tensioner and roller', 'Water pump', 'Cam and crank seals', 'Set timing marks']],
  ['Diff oil change', /diff/i, 730, '', false, ['Drain diff', 'Inspect drain plug magnet', 'Refill 75W-90', 'Check for leaks after a drive']],
  ['Carburettor tune', /carb/i, 182, '', false, ['Balance carbs', 'Set idle mixture', 'Top up dashpot oil', 'Check linkage free play']],
  ['Cooling system check', /cooling/i, 30, '', true, ['Coolant level at cold', 'Hoses firm, no cracks', 'Radiator cap seal', 'Fan kicks in at temperature']],
  ['Battery tender check', /battery/i, 30, '', true, ['Tender connected', 'Terminals clean and tight', 'Resting voltage above 12.6 V']],
  ['Pre-track inspection', /track/i, 30, '', true, ['Torque wheel nuts', 'Check brake pad thickness', 'Check fluid levels', 'Look for leaks under the car', 'Helmet and harness ready']],
  ['Storage check', /storage/i, 30, '', true, ['Battery tender connected', 'Tyre pressures', 'Check for rodents', 'Run engine to temperature']],
  ['Annual inspection', /\bmot\b|roadworthy|annual inspection|^inspection/i, 365, '', true, ['Lights & indicators', 'Brakes & handbrake', 'Tyres & wheels', 'Steering & suspension', 'Seatbelts', 'Exhaust & emissions', 'Windscreen, wipers & washers', 'Horn', 'Body & chassis corrosion', 'VIN & plates legible']],
  ['Monthly safety check', /safety (inspection|check)/i, 30, '', true, ['Lights & indicators', 'Brake pedal feel', 'Tyre tread depth', 'Tyre pressure', 'Wipers & washers']],
];
export function fuelSys(v: Partial<Vehicle>) {
  if (v.fuelSystem) return v.fuelSystem;
  const e = ((v.engine || '') + ' ' + (v.fuelType || '')).toLowerCase();
  if (/electric/.test(e)) return 'Electric'; if (/diesel|tdi|crd/.test(e)) return 'Diesel';
  if (/carb|\bsu\b|weber|dellorto|solex/.test(e)) return 'Carburettor'; if (/efi|inject|\bfi\b|jetronic|motronic|mpfi|\bgdi\b/.test(e)) return 'Fuel injection';
  const y = +(v.year || 0); return !y ? '' : y >= 1986 ? 'Fuel injection' : y < 1980 ? 'Carburettor' : '';
}
/** Templates are filtered by fuel system: no carb tune on an injected car, no oil change on an EV. */
export function tplApplies(tp: typeof TEMPLATES[0], v: Partial<Vehicle>) {
  const fs = fuelSys(v), n = tp[0];
  if (/Carburettor/.test(n)) return fs === 'Carburettor' || fs === '';
  if (n === 'Spark plugs') return fs !== 'Diesel' && fs !== 'Electric';
  if (['Oil change', 'Timing belt', 'Coolant flush'].includes(n)) return fs !== 'Electric';
  return true;
}
/** A reminder from a template, due from the last matching entry in the car's history (or today). */
export function templateRem(tp: typeof TEMPLATES[0], vid: string, odo: number, unit: Units, recs: Rec[], TODAY = today()): Reminder {
  const [title, re, rd, km, isCheck, checklist] = tp, dist = km ? Math.round((km * (unit === 'km' ? 1 : 0.62)) / 100) * 100 : '';
  const l = recs.filter(r => r.vid === vid && r.type !== 'Fuel' && re.test(r.title || '')).sort((x, y) => y.date.localeCompare(x.date))[0];
  const base = l ? l.date : TODAY, bo = l ? +l.odo || odo : odo;
  return { id: uid(), vid, title, dueDate: addDays(base, rd), dueOdo: dist ? bo + dist : '', repeatDays: rd, repeatDist: dist, isCheck, checklist: [...checklist], notes: '', repeatFrom: 'done', done: false, ...(l ? { lastDone: l.date } : {}) };
}

// ---------- export ----------
export const csv = (rows: unknown[][]) => rows.map(r => r.map(c => { const s = c == null ? '' : String(c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n');
export function download(name: string, text: string, type = 'text/csv') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- specs ----------
// key → [title, hint, columns [field, label, placeholder, flex], always shown, noun for "+ Add", starter rows]
export const SPEC_DEF: Record<string, [string, string, [string, string, string, number][], boolean, string, string[]?]> = {
  torque: ['Torque specs', 'Fasteners you undo often', [['item', 'Fastener', 'Wheel nuts', 2], ['value', 'Torque', 'e.g. 65–80 ft-lb', 1]], true, 'torque spec'],
  fluids: ['Fluids & capacities', 'Type and fill amount', [['system', 'System', 'Engine oil', 1.3], ['type', 'Type', 'e.g. 5W-30', 1.2], ['capacity', 'Capacity', 'e.g. 3.8 L', 0.9]], true, 'fluid'],
  tyres: ['Tyres', 'Sizes and cold pressures', [['pos', 'Position', 'Front', 0.9], ['size', 'Size', 'e.g. 195/50R15', 1.3], ['pressure', 'Pressure', 'e.g. 28 psi', 1]], true, 'tyre'],
  parts: ['Filters & bulbs', 'Part numbers you re-buy', [['item', 'Item', 'Oil filter', 1.3], ['partNo', 'Part number', 'e.g. Wix 51358', 1.3]], true, 'part number'],
  tune: ['Engine tune', 'Ignition, idle and valve settings', [['item', 'Setting', 'Spark plug gap', 1.4], ['value', 'Value', 'e.g. 1.0–1.1 mm', 1.2]], false, 'setting', ['Spark plug gap', 'Ignition timing', 'Idle speed', 'Valve clearance']],
  alignment: ['Alignment & suspension', 'Wheel alignment and ride height', [['item', 'Setting', 'Camber', 1.1], ['front', 'Front', 'e.g. -1.0°', 1], ['rear', 'Rear', 'e.g. -1.5°', 1]], false, 'setting', ['Camber', 'Caster', 'Toe', 'Ride height']],
  brakes: ['Brakes', 'Pads, rotors and minimum thickness', [['item', 'Part', 'Front pads', 1.2], ['spec', 'Spec', 'e.g. EBC Yellowstuff DP4', 1.4], ['min', 'Min. thickness', 'e.g. 18 mm', 0.9]], false, 'brake spec'],
  electrical: ['Electrical', 'Battery, charging and fuses', [['item', 'Item', 'Battery', 1.2], ['value', 'Spec', 'e.g. 12 V 45 Ah, group 51R', 1.6]], false, 'electrical spec', ['Battery', 'Alternator output', 'Main fuse']],
  dims: ['Dimensions & weights', 'Handy when towing or shipping', [['item', 'Measurement', 'Kerb weight', 1.3], ['value', 'Value', 'e.g. 960 kg', 1.1]], false, 'measurement', ['Kerb weight', 'Wheelbase', 'Length × width', 'Towing capacity']],
};

/** Reminders and task target dates as an iCalendar file. Distance-only reminders use the estimated date. */
export function buildIcs(c: Calc) {
  const esc = (t: string) => String(t || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n'), d8 = (d: string) => d.replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev: [string, string, string, string][] = [];
  c.g.vehicles.filter(v => !v.sold).forEach(v => {
    const nm = v.nickname || v.model, odo = c.stats(v).odo;
    c.g.reminders.filter(r => r.vid === v.id && !r.done).forEach(r => {
      let d = r.dueDate, est = false;
      if (!d && r.dueOdo !== '' && r.dueOdo != null) { d = addDays(c.TODAY, Math.max(0, Math.round((+r.dueOdo - odo) / c.kmPerDay(v.id)))); est = true; }
      if (d) ev.push(['rem-' + r.id, d, `${r.title} · ${nm}`, (est ? 'Estimated from average distance. Due at ' + c.dist(r.dueOdo) + '. ' : '') + 'Garage reminder']);
    });
    (Object.entries(c.g.boards[v.id] || {}) as [Col, Task[]][]).forEach(([k, l]) => k !== 'done' && l.forEach(t => t.due && ev.push(['task-' + t.id, t.due, `${t.title} · ${nm}`, 'Build board task · ' + COLNAME[k]])));
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Garage//Reminders//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Garage',
    ...ev.flatMap(([id, d, t, desc]) => ['BEGIN:VEVENT', 'UID:' + id + '@garage', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + d8(d), 'DTEND;VALUE=DATE:' + d8(addDays(d, 1)), 'SUMMARY:' + esc(t), 'DESCRIPTION:' + esc(desc), 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(t), 'TRIGGER:-P1D', 'END:VALARM', 'END:VEVENT']),
    'END:VCALENDAR'].join('\r\n') + '\r\n';
}
