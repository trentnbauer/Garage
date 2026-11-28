import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Calc } from './model.ts';
import { PW0, packHTML, packSources } from './pack.ts';
import { seed } from './seed.ts';

const T = '2026-11-27';
test('paperwork pack: sections follow the switches, private details stay out, files are inlined', () => {
  const g0 = seed('u1', T), v = g0.vehicles[0];
  const rec = g0.records.find(r => r.vid === v.id && r.type === 'Service')!;
  const file = '/api/files/' + 'a'.repeat(24), photo = '/api/files/' + 'b'.repeat(24);
  const g = { ...g0, vehicles: g0.vehicles.map(x => (x.id === v.id ? { ...x, insurer: 'Shannons', purchasePrice: 9000, photo } : x)), records: g0.records.map(r => (r.id === rec.id ? { ...r, title: 'Oil <b>change</b>', files: [{ id: 'f1', name: 'invoice.pdf', type: 'application/pdf', size: 2048, src: file, at: T }] } : r)) };
  const calc = new Calc(g, T), car = g.vehicles[0];
  const html = packHTML(calc, car, PW0, { seller: 'Sam', note: 'Look after it' }, { [file]: 'data:application/pdf;base64,QQ==' });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /Vehicle handover pack/);
  assert.match(html, /Prepared<\/dt><dd>[^<]+ by Sam/);
  assert.match(html, /Look after it/);
  assert.match(html, /Oil &lt;b&gt;change&lt;\/b&gt;/); // escaped
  assert.match(html, /href="data:application\/pdf;base64,QQ=="/); // receipt inlined
  assert.ok(html.includes(`src="${photo}"`), 'a file not fetched keeps its address');
  assert.doesNotMatch(html, /Shannons/); // purchase & insurance left out by default
  assert.match(packHTML(calc, car, { ...PW0, private: true }, { seller: '', note: '' }, {}), /Shannons/);
  const noCost = packHTML(calc, car, { ...PW0, costs: false, history: true }, { seller: '', note: '' }, {});
  assert.doesNotMatch(noCost, /<th class="num">Cost<\/th>/);
  assert.doesNotMatch(packHTML(calc, car, { ...PW0, issues: false }, { seller: '', note: '' }, {}), /Known open issues<\/h2>/);
  assert.deepEqual(packSources(calc, car, PW0).sort(), [file, photo].sort());
});
