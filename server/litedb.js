// A read-only reader for LiteDB 5 data files (file version 8), enough to pull every document out of
// LubeLogger's cartracker.db. Layout from LiteDB's BasePage/HeaderPage/DataPage/DataBlock and BufferReader.
import { existsSync, readFileSync } from 'node:fs';

const PAGE = 8192, MAGIC = '** This is a LiteDB file **', DATA = 4, NONE = 0xffffffff;

/** One BSON document from buf at pos. LiteDB's own types (Decimal, MinKey, MaxKey) included. */
export function bson(buf, pos = 0) {
  const end = pos + buf.readInt32LE(pos); let p = pos + 4; const out = {};
  while (p < end - 1) {
    const t = buf[p++]; let z = p; while (buf[z] !== 0) z++;
    const key = buf.toString('utf8', p, z); p = z + 1; let v;
    switch (t) {
      case 0x01: v = buf.readDoubleLE(p); p += 8; break;
      case 0x02: { const n = buf.readInt32LE(p); v = buf.toString('utf8', p + 4, p + 4 + n - 1); p += 4 + n; break; }
      case 0x03: case 0x04: { const n = buf.readInt32LE(p); const d = bson(buf, p); v = t === 0x04 ? Object.values(d) : d; p += n; break; }
      case 0x05: { const n = buf.readInt32LE(p), sub = buf[p + 4], b = buf.subarray(p + 5, p + 5 + n); v = sub === 4 ? b.toString('hex') : Buffer.from(b); p += 5 + n; break; }
      case 0x07: v = buf.toString('hex', p, p + 12); p += 12; break;
      case 0x08: v = buf[p] === 1; p += 1; break;
      case 0x09: { const ms = Number(buf.readBigInt64LE(p)); v = ms >= 253402300800000 || ms <= -62135596800000 ? null : new Date(ms).toISOString(); p += 8; break; }
      case 0x0a: v = null; break;
      case 0x10: v = buf.readInt32LE(p); p += 4; break;
      case 0x12: v = Number(buf.readBigInt64LE(p)); p += 8; break;
      case 0x13: { // System.Decimal: lo, mid, hi (96-bit), flags (scale in bits 16-23, sign in bit 31)
        const lo = BigInt(buf.readUInt32LE(p)), mid = BigInt(buf.readUInt32LE(p + 4)), hi = BigInt(buf.readUInt32LE(p + 8)), fl = buf.readUInt32LE(p + 12);
        v = Number(lo | (mid << 32n) | (hi << 64n)) / 10 ** ((fl >> 16) & 0xff) * (fl >>> 31 ? -1 : 1); p += 16; break;
      }
      case 0xff: case 0x7f: v = null; break;
      default: throw new Error(`Unsupported BSON type 0x${t.toString(16)} in the LubeLogger database.`);
    }
    out[key] = v;
  }
  return out;
}

const pageInfo = (b, o) => ({ id: b.readUInt32LE(o), type: b[o + 4], tx: b.readUInt32LE(o + 14), confirmed: b[o + 18] === 1, col: b.readUInt32LE(o + 19), hi: b[o + 30] });

/**
 * Every collection in a LiteDB file as { name: documents[] }. Pages from committed transactions in the
 * write-ahead log (<file>-log.db), if there is one, replace the data file's copies.
 */
export function readLiteDb(file) {
  const data = readFileSync(file);
  if (data.length < PAGE || data.toString('latin1', 32, 32 + MAGIC.length) !== MAGIC) throw new Error('That isn’t a LiteDB database (cartracker.db). Check the path.');
  if (data[59] !== 8) throw new Error(`This LiteDB file is version ${data[59]}; Garage reads version 8 (LiteDB 5). Update LubeLogger, or use the API instead.`);
  const pages = new Map(); // pageID → [buffer, offset]
  for (let o = 0; o + PAGE <= data.length; o += PAGE) pages.set(o / PAGE, [data, o]);
  const logFile = file.replace(/\.db$/i, '') + '-log.db';
  if (existsSync(logFile)) {
    const log = readFileSync(logFile), seen = [], ok = new Set();
    for (let o = 0; o + PAGE <= log.length; o += PAGE) { const h = pageInfo(log, o); seen.push([h, o]); if (h.confirmed) ok.add(h.tx); }
    for (const [h, o] of seen) if (ok.has(h.tx)) pages.set(h.id, [log, o]); // later pages in the log win
  }
  const [hb, ho] = pages.get(0);
  const names = bson(hb, ho + 192), byPage = Object.fromEntries(Object.entries(names).map(([n, id]) => [id >>> 0, n]));

  const item = (pid, i) => {
    const pg = pages.get(pid); if (!pg) return null;
    const [b, o] = pg, at = o + PAGE - 4 * (i + 1), len = b.readUInt16LE(at), pos = b.readUInt16LE(at + 2);
    return len && pos >= 32 ? b.subarray(o + pos, o + pos + len) : null;
  };
  const out = Object.fromEntries(Object.keys(names).map(n => [n, []]));
  for (const [pid, [b, o]] of pages) {
    const h = pageInfo(b, o);
    if (h.type !== DATA || h.hi === 255 || !(h.col in byPage)) continue;
    for (let i = 0; i <= h.hi; i++) {
      const blk = item(pid, i); if (!blk || blk[0] === 1) continue; // continuation blocks are read from their first block
      const parts = []; let cur = blk, guard = 0;
      while (cur && guard++ < 10000) {
        parts.push(cur.subarray(6));
        const np = cur.readUInt32LE(1), ni = cur[5];
        cur = np === NONE ? null : item(np, ni);
      }
      try { out[byPage[h.col]].push(bson(Buffer.concat(parts))); } catch { /* a damaged or half-written document is skipped */ }
    }
  }
  // LiteDB keeps the Id property as _id.
  for (const docs of Object.values(out)) for (const d of docs) if (d._id !== undefined && d.Id === undefined) d.Id = d._id;
  return out;
}
