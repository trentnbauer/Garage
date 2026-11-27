// Checks the logic against the figures shown in the design screenshots (taken on 27 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Calc, econSeries, nextDue } from './model.ts';
import { seed } from './seed.ts';

const T = '2026-11-27';
const g = seed('u1', T), c = new Calc(g, T), mx5 = g.vehicles[0];

test('garage home totals', () => {
  const open = g.vehicles.reduce((a, v) => a + c.stats(v).open, 0);
  assert.equal(open, 11);
  assert.equal(g.parts.filter(p => p.status === 'Needed').length, 10);
  const over = g.vehicles.flatMap(v => c.activeRems(v)).filter(x => x.i.rank === 0).length;
  assert.equal(over, 1);
});

test('MX-5 overview figures', () => {
  const st = c.stats(mx5);
  assert.equal(st.odo, 128450);
  assert.equal(st.total, 2984.9);
  assert.equal(st.recs.filter(r => r.date.startsWith('2026')).reduce((a, r) => a + +(r.cost || 0), 0), 2912.9);
  const next = c.activeRems(mx5)[0];
  assert.equal(next.r.title, 'Coolant flush');
  assert.equal(next.i.short, '12 days overdue');
  assert.equal(st.doneN, 2);
  assert.equal(st.open + st.doneN, 8);
});

test('rego and insurance reminders follow the car', () => {
  const e30 = c.activeRems(g.vehicles[1])[0];
  assert.equal(e30.r.title, 'Rego renewal');
  assert.equal(e30.i.rank, 1);
  assert.equal(c.activeRems(mx5).find(x => x.r.auto === 'ins')!.i.short, 'in 108 days');
});

test('economy skips partial fills and rolls them into the next full tank', () => {
  const r = (odo: number, gallons: number, partial = false) => ({ id: String(odo), vid: 'v', type: 'Fuel' as const, date: '', odo, title: '', cost: 0, notes: '', gallons, partial });
  const es = econSeries([r(0, 40), r(200, 10, true), r(500, 30)]);
  assert.equal(es.rows[1].e, null);
  assert.equal(es.avg, 500 / 40);
});

test('yearly repeats use calendar years', () => {
  assert.equal(nextDue('2024-02-29', 365), '2025-03-01');
  assert.equal(nextDue('2026-06-01', 730), '2028-06-01');
});
