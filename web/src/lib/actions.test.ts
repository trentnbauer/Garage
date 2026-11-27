import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addVehicle, newCardForm, remForm, rollReminder, saveCard, saveRecord, setOdometer, setPartStatus, type RecForm } from './actions.ts';
import { seed } from './seed.ts';
import type { Garage, Reminder } from './model.ts';

const T = '2026-11-27';
const g0 = seed('u1', T);
const ok = (r: ReturnType<typeof saveRecord>): Garage => { if ('odoErr' in r) throw new Error(r.odoErr); return r.g; };

test('logging a service: cost from parts + labour, odometer moves up, reminder rolls forward', () => {
  const coolant = g0.reminders.find(r => r.vid === 'v1' && r.title === 'Coolant flush')!;
  const part = g0.parts.find(p => p.name === 'Coolant concentrate, 4 L')!; // 2 × $18
  const f: RecForm = { ...remForm(coolant, 128450, T), odo: '128500', usedParts: [part.id], labour: '20' };
  const g = ok(saveRecord(g0, 'v1', f, 'u1', T));
  const rec = g.records[0];
  assert.deepEqual([rec.title, rec.cost, rec.labour, rec.odo], ['Coolant flush', 56, 20, 128500]);
  assert.equal(g.vehicles[0].odometer, 128500);
  const r = g.reminders.find(x => x.id === coolant.id)!;
  assert.deepEqual([r.lastDone, r.dueDate], [T, '2028-11-27']);
  assert.equal(g.parts.find(p => p.id === part.id)!.status, 'Installed');
  assert.equal(g.log[0].text, 'completed "Coolant flush"');
});

test('a typed cost wins over the parts total', () => {
  const g = ok(saveRecord(g0, 'v1', { type: 'Service', date: T, title: 'Wash', odo: '128450', cost: '15', notes: '', costTouched: true, labour: '50' }, 'u1', T));
  assert.equal(g.records[0].cost, 15);
});

test('fixed-schedule reminders keep their dates; one-offs are completed', () => {
  const r: Reminder = { id: 'r', vid: 'v1', title: 'Rotate tyres', dueDate: '2026-10-01', dueOdo: 120000, repeatDays: 30, repeatDist: 5000, repeatFrom: 'fixed', done: false };
  const x = rollReminder(r, T, 128450);
  assert.deepEqual([x.dueDate, x.dueOdo], ['2026-11-30', 130000]);
  assert.equal(rollReminder({ ...r, repeatDays: '', repeatDist: '' }, T, 1).done, true);
});

test('renewing rego moves the expiry by the rego term', () => {
  const rego = g0.reminders.find(r => r.vid === 'v2' && r.auto === 'rego')!; // 6-month term, due 2026-12-08
  const g = ok(saveRecord(g0, 'v2', remForm(rego, 186200, T), 'u1', T));
  assert.equal(g.vehicles[1].regoExpiry, '2027-06-08');
  assert.equal(g.reminders.find(r => r.vid === 'v2' && r.auto === 'rego')!.dueDate, '2027-06-08');
});

test('fill-ups need an odometer at or above the last reading', () => {
  const f: RecForm = { type: 'Fuel', fuelMode: true, date: T, title: '91 octane', odo: '128000', cost: '50', gallons: '24', notes: '' };
  assert.ok('odoErr' in saveRecord(g0, 'v1', f, 'u1', T));
  assert.ok('odoErr' in saveRecord(g0, 'v1', { ...f, odo: '' }, 'u1', T));
  const g = ok(saveRecord(g0, 'v1', { ...f, odo: '128700', fuelBy: 'ppu', ppu: '2' }, 'u1', T));
  assert.deepEqual([g.records[0].gallons, g.records[0].cost], [25, 50]);
});

test('linking a service to a task moves the task to Done and installs its parts', () => {
  const sender = g0.boards.v1.progress.find(c => c.title === 'Fix fuel gauge sender')!;
  const g = ok(saveRecord(g0, 'v1', { type: 'Repair', date: T, title: 'Fuel sender', odo: '128450', cost: '', notes: '', linkTask: sender.id }, 'u1', T));
  assert.equal(g.boards.v1.done[0].id, sender.id);
  assert.equal(g.boards.v1.done[0].autoRec, g.records[0].id);
  assert.ok(g.parts.filter(p => p.cardId === sender.id).every(p => p.status === 'Installed'));
});

test('a failed check adds a high-priority fix to the Backlog', () => {
  const pre = g0.reminders.find(r => r.title === 'Pre-track inspection')!;
  const f = { ...remForm(pre, 128450, T), result: 'fail' as const, title: 'Fix: Check brake pad thickness', checks: [{ text: 'Check brake pad thickness', state: 'fail' as const }] };
  const g = ok(saveRecord(g0, 'v1', f, 'u1', T));
  assert.equal(g.boards.v1.backlog[0].title, 'Fix: Check brake pad thickness');
  assert.equal(g.boards.v1.backlog[0].priority, 'High');
  assert.equal(g.records.length, g0.records.length);
});

test('new tasks: estimate is parts + labour; saving to Done logs it', () => {
  const f = { ...newCardForm('backlog'), title: 'Seat covers', labour: '40' };
  const g1 = { ...g0, parts: [...g0.parts, { id: 'p1', vid: 'v1', cardId: f.pid!, name: 'Covers', partNo: '', vendor: '', qty: 2, cost: 30 as const, status: 'Needed' as const, url: '' }] };
  const g = saveCard(g1, 'v1', f, 'u1', T);
  assert.deepEqual([g.boards.v1.backlog[0].title, g.boards.v1.backlog[0].est], ['Seat covers', 100]);
  const g2 = saveCard(g1, 'v1', { ...f, col: 'done' }, 'u1', T);
  assert.equal(g2.records[0].title, 'Seat covers');
});

test('ordering a part for a Backlog task moves it to Waiting on parts', () => {
  const roll = g0.parts.find(p => p.name === 'Sport roll bar')!;
  const { g, moved } = setPartStatus(g0, roll.id, 'Ordered', 'u1');
  assert.equal(moved, true);
  assert.equal(g.boards.v1.parts[0].title, 'Install roll bar');
});

test('odometer only goes up; vehicles get a board and rego reminder', () => {
  assert.equal(setOdometer(g0, 'v1', 128450, '', '120000', 'u1', T), g0);
  assert.equal(setOdometer(g0, 'v1', 128450, '50', '', 'u1', T).vehicles[0].odometer, 128500);
  const { g, id } = addVehicle(g0, { year: '1999', make: 'Honda', model: 'Civic', nickname: '', usage: 'daily', plate: 'ek9 ', regoExpiry: '2027-02-01', odometer: '150000', purchasePrice: '' }, 'u1');
  assert.equal(g.vehicles.find(v => v.id === id)!.plate, 'EK9');
  assert.ok(g.boards[id] && g.reminders.some(r => r.vid === id && r.auto === 'rego'));
});
