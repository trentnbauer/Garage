// Time-based one-time codes (RFC 6238, SHA-1, 6 digits, 30 s steps), as authenticator apps use.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newSecret() {
  let bits = '';
  for (const b of randomBytes(20)) bits += b.toString(2).padStart(8, '0');
  let s = '';
  for (let i = 0; i < bits.length; i += 5) s += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return s;
}
function decode(s) {
  let bits = '';
  for (const c of String(s).replace(/[\s=]+/g, '').toUpperCase()) { const v = B32.indexOf(c); if (v > -1) bits += v.toString(2).padStart(5, '0'); }
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
export function codeAt(secret, unixSeconds, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(unixSeconds / 30)));
  const mac = createHmac('sha1', decode(secret)).update(msg).digest(), o = mac[19] & 15;
  return String((mac.readUInt32BE(o) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
}
/** True if `code` matches now or one step either side (phone clocks drift). */
export function verify(secret, code, now = Date.now() / 1000) {
  const c = Buffer.from(String(code || '').replace(/\D/g, ''));
  if (c.length !== 6) return false;
  return [-30, 0, 30].some(d => { const want = Buffer.from(codeAt(secret, now + d)); return timingSafeEqual(want, c); });
}
