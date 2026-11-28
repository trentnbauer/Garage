import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPlan, LUBE_SAMPLE, lubePlan, planTotal, srcSetOf } from './lube.ts';
import { seed } from './seed.ts';

const T = '2026-11-27';
const opts = (g: ReturnType<typeof seed>, extra = {}) => ({ files: { '3f2a-invoice.pdf': 1200 }, srcSet: srcSetOf(g), vehicles: g.vehicles, targets: {}, unitsIn: 'km' as const, unitsOut: 'km' as const, me: 'u1', TODAY: T, ...extra });

test('LubeLogger sample: maps every collection, stores files, and a second run brings in nothing', () => {
  const g0 = seed('u1', T), p = lubePlan(LUBE_SAMPLE, opts(g0));
  assert.equal(p.vehicles.length, 1);
  const v = p.vehicles[0];
  assert.deepEqual([v.make, v.model, v.plate, v.fuelType, v.purchaseDate], ['Toyota', 'Hilux SR5', 'XYZ123', 'Diesel', '2019-04-12']);
  assert.equal(v.vin, 'MR0FZ29G901234567'); // kept: it looks like a VIN rather than a field name such as 'LicensePlate'
  const svc = p.records.find(r => r.title === 'Logbook service')!;
  assert.deepEqual([svc.where, svc.cost, svc.files![0].name], ['shop', 640, 'invoice-0920.pdf']);
  assert.match(svc.notes, /At: Coastal Toyota/);
  const oil = p.records.find(r => r.title.startsWith('Oil & filter'))!;
  assert.equal(oil.cost, null); // LubeLogger 0 = not recorded
  assert.deepEqual(p.parts.filter(x => x.recId === oil.id).map(x => [x.name, x.cost, x.status]), [['Oil filter', 18, 'Installed'], ['Fuel filter', 62, 'Installed']]);
  assert.ok(planTotal(p) > 5);
  const stored = { '3f2a-invoice.pdf': { id: 'f1', type: 'application/pdf', size: 1200, src: '/api/files/f1' } };
  const g1 = applyPlan(g0, p, stored, 'u1');
  const nv = g1.vehicles.at(-1)!;
  assert.equal(g1.records.find(r => r.title === 'Logbook service')!.files![0].src, '/api/files/f1');
  assert.ok(g1.boards[nv.id], 'new car gets a board');
  assert.ok(+nv.odometer >= 250300, 'odometer is the highest reading');
  assert.match(g1.log[0].text, /^imported \d+ items from LubeLogger$/);
  const again = lubePlan(LUBE_SAMPLE, opts(g1));
  assert.equal(planTotal(again), 0);
  assert.equal(again.carInfo[0].target, nv.id);
});

test('LubeLogger: miles convert to km, plates match existing cars, API reminders and missing files are flagged', () => {
  const g0 = seed('u1', T);
  const car = g0.vehicles[0];
  const dump = { vehicles: [{ Id: 5, Year: 1991, Make: 'Mazda', Model: 'MX-5', LicensePlate: (car.plate || 'X').toLowerCase() }], gasrecords: [{ Id: 1, VehicleId: 5, Date: '2025-01-02', Mileage: 100, Gallons: 10 }], reminderrecords: [{ Id: 2, VehicleId: 5, Description: 'Oil', Metric: 'Date', Date: '2026-01-01' }], servicerecords: [{ Id: 3, VehicleId: 5, Date: '2025-01-02', Files: [{ Name: 'a.pdf', Location: '/documents/a.pdf' }] }] };
  const p = lubePlan(dump, opts(g0, { unitsIn: 'mi', files: {}, apiReminders: true }));
  if (car.plate) assert.equal(p.carInfo[0].target, car.id);
  const fuel = p.records.find(r => r.type === 'Fuel')!;
  assert.deepEqual([fuel.odo, fuel.gallons], [161, 37.85]);
  assert.deepEqual([p.gaps.apirem, p.allFiles[0]._missing], [1, true]);
});
