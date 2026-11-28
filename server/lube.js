// LubeLogger sources for the importer: its data folder (a mounted Docker volume) or its REST API.
// Both give { dump: { collection: docs[] , config }, files: { basename: { size, read() } }, label }.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readLiteDb } from './litedb.js';

/** The data folder: <path>/cartracker.db (or <path>/data/cartracker.db), documents/, images/, config/userConfig.json. */
export function fromVolume(path) {
  const dir = [path, join(path, 'data')].find(d => existsSync(join(d, 'cartracker.db')));
  if (!dir) throw new Error(existsSync(path) ? `No cartracker.db in ${path}. Point it at LubeLogger’s data folder (the one with cartracker.db in it).` : `${path} doesn’t exist inside the Garage container. Check the volume in docker-compose.yml.`);
  const dump = readLiteDb(join(dir, 'cartracker.db'));
  try { dump.config = JSON.parse(readFileSync(join(dir, 'config', 'userConfig.json'), 'utf8')); } catch { /* optional */ }
  const files = {};
  for (const sub of ['documents', 'images']) {
    const d = join(dir, sub); if (!existsSync(d)) continue;
    for (const n of readdirSync(d)) { const p = join(d, n), st = statSync(p); if (st.isFile()) files[n] = { size: st.size, read: () => readFile(p) }; }
  }
  return { dump, files, label: `${path} · ${Object.values(dump).reduce((a, x) => a + (Array.isArray(x) ? x.length : 0), 0)} items, ${Object.keys(files).length} attachments` };
}

const RECORDS = [['servicerecords', 'servicerecords'], ['collisionrecords', 'repairrecords'], ['upgraderecords', 'upgraderecords'], ['gasrecords', 'gasrecords'], ['taxrecords', 'taxrecords'], ['odometerrecords', 'odometerrecords'], ['reminderrecords', 'reminders'], ['planrecords', 'planrecords'], ['supplyrecords', 'supplyrecords'], ['notes', 'notes']];
const BOOL = /^(true|false)$/i;
// The API's export models use other names than the database for a few fields, and send everything as strings.
const RENAME = { Odometer: 'Mileage', FuelConsumed: 'Gallons', PartQuantity: 'Quantity', Type: 'ImportMode', DueDate: 'Date', DueOdometer: 'Mileage' };
/** One API record in the database's shape: PascalCase, database field names, booleans and ISO dates. */
export function fromApiRecord(r) {
  const o = {};
  for (const [k0, v0] of Object.entries(r || {})) {
    const k1 = k0[0].toUpperCase() + k0.slice(1), k = RENAME[k1] || k1;
    let v = v0;
    if (typeof v === 'string' && BOOL.test(v)) v = /^true$/i.test(v);
    else if (typeof v === 'string' && /date/i.test(k) && /^\d{1,2}\/\d{1,2}\/\d{4}/.test(v)) { const [m, d, y] = v.split(/[/\s]/); v = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; } // invariant culture is M/d/yyyy
    else if (typeof v === 'string' && k === 'Tags') v = v.split(/\s+/).filter(Boolean);
    else if (Array.isArray(v)) v = v.map(x => (x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([a, b]) => [a[0].toUpperCase() + a.slice(1), b])) : x)); // Files: {name, location}
    o[k] = v;
  }
  if (o.Id !== undefined) o.Id = +o.Id; if (o.VehicleId !== undefined) o.VehicleId = +o.VehicleId;
  return o;
}

/** Pull everything over the API. auth: { key } or { user, pass }; only a username and password can fetch attachments. */
export async function fromApi(base0, auth, doFetch = fetch) {
  const base = String(base0 || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/\s]+/i.test(base)) throw new Error('Enter LubeLogger’s address, like http://lubelogger:8080.');
  const basic = auth.user ? 'Basic ' + Buffer.from(`${auth.user}:${auth.pass || ''}`).toString('base64') : '';
  const headers = { 'culture-invariant': '1', ...(basic ? { authorization: basic } : { 'x-api-key': auth.key || '' }) };
  const get = async path => {
    let r;
    try { r = await doFetch(base + path, { headers }); } catch { throw new Error(`Couldn’t reach LubeLogger at ${base}. From inside Docker, use its service name, like http://lubelogger:8080.`); }
    if (r.status === 401 || r.status === 403) throw new Error('LubeLogger refused the sign-in. Check the API key, or the username and password.');
    if (r.status === 404) return null; // an older LubeLogger without that record type
    if (!r.ok) throw new Error(`LubeLogger returned an error (${r.status}) for ${path}.`);
    return r;
  };
  const vr = await get('/api/vehicles'); if (!vr) throw new Error(`No LubeLogger API at ${base}.`);
  const vehicles = (await vr.json()).map(fromApiRecord), dump = { vehicles };
  for (const [coll] of RECORDS) dump[coll] = [];
  for (const v of vehicles) for (const [coll, route] of RECORDS) {
    const r = await get(`/api/vehicle/${route}?vehicleId=${v.Id}`);
    if (r) dump[coll].push(...(await r.json()).map(x => ({ VehicleId: v.Id, ...fromApiRecord(x) })));
  }
  const shop = await get('/api/vehicle/supplyrecords/all'); // shop supplies (vehicle 0) only show up here
  if (shop) for (const s of (await shop.json()).map(fromApiRecord)) if (!s.VehicleId && !dump.supplyrecords.some(x => x.Id === s.Id)) dump.supplyrecords.push(s);
  const files = {};
  if (basic) {
    const locs = [...vehicles.map(v => v.ImageLocation), ...Object.values(dump).flat().flatMap(r => (r.Files || []).map(f => f.Location))].filter(l => l && /^\/(documents|images)\//.test(l));
    for (const loc of locs) files[loc.split('/').pop()] = { size: 0, read: async () => { const r = await get(loc); if (!r) throw new Error('missing'); return Buffer.from(await r.arrayBuffer()); } };
  }
  return { dump, files, label: `${base} · ${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'}`, noFiles: !basic, apiReminders: true };
}
