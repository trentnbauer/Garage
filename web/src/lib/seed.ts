// Sample garage: three cars with history, reminders, boards and parts. Used by the demo build and
// offered to a brand-new install. Dates in the "relative" items are worked out from today.
import { addDays, type Board, type Col, type Garage, type Part, type Rec, type Reminder, SETTINGS0, syncRego, today, uid, type Vehicle } from './model.ts';

const task = (title: string, type: string, est: number, priority: 'High' | 'Medium' | 'Low', note = '') => ({ id: uid(), title, type, est, priority, note });

// [name, partNo, vendor, qty, unit cost, status] per task title
const PART_SEED: Record<string, [string, string, string, number, number, Part['status']][]> = {
  'install roll bar': [['Sport roll bar', 'HD-SPORT', 'Hard Dog', 1, 599, 'Needed'], ['Roll bar padding', '', 'Hard Dog', 1, 45, 'Needed']],
  'refresh hardtop seals': [['Hardtop weatherstrip set', 'NA01-50-760', 'Mazda', 1, 165, 'Needed']],
  'retrofit led headlights': [['LED headlight pair', 'H4-LED', 'JW Speaker', 1, 180, 'Needed'], ['H4 relay harness', '', 'Daniel Stern', 1, 40, 'Needed']],
  'nb brake upgrade': [['NB front brake kit', 'GR-BRK-NB', 'Goodwin Racing', 1, 345, 'Ordered'], ['Front brake pads', 'D635', 'Hawk', 1, 89, 'In stock']],
  'fix fuel gauge sender': [['Fuel level sender', 'B61P-60-960', 'Mazda', 1, 75, 'In stock']],
  'coolant flush': [['Coolant concentrate, 4 L', '', 'Zerex', 2, 18, 'In stock']],
  'rust repair — rear arches': [['Rear arch repair panels (pair)', 'E30-RA-2', 'Klokkerholm', 1, 220, 'Needed'], ['Seam sealer', '', '3M', 1, 25, 'Needed']],
  'rebuild front suspension': [['HD control arms', '316 060 0004', 'Meyle', 2, 105, 'Needed'], ['Strut mounts', '31331139469', 'Lemförder', 2, 38, 'Needed']],
  'rewire dash cluster': [['Cluster connector pins', '', 'BMW', 1, 15, 'Ordered']],
  'strip & paint engine bay': [['Engine enamel', '', 'VHT', 2, 30, 'Needed']],
  'floor pan replacement': [['Floor pans (pair)', 'Z-FP-7073', 'Zcardepot', 1, 260, 'Ordered']],
  'front sway bar': [['Front sway bar, 1"', 'RB-FSB-NA', 'Racing Beat', 1, 249, 'Installed'], ['Sway bar end links', 'K90311', 'Moog', 2, 20, 'Installed']],
  'bilstein shocks + springs': [['Bilstein B6 shocks (set of 4)', '24-NA-B6', 'Bilstein', 1, 760, 'Installed'], ['Eibach Pro-Kit springs', '3805.140', 'Eibach', 1, 290, 'Installed'], ['Top mount bushings', 'NA01-34-380', 'Mazda', 4, 17.5, 'Installed']],
  'cooling overhaul': [['Aluminium radiator', 'KOY-E30', 'Koyorad', 1, 320, 'Installed'], ['Coolant hose kit', '11-53-1-722-847', 'Rein', 1, 110, 'Installed'], ['Thermostat 80°C', '11-53-1-722-531', 'Wahler', 1, 45, 'Installed'], ['Coolant, 1.5 L', '', 'BMW', 2, 32.5, 'Installed']],
  'carb rebuild': [['SU HS4 rebuild kit', 'BURLEN-HS4', 'Burlen', 2, 185, 'Installed'], ['Jet needles', 'SM', 'Burlen', 2, 45, 'Installed'], ['Throttle shaft bushings', '', 'Joe Curto', 2, 90, 'Installed'], ['Float bowl gaskets', '', 'Burlen', 1, 40, 'Installed']],
};

// Parts used by past service entries, matched on the entry title.
const REC_PARTS: [RegExp, [string, string, string, number, number][]][] = [
  [/oil & filter/i, [['Engine oil 5W-30, 4 L', '', 'Penrite', 1, 38], ['Oil filter', '51358', 'Wix', 1, 8.5]]],
  [/clutch master/i, [['Clutch master cylinder', 'MC-NA-58', 'Exedy', 1, 118], ['Brake fluid DOT 4, 500 ml', '', 'Castrol', 1, 20]]],
  [/timing belt/i, [['Timing belt', 'T224', 'Gates', 1, 65], ['Water pump', 'WPZ-016', 'Aisin', 1, 95], ['Idler & tensioner kit', 'T41129', 'Gates', 1, 78], ['Cam seals', '8AG2-10-602', 'Mazda', 2, 12]]],
  [/brake fluid flush/i, [['Brake fluid DOT 4, 1 L', '', 'Castrol', 1, 24]]],
  [/rear main seal/i, [['Rear main seal', 'B6BF-11-399', 'NOK', 1, 28], ['Oil pan gasket', 'OS30647', 'Fel-Pro', 1, 22], ['Engine oil 10W-30, 4 L', '', 'Penrite', 1, 36]]],
  [/thermostat & gasket/i, [['Thermostat 82°C', 'B6BF-15-171', 'Mazda', 1, 48], ['Thermostat gasket', 'B6BF-15-172', 'Mazda', 1, 9], ['Coolant concentrate, 1 L', '', 'Zerex', 1, 15]]],
  [/valve adjustment/i, [['Valve cover gasket set', '11-12-1-709-286', 'Elring', 1, 35]]],
  [/short shift/i, [['Short shift kit', 'E30-SSK', 'UUC Motorwerks', 1, 189]]],
  [/oil, plugs, points/i, [['Engine oil 20W-50, 4 L', '', 'Castrol', 1, 38], ['Spark plugs', 'BP6ES', 'NGK', 6, 4.5], ['Points & condenser', '', 'Lucas', 1, 20]]],
];

const INSPECTION = ['Lights & indicators', 'Brakes & handbrake', 'Tyres & wheels', 'Steering & suspension', 'Seatbelts', 'Exhaust & emissions', 'Windscreen, wipers & washers', 'Horn', 'Body & chassis corrosion', 'VIN & plates legible'];

// [vid, title, due in days, due in km, repeat days, repeat km, isCheck, checklist]
const EXTRA_REMS: [string, string, number, number | '', number, number | '', boolean, string[]][] = [
  ['v1', 'Pre-track inspection', 12, '', 30, '', true, ['Torque wheel nuts', 'Check brake pad thickness', 'Check fluid levels', 'Look for leaks under the car', 'Helmet and harness ready']],
  ['v1', 'Spark plugs', 140, 48000, 730, 48000, false, ['Remove and inspect plugs', 'Check and set gaps', 'Inspect leads for cracks', 'Anti-seize on threads']],
  ['v1', 'Cooling system check', 9, '', 30, '', true, ['Coolant level at cold', 'Hoses firm, no cracks', 'Radiator cap seal', 'Fan kicks in at temperature']],
  ['v2', 'Timing belt', 320, 60000, 1460, 60000, false, ['Timing belt', 'Tensioner and roller', 'Water pump', 'Cam and crank seals', 'Set timing marks']],
  ['v2', 'Diff oil change', 45, '', 730, '', false, ['Drain diff', 'Inspect drain plug magnet', 'Refill 75W-90', 'Check for leaks after a drive']],
  ['v3', 'Carburettor tune', 60, '', 182, '', false, ['Balance SUs', 'Set idle mixture', 'Top up dashpot oil', 'Check linkage free play']],
  ['v3', 'Storage check', 3, '', 30, '', true, ['Battery tender connected', 'Tyre pressures', 'Check for rodents', 'Run engine to temperature']],
];

const RECORD_NOTES: Record<string, string> = {
  'fix fuel gauge sender': 'Sender reads 40 Ω at full — should be about 3 Ω. New one is on the shelf, need to drop the tank.',
  'nb brake upgrade': 'Goodwin says the kit ships next week. Pads are already here.',
  'install roll bar': 'Measured with hardtop on — Hard Dog Sport clears it.',
  'rewire dash cluster': 'Pins 7 and 12 corroded on the white connector. Waiting on new pins.',
  'front sway bar': 'Fitted with the car on ramps so the suspension was loaded. Big improvement in turn-in.',
  'bilstein shocks + springs': 'Ride height set to 12.5" front / 12.75" rear at the guard. Needs an alignment.',
  'cooling overhaul': 'Old radiator was about 30% blocked. Temps now sit mid-gauge in traffic.',
  'carb rebuild': 'Balanced with a Unisyn after the rebuild. Idle 850 rpm.',
};
const LINKED: Record<string, RegExp> = { 'front sway bar': /sway bar/i, 'bilstein shocks + springs': /bilstein/i, 'cooling overhaul': /cooling overhaul/i, 'carb rebuild': /carburet/i };

export function seed(by: string | null = 'u1', TODAY = today()): Garage {
  const rec = (vid: string, date: string, type: Rec['type'], odo: number, title: string, cost: number, extra: Partial<Rec> = {}): Rec =>
    ({ id: uid(), vid, date, type, odo, title, cost, notes: '', by, ...extra });
  const vehicles: Vehicle[] = [
    { id: 'v1', year: 1991, make: 'Mazda', model: 'MX-5 Miata', nickname: 'Mariner', odometer: 128450, purchasePrice: 4800, plate: 'MX5-091', colour: 'Mariner Blue', engine: '1.6L B6 I4', transmission: '5-speed manual', vin: 'JM1NA3510M0212345', usage: 'daily', regoExpiry: '2027-06-01', regoTerm: 12, insuranceRenewal: '2027-03-15', fuelType: 'Petrol — 91 / Regular',
      specs: { torque: [{ item: 'Wheel nuts', value: '65–80 ft-lb' }], fluids: [{ system: 'Coolant', type: '50/50', capacity: '6.0 L' }], tyres: [], parts: [{ item: 'Oil filter', partNo: 'Wix 51358' }] } },
    { id: 'v2', year: 1987, make: 'BMW', model: '325i', nickname: 'E30', odometer: 186200, purchasePrice: 7500, plate: 'E30-221', colour: 'Alpine White', engine: '2.5L M20 I6', transmission: '5-speed manual', usage: 'track', regoExpiry: '2026-12-08', regoTerm: 6, fuelType: 'Petrol — 91 / Regular' },
    { id: 'v3', year: 1972, make: 'Datsun', model: '240Z', nickname: 'Zed', odometer: 64310, purchasePrice: 14500, usage: 'weekend', insuranceRenewal: '2027-03-01' },
  ];
  const checks = (failed: string[] = []) => INSPECTION.map(text => ({ text, done: !failed.includes(text) }));
  const records: Rec[] = [
    rec('v1', '2026-11-02', 'Fuel', 128250, '91 octane', 48.8, { gallons: 23.8 }),
    rec('v1', '2026-10-18', 'Upgrade', 128210, 'Front sway bar', 289),
    rec('v1', '2026-10-18', 'Service', 128210, 'Oil & filter — 5W-30, Wix 51358', 46.5),
    rec('v1', '2026-10-05', 'Fuel', 127970, '91 octane', 50.0, { gallons: 24.4 }),
    rec('v1', '2026-09-14', 'Repair', 127820, 'Replace clutch master cylinder', 138),
    rec('v1', '2026-09-01', 'Fuel', 127700, '91 octane', 47.6, { gallons: 23.2 }),
    rec('v1', '2026-08-20', 'Upgrade', 127540, 'Bilstein B6 shocks + springs', 1120),
    rec('v1', '2026-07-11', 'Service', 127200, 'Timing belt, water pump, cam seals', 412),
    rec('v1', '2026-06-01', 'Registration', 126900, 'Annual registration', 96),
    rec('v1', '2026-06-01', 'Inspection', 126900, 'Annual inspection', 55, { notes: 'Passed first time. Advisory: slight play in front-left lower ball joint.', checks: checks() }),
    rec('v2', '2026-04-28', 'Inspection', 184700, 'Annual inspection', 55, { notes: 'Pass after re-test — rear number plate lamp replaced on the day.', checks: checks(['Lights & indicators']) }),
    rec('v1', '2026-05-09', 'Service', 126600, 'Brake fluid flush', 38),
    rec('v1', '2026-03-15', 'Insurance', 125800, 'Classic policy — 12 months', 312),
    rec('v1', '2026-02-02', 'Repair', 125500, 'Rear main seal', 260),
    rec('v1', '2025-12-06', 'Repair', 125100, 'Thermostat & gasket', 72),
    rec('v2', '2026-10-30', 'Service', 186200, 'Valve adjustment + cover gasket', 35),
    rec('v2', '2026-09-22', 'Repair', 185900, 'Cooling overhaul — radiator, hoses, thermostat', 540),
    rec('v2', '2026-09-20', 'Fuel', 185900, '91 octane', 64.6, { gallons: 31.5 }),
    rec('v2', '2026-08-28', 'Fuel', 185600, '91 octane', 65.6, { gallons: 32.0 }),
    rec('v2', '2026-08-10', 'Upgrade', 185400, 'Short shift kit', 189),
    rec('v2', '2026-05-01', 'Registration', 184800, 'Annual registration', 112),
    rec('v3', '2026-06-14', 'Upgrade', 64200, 'Rebuilt SU carburetors', 680),
    rec('v3', '2026-04-03', 'Service', 64100, 'Oil, plugs, points', 85),
    rec('v3', '2026-03-01', 'Insurance', 64050, 'Agreed-value policy', 420),
  ];
  records.forEach(r => { if (r.type !== 'Fuel') r.where = /timing belt|cooling|rear main|registration|insurance|inspection/i.test(r.title) ? 'shop' : 'diy'; });

  const boards: Record<string, Board> = {
    v1: {
      backlog: [task('Install roll bar', 'Upgrade', 650, 'High', 'Needed before next track day.'), task('Refresh hardtop seals', 'Bodywork', 180, 'Low'), task('Retrofit LED headlights', 'Electrical', 220, 'Low')],
      parts: [task('NB brake upgrade', 'Upgrade', 420, 'High', 'Waiting on Goodwin order.')],
      progress: [task('Fix fuel gauge sender', 'Repair', 90, 'Medium', 'Reads half when full.'), task('Coolant flush', 'Maintenance', 40, 'Medium')],
      done: [{ ...task('Front sway bar', 'Upgrade', 289, 'Medium'), logged: true, doneAt: '2026-11-21' }, { ...task('Bilstein shocks + springs', 'Upgrade', 1120, 'High'), logged: true, doneAt: '2026-08-20' }],
    },
    v2: { backlog: [task('Rust repair — rear arches', 'Bodywork', 900, 'High'), task('Rebuild front suspension', 'Repair', 750, 'Medium')], parts: [], progress: [task('Rewire dash cluster', 'Electrical', 60, 'Medium')], done: [{ ...task('Cooling overhaul', 'Repair', 540, 'High'), logged: true }] },
    v3: { backlog: [task('Strip & paint engine bay', 'Bodywork', 1200, 'Medium')], parts: [task('Floor pan replacement', 'Bodywork', 650, 'High')], progress: [], done: [{ ...task('Carb rebuild', 'Upgrade', 680, 'High'), logged: true }] },
  };

  const parts: Part[] = [];
  Object.entries(boards).forEach(([vid, b]) => (Object.keys(b) as Col[]).forEach(k => b[k].forEach(cd => {
    (PART_SEED[cd.title.toLowerCase()] || []).forEach(([name, partNo, vendor, qty, cost, status]) =>
      parts.push({ id: uid(), vid, cardId: cd.id, name, partNo, vendor, qty, cost, status: k === 'done' && status === 'In stock' ? 'Installed' : status, url: '' }));
  })));

  // Activity history, record links, and estimates (= parts + labour) for each task.
  const at = (d: string, h = 9) => new Date(d + 'T' + String(h).padStart(2, '0') + ':00:00').toISOString();
  const E = (d: string, text: string, h = 9, kind: 'event' | 'note' = 'event') => ({ id: uid(), at: at(d, h), kind, text, by });
  Object.entries(boards).forEach(([vid, b]) => (Object.keys(b) as Col[]).forEach(col => {
    b[col] = b[col].map((cd, i) => {
      const key = cd.title.toLowerCase(), re = LINKED[key], r = re && records.find(x => x.vid === vid && re.test(x.title));
      const made = r ? addDays(r.date, -28) : addDays(TODAY, -(9 + i * 8 + (col === 'backlog' ? 18 : 0)));
      const ps = parts.filter(p => p.cardId === cd.id), act = [E(made, 'Task created in Backlog')];
      ps.forEach((p, j) => act.push(E(addDays(made, 1 + j), `Added part “${p.name}” to the parts list`, 10)));
      if (col === 'parts') { const o = ps.find(p => p.status === 'Ordered'); act.push(E(addDays(made, 3), `Moved from Backlog to Waiting on parts${o ? ` — ${o.name} ordered` : ''}`, 11)); }
      if (col === 'progress') act.push(E(addDays(made, 4), 'Moved from Backlog to In progress', 11));
      ps.filter(p => p.status === 'In stock').forEach(p => act.push(E(addDays(made, 6), `Marked “${p.name}” as in stock`, 12)));
      if (RECORD_NOTES[key]) act.push(E(r ? addDays(r.date, -1) : addDays(made, 7), RECORD_NOTES[key], 18, 'note'));
      if (col === 'done') { const d = r ? r.date : cd.doneAt || addDays(made, 14); act.push(E(d, 'Moved from In progress to Done', 17)); ps.forEach(p => act.push(E(d, `Marked “${p.name}” as installed`, 17))); }
      if (r) { r.cardId = cd.id; r.notes = 'From build board' + (RECORD_NOTES[key] ? ' · ' + RECORD_NOTES[key] : ''); ps.forEach(p => { p.recId = r.id; p.status = 'Installed'; }); }
      const partsTotal = Math.round(ps.reduce((a, p) => a + +p.cost * p.qty, 0) * 100) / 100;
      return { ...cd, drive: 'N/A' as const, labour: Math.max(0, Math.round((cd.est - partsTotal) * 100) / 100), est: ps.length ? partsTotal : cd.est,
        createdBy: by, createdAt: at(made), activity: act, ...(r ? { logged: true, autoRec: r.id, doneAt: r.date } : {}) };
    });
  }));
  records.forEach(r => {
    if (r.type === 'Fuel' || parts.some(p => p.recId === r.id)) return;
    const m = REC_PARTS.find(x => x[0].test(r.title));
    m?.[1].forEach(([name, partNo, vendor, qty, cost]) => parts.push({ id: uid(), vid: r.vid, cardId: null, recId: r.id, name, partNo, vendor, qty, cost, status: 'Installed', url: '', at: r.date + 'T12:00:00.000Z' }));
  });

  const rem = (vid: string, title: string, dueDate: string, dueOdo: number | '', repeatDays: number, repeatDist: number | '', checklist: string[], extra: Partial<Reminder> = {}): Reminder =>
    ({ id: uid(), vid, title, dueDate, dueOdo, repeatDays, repeatDist, isCheck: false, checklist, notes: '', repeatFrom: 'done', done: false, ...extra });
  let reminders: Reminder[] = [
    rem('v1', 'Oil change', '2027-04-18', 131210, 182, 5000, ['Engine oil', 'Oil filter']),
    rem('v1', 'Coolant flush', '2026-11-15', '', 730, '', ['Drain coolant', 'Flush system', 'Refill 50/50 mix', 'Bleed air from system']),
    rem('v1', 'Brake fluid', '2026-12-10', '', 730, '', ['Check brake pads', 'Check rotors', 'Flush fluid']),
    rem('v2', 'Oil change', '', 189000, 182, 5000, ['Engine oil', 'Oil filter']),
    rem('v1', 'Annual inspection', '2027-06-01', '', 365, '', [...INSPECTION], { isCheck: true, lastDone: '2026-06-01' }),
    rem('v2', 'Annual inspection', '2027-04-28', '', 365, '', [...INSPECTION], { isCheck: true, lastDone: '2026-04-28' }),
    ...EXTRA_REMS.map(([vid, title, inDays, inDist, rd, rdist, isCheck, checklist]) => {
      const odo = +(vehicles.find(v => v.id === vid)!.odometer || 0);
      return rem(vid, title, addDays(TODAY, inDays), inDist ? odo + inDist : '', rd, rdist, checklist, { isCheck });
    }),
  ];
  reminders = syncRego(vehicles, reminders);

  return {
    vehicles, records, reminders, parts, boards,
    notes: { v1: 'Wheel lug torque: 65–80 ft-lb\nCoolant: 50/50, 6.0 L\nIdle drops with A/C on — check IAC valve', v2: '', v3: '' },
    shelf: [],
    users: [{ id: 'u1', name: 'You', color: '#5b84ff', role: 'admin', hasPin: false }],
    settings: { ...SETTINGS0, accent: '#5b84ff' },
    auth: { signins: false },
    log: [],
  };
}

