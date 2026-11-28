import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMailer, digestText, recipients } from './mailer.js';
import { seed } from '../web/src/lib/seed.ts';

const T = '2026-11-27';
function setup(smtp = {}) {
  const store = {}, sent = [];
  let g = seed('u1', T);
  const m = createMailer({
    read: (k, d) => (k in store ? store[k] : d), write: p => Object.assign(store, p), garage: () => g,
    smtp: () => ({ enabled: true, host: 'smtp.x', to: 'me@x.com', digest: 'daily', overdue: true, blockers: true, summary: true, signin: true, ...smtp }),
    users: () => [{ id: 'u1', name: 'You', role: 'admin' }], send: async (to, subject, text) => { sent.push({ to, subject, text }); },
  });
  return { m, sent, store, set: fn => { g = fn(g); } };
}
const at = (d, h) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00`);

test('digest: once a day from 7am, with what the Due list shows; nothing while email is off', async () => {
  const text = digestText(seed('u1', T), T);
  assert.match(text, /Overdue|Due soon/);
  const off = setup({ enabled: false }); await off.m.tick(at(T, 9)); assert.equal(off.sent.length, 0);
  const s = setup({ overdue: false, blockers: false });
  await s.m.tick(at(T, 6)); assert.equal(s.sent.length, 0); // too early
  await s.m.tick(at(T, 8)); await s.m.tick(at(T, 9));
  assert.equal(s.sent.length, 1);
  assert.deepEqual(s.sent[0].to, ['me@x.com']);
  assert.match(s.sent[0].subject, /what’s due today/);
  const w = setup({ digest: 'weekly', overdue: false, blockers: false });
  await w.m.tick(at('2026-11-27', 9)); assert.equal(w.sent.length, 0); // a Friday
  await w.m.tick(at('2026-11-30', 9)); assert.match(w.sent[0].subject, /this week/); // Monday
});

test('overdue and blocker alerts: existing ones are only recorded, new ones are sent once', async () => {
  const s = setup({ digest: 'off', summary: false });
  await s.m.tick(at(T, 9)); assert.equal(s.sent.length, 0);
  s.set(g => ({ ...g, reminders: [...g.reminders, { id: 'rX', vid: g.vehicles[0].id, title: 'Brake fluid', dueDate: '2026-11-01', dueOdo: '', repeatDays: '', repeatDist: '', isCheck: false, checklist: [], done: false }] }));
  s.set(g => { const vid = g.vehicles[0].id; return { ...g, boards: { ...g.boards, [vid]: { ...g.boards[vid], backlog: [...g.boards[vid].backlog, { id: 'tX', title: 'Brake line leak', type: 'Repair', priority: 'High', est: 0, note: '', drive: 'Moving in garage' }] } } }; });
  await s.m.tick(at(T, 9)); await s.m.tick(at(T, 10));
  assert.deepEqual(s.sent.map(x => x.subject), ['Overdue: Brake fluid', 'New blocker: Brake line leak — Moving in garage until fixed']);
});

test('monthly report on the 1st, and sign-in alerts for a new browser only', async () => {
  const s = setup({ digest: 'off', overdue: false, blockers: false });
  await s.m.tick(at('2026-12-01', 8)); await s.m.tick(at('2026-12-01', 9));
  assert.equal(s.sent.length, 1); assert.match(s.sent[0].subject, /November 2026 report/);
  const u = { id: 'u1', name: 'You' };
  assert.equal(await s.m.signedIn(u, 'Firefox'), false); // first browser: recorded
  assert.equal(await s.m.signedIn(u, 'Firefox'), false);
  assert.equal(await s.m.signedIn(u, 'Safari on iPhone'), true);
  assert.match(s.sent.at(-1).text, /Safari on iPhone/);
  assert.deepEqual(recipients({ to: '' }, [{ role: 'admin', email: 'a@x.com' }, { role: 'member', email: 'm@x.com' }]), ['a@x.com']);
});
