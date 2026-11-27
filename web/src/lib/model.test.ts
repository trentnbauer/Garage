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

test('moving a task to Done logs it and installs its parts; moving it back undoes the entry', async () => {
  const { moveCard } = await import('./model.ts');
  const g0 = seed('u1', T), coolant = g0.boards.v1.progress.find(c => c.title === 'Coolant flush')!;
  const g1 = moveCard(g0, 'v1', coolant.id, 'done', 0, 'u1', T);
  const card = g1.boards.v1.done[0];
  assert.equal(card.id, coolant.id);
  const rec = g1.records.find(r => r.id === card.autoRec)!;
  assert.deepEqual([rec.type, rec.date, rec.odo, rec.cost], ['Service', T, 128450, 36]);
  assert.ok(g1.parts.filter(p => p.cardId === coolant.id).every(p => p.status === 'Installed'));
  const g2 = moveCard(g1, 'v1', coolant.id, 'backlog', 0, 'u1', T);
  assert.equal(g2.records.length, g0.records.length);
  assert.equal(g2.boards.v1.backlog[0].logged, false);
  // Reordering inside a column keeps the count and lands where asked.
  const first = g0.boards.v1.backlog[0];
  const g3 = moveCard(g0, 'v1', first.id, 'backlog', 3, 'u1', T);
  assert.equal(g3.boards.v1.backlog[2].id, first.id);
});

test('templates follow the fuel system and the last matching entry', async () => {
  const { TEMPLATES, tplApplies, templateRem } = await import('./model.ts');
  const tp = (n: string) => TEMPLATES.find(t => t[0] === n)!;
  assert.equal(tplApplies(tp('Carburettor tune'), mx5), false);
  assert.equal(tplApplies(tp('Carburettor tune'), g.vehicles[2]), true); // 1972 240Z
  const oil = templateRem(tp('Oil change'), 'v1', 128450, 'km', g.records, T);
  assert.deepEqual([oil.lastDone, oil.dueDate, oil.dueOdo], ['2026-10-18', '2027-04-18', 136210]);
});

test('CSV quotes commas, quotes and newlines', async () => {
  const { csv } = await import('./model.ts');
  assert.equal(csv([['a', 'b,c', 'say "hi"', 'x\ny', null]]), 'a,"b,c","say ""hi""","x\ny",');
});

test('calendar feed has dated and estimated reminders, escaped', async () => {
  const { buildIcs } = await import('./model.ts');
  const ics = buildIcs(c);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /SUMMARY:Coolant flush · Mariner\r\nDESCRIPTION:Garage reminder/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261115/);
  assert.match(ics, /SUMMARY:Oil change · E30\r\nDESCRIPTION:Estimated from average distance\. Due at 189\\,000 km\. Garage reminder/);
});
