// Test helper: writes LiteDB-shaped files (BSON documents in data pages) for the reader's tests.
// A tiny BSON writer for the test: strings, int32, doubles, bools, dates, arrays, documents, decimals.
export function enc(doc) {
  const parts = [];
  for (const [k, v] of Object.entries(doc)) {
    const key = Buffer.concat([Buffer.from(k), Buffer.from([0])]);
    let t, b;
    if (typeof v === 'string') { t = 2; const s = Buffer.from(v); b = Buffer.alloc(4 + s.length + 1); b.writeInt32LE(s.length + 1); s.copy(b, 4); }
    else if (Number.isInteger(v)) { t = 0x10; b = Buffer.alloc(4); b.writeInt32LE(v); }
    else if (typeof v === 'number') { t = 1; b = Buffer.alloc(8); b.writeDoubleLE(v); }
    else if (typeof v === 'boolean') { t = 8; b = Buffer.from([v ? 1 : 0]); }
    else if (v instanceof Date) { t = 9; b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(v.getTime())); }
    else if (v && v.dec) { t = 0x13; b = Buffer.alloc(16); b.writeUInt32LE(v.dec); b.writeUInt32LE(2 << 16, 12); } // value / 100
    else if (Array.isArray(v)) { t = 4; b = enc(Object.fromEntries(v.map((x, i) => [String(i), x]))); }
    else { t = 3; b = enc(v); }
    parts.push(Buffer.from([t]), key, b);
  }
  const body = Buffer.concat(parts), out = Buffer.alloc(4 + body.length + 1);
  out.writeInt32LE(out.length); body.copy(out, 4); return out;
}
export const P = 8192;
export function page(id, type, col, items, { tx = 0xffffffff, confirmed = false } = {}) {
  const b = Buffer.alloc(P); b.writeUInt32LE(id, 0); b[4] = type; b.writeUInt32LE(tx, 14); b[18] = confirmed ? 1 : 0; b.writeUInt32LE(col, 19);
  let pos = 32; b[30] = items.length ? items.length - 1 : 255;
  items.forEach((it, i) => { it.copy(b, pos); const at = P - 4 * (i + 1); b.writeUInt16LE(it.length, at); b.writeUInt16LE(pos, at + 2); pos += it.length; });
  return b;
}
export const block = (extend, next, data) => { const b = Buffer.alloc(6 + data.length); b[0] = extend ? 1 : 0; b.writeUInt32LE(next ? next[0] : 0xffffffff, 1); b[5] = next ? next[1] : 255; data.copy(b, 6); return b; };

/** A data file with one collection page and one data page per collection. */
export function liteFile(colls) {
  const header = Buffer.alloc(P); header.write('** This is a LiteDB file **', 32, 'latin1'); header[59] = 8;
  const names = {}, pages = []; let id = 1;
  for (const [n, docs] of Object.entries(colls)) { const cp = id++; names[n] = cp; pages.push(page(cp, 2, 0, []), page(id++, 4, cp, docs.map(d => block(false, null, enc(d))))); }
  enc(names).copy(header, 192);
  return Buffer.concat([header, ...pages]);
}
