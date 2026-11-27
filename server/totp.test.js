import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeAt, newSecret, verify } from './totp.js';

// RFC 6238 appendix B, SHA-1 key "12345678901234567890" (base32 below), last 6 of the 8-digit codes.
const KEY = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
test('RFC 6238 vectors', () => {
  for (const [t, code] of [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037']]) assert.equal(codeAt(KEY, t), code);
});
test('verify allows one step of drift, no more', () => {
  const s = newSecret(), t = 1_700_000_000;
  assert.equal(s.length, 32);
  assert.ok(verify(s, codeAt(s, t), t));
  assert.ok(verify(s, codeAt(s, t - 30), t));
  assert.ok(!verify(s, codeAt(s, t - 90), t));
  assert.ok(!verify(s, '12345', t));
});
