import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCardForm } from './actions.ts';
import { aiContext, aiPrompt } from './ai.ts';
import { Calc } from './model.ts';
import { seed } from './seed.ts';

test('AI context: car, task and specs always; history and notes follow the admin switches', () => {
  const g = seed('u1', '2026-11-27');
  const f = { ...newCardForm('backlog'), title: 'Squeaky brakes', note: 'Front left squeals' };
  const on = aiContext(new Calc({ ...g, ai: { enabled: true, provider: 'anthropic', model: '', baseUrl: '', shareSpecs: true, shareHistory: true, shareNotes: false, shareManual: true, hasKey: true } }, '2026-11-27'), 'v1', f);
  assert.match(on, /^Car: \d{4} /);
  assert.match(on, /Task: Squeaky brakes\nType: .* · Status: Backlog/);
  assert.match(on, /Description: Front left squeals/);
  assert.match(on, /Recent service history:/);
  assert.match(on, /Torque specs · /);
  const off = aiContext(new Calc({ ...g, ai: { enabled: true, provider: 'anthropic', model: '', baseUrl: '', shareSpecs: false, shareHistory: false, shareNotes: false, shareManual: true, hasKey: true } }, '2026-11-27'), 'v1', f);
  assert.doesNotMatch(off, /Recent service history|Torque specs/);
  assert.equal(aiPrompt('ctx', [{ role: 'user', text: 'a' }, { role: 'ai', text: 'b' }], 'c'), '--- CAR AND TASK ---\nctx\n--- END ---\n\nOwner: a\n\nYou: b\n\nOwner: c\n\nYou:');
});
