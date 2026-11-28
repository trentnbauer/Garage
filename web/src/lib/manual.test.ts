import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestPages, refsLine } from './manual.ts';

test('manual search: pages ranked by matching terms, common words ignored, citations grouped', () => {
  const pages = ['Introduction and safety. Read this first.', 'Cylinder head bolt torque: 76-81 Nm in sequence. Head gasket.', 'Wheel nut torque 88-118 Nm. Tyre pressure 180 kPa.', 'Wiring diagram for the headlights.'];
  const ex = bestPages([{ name: 'Haynes MX-5.pdf', pages }], 'What is the wheel nut torque for this car?');
  assert.deepEqual(ex.map(x => x.page), [3]); // page 2 matches one word only, below the bar
  assert.equal(ex[0].name, 'Haynes MX-5');
  assert.deepEqual(bestPages([{ name: 'x', pages }], 'the and with'), []);
  assert.equal(refsLine([...ex, { ...ex[0], page: 1 }]), 'From the manual: Haynes MX-5 p.1, 3');
});

test('Fill with AI: adds new rows, fills blanks only, keeps what was typed, and lists pages', async () => {
  const { mergeSpecs } = await import('./manual.ts');
  const { SPEC_DEF } = await import('./model.ts');
  const before = { torque: [{ item: 'Wheel nuts', value: '' }, { item: 'Sump plug', value: '30 Nm (mine)' }] };
  const reply = 'Here you go:\n{"torque":[{"item":"wheel nuts","value":"88-118 Nm","page":"12"},{"item":"Sump plug","value":"29-41 Nm","page":"40"},{"item":"Head bolts","value":"76-81 Nm","page":"p.55"}],"tune":[{"item":"Spark plug gap","value":"1.0-1.1 mm","page":"60"}]}';
  const r = mergeSpecs(before, reply, SPEC_DEF);
  assert.deepEqual(r.specs.torque, [{ item: 'Wheel nuts', value: '88-118 Nm' }, { item: 'Sump plug', value: '30 Nm (mine)' }, { item: 'Head bolts', value: '76-81 Nm' }]);
  assert.deepEqual([r.added, r.filled, r.pages], [2, 1, [12, 40, 55, 60]]);
  assert.ok(r.specs._shown.includes('tune')); // optional groups appear once filled
  assert.deepEqual(before.torque[0].value, ''); // the original isn't changed
  assert.throws(() => mergeSpecs({}, 'no json here', SPEC_DEF), /format Garage could read/);
});
