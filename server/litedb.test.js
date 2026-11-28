import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLiteDb } from './litedb.js';
import { block, enc, P, page } from './testdb.js';

test('reads every document, follows blocks across pages, and applies committed log pages', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ldb-')), file = join(dir, 'cartracker.db');
  const header = Buffer.alloc(P); header.write('** This is a LiteDB file **', 32, 'latin1'); header[59] = 8; enc({ vehicles: 1, gasrecords: 4 }).copy(header, 192);
  const car = enc({ _id: 7, Year: 2009, Make: 'Toyota', Model: 'Hilux', IsDiesel: true, PurchaseDate: new Date('2019-04-12T00:00:00Z'), Tags: ['tow car'], ExtraFields: [{ Name: 'Tyre size', Value: '265/70R16' }] });
  const half = Math.floor(car.length / 2);
  const fuel = enc({ _id: 1, VehicleId: 7, Cost: { dec: 6512 }, Gallons: 54.2, IsFillToFull: true });
  const data = Buffer.concat([header, page(1, 2, 0, []), page(2, 4, 1, [block(false, [3, 0], car.subarray(0, half))]), page(3, 4, 1, [block(true, null, car.subarray(half))]), page(4, 2, 0, []), page(5, 4, 4, [block(false, null, fuel)])]);
  writeFileSync(file, data);
  let d = readLiteDb(file);
  assert.equal(d.vehicles.length, 1);
  assert.deepEqual([d.vehicles[0].Id, d.vehicles[0].Make, d.vehicles[0].IsDiesel, d.vehicles[0].PurchaseDate, d.vehicles[0].Tags[0], d.vehicles[0].ExtraFields[0].Value], [7, 'Toyota', true, '2019-04-12T00:00:00.000Z', 'tow car', '265/70R16']);
  assert.deepEqual([d.gasrecords[0].Cost, d.gasrecords[0].Gallons], [65.12, 54.2]);
  // The log holds a committed second fill-up (page 5 rewritten) and an uncommitted one (ignored).
  const fuel2 = enc({ _id: 2, VehicleId: 7, Cost: { dec: 100 } }), fuel3 = enc({ _id: 3, VehicleId: 7 });
  writeFileSync(join(dir, 'cartracker-log.db'), Buffer.concat([page(5, 4, 4, [block(false, null, fuel), block(false, null, fuel2)], { tx: 9, confirmed: true }), page(6, 4, 4, [block(false, null, fuel3)], { tx: 10 })]));
  d = readLiteDb(file);
  assert.deepEqual(d.gasrecords.map(x => x.Id).sort(), [1, 2]);
  writeFileSync(file, Buffer.alloc(P)); assert.throws(() => readLiteDb(file), /isn’t a LiteDB database/);
});
