import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fromApi, fromApiRecord, fromVolume } from './lube.js';
import { liteFile } from './testdb.js';

test('volume: reads cartracker.db, the units setting and the attachment folders', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lube-')), data = join(dir, 'data');
  for (const d of ['documents', 'images', 'config']) mkdirSync(join(data, d), { recursive: true });
  writeFileSync(join(data, 'cartracker.db'), liteFile({ vehicles: [{ _id: 1, Year: 2009, Make: 'Toyota', Model: 'Hilux' }], servicerecords: [{ _id: 4, VehicleId: 1, Description: 'Oil', Files: [{ Name: 'receipt', Location: '/documents/abc.pdf' }] }] }));
  writeFileSync(join(data, 'documents', 'abc.pdf'), 'PDF!'); writeFileSync(join(data, 'images', 'car.jpg'), 'JPG');
  writeFileSync(join(data, 'config', 'userConfig.json'), '{"UseMPG":true}');
  const s = fromVolume(dir); // the parent of data/ works too
  assert.deepEqual([s.dump.vehicles[0].Id, s.dump.servicerecords[0].Files[0].Location, s.dump.config.UseMPG], [1, '/documents/abc.pdf', true]);
  assert.deepEqual(Object.keys(s.files).sort(), ['abc.pdf', 'car.jpg']);
  assert.equal(String(await s.files['abc.pdf'].read()), 'PDF!');
  assert.throws(() => fromVolume(join(dir, 'nope')), /doesn’t exist/);
  assert.throws(() => fromVolume(join(data, 'images')), /No cartracker\.db/);
});

test('API: reshapes export models to database names, and only fetches attachments with a password', async () => {
  assert.deepEqual(fromApiRecord({ id: '3', vehicleId: '1', date: '4/12/2019', odometer: '120500', fuelConsumed: '54.2', isFillToFull: 'True', missedFuelUp: 'False', tags: 'a b', files: [{ name: 'r.pdf', location: '/documents/r.pdf' }] }),
    { Id: 3, VehicleId: 1, Date: '2019-04-12', Mileage: '120500', Gallons: '54.2', IsFillToFull: true, MissedFuelUp: false, Tags: ['a', 'b'], Files: [{ Name: 'r.pdf', Location: '/documents/r.pdf' }] });
  const seen = [];
  const fake = async (url, o) => {
    seen.push([new URL(url).pathname + new URL(url).search, o.headers.authorization || o.headers['x-api-key']]);
    const p = new URL(url).pathname, json = x => ({ ok: true, status: 200, json: async () => x, arrayBuffer: async () => new TextEncoder().encode('IMG').buffer });
    if (o.headers['x-api-key'] === 'bad') return { ok: false, status: 401 };
    if (p === '/api/vehicles') return json([{ id: 1, year: 2009, make: 'Toyota', imageLocation: '/images/car.jpg' }]);
    if (p === '/api/vehicle/gasrecords') return json([{ id: '9', date: '1/2/2024', fuelConsumed: '40' }]);
    if (p === '/api/vehicle/notes') return { ok: false, status: 404 }; // older LubeLogger
    if (p.startsWith('/images/')) return json(null);
    return json([]);
  };
  const k = await fromApi('http://lube:8080/', { key: 'k1' }, fake);
  assert.deepEqual([k.dump.gasrecords[0].Gallons, k.dump.gasrecords[0].VehicleId, k.dump.notes.length, Object.keys(k.files).length, k.noFiles], ['40', 1, 0, 0, true]);
  assert.equal(seen[0][1], 'k1');
  const b = await fromApi('http://lube:8080', { user: 'me', pass: 'pw' }, fake);
  assert.equal(String(await b.files['car.jpg'].read()), 'IMG');
  assert.match(seen.at(-1)[1], /^Basic /);
  await assert.rejects(fromApi('http://lube:8080', { key: 'bad' }, fake), /refused the sign-in/);
  await assert.rejects(fromApi('lube', { key: 'k' }, fake), /Enter LubeLogger’s address/);
});
