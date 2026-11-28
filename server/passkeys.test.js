import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPasskeys, site } from './passkeys.js';

// The WebAuthn checks themselves are @simplewebauthn's (and are exercised for real in the browser test);
// these cover Garage's part: challenges, who a key belongs to, and the stored counter.
const req = { headers: { host: 'garage.example.com', 'x-forwarded-proto': 'https' } };
const cd = challenge => Buffer.from(JSON.stringify({ challenge })).toString('base64url');
function setup() {
  const store = { u1: [], u2: [] }, calls = [];
  const pk = createPasskeys({
    keys: id => store[id] || [], setKeys: (id, l) => { store[id] = l; }, allKeys: () => Object.entries(store).flatMap(([id, l]) => l.map(k => [id, k])),
    verify: {
      verifyRegistrationResponse: async o => { calls.push(o); return { verified: true, registrationInfo: { credential: { id: o.response.id, publicKey: new Uint8Array([1, 2, 3]), counter: 0 } } }; },
      verifyAuthenticationResponse: async o => { calls.push(o); return { verified: true, authenticationInfo: { newCounter: o.credential.counter + 1 } }; },
    },
  });
  return { pk, store, calls };
}

test('passkeys: register, sign in alone or as a second step, single-use challenges', async () => {
  assert.deepEqual(site(req), { origin: 'https://garage.example.com', rpID: 'garage.example.com' });
  assert.deepEqual(site({ headers: { host: 'localhost:3000' } }), { origin: 'http://localhost:3000', rpID: 'localhost' });
  const { pk, store, calls } = setup(), u1 = { id: 'u1', name: 'Sam' };
  const ro = await pk.registerOptions(u1, req);
  assert.equal(ro.rp.id, 'garage.example.com');
  assert.equal(ro.authenticatorSelection.residentKey, 'required');
  await pk.register(u1, { id: 'K1', response: { clientDataJSON: cd(ro.challenge), transports: ['internal'] } }, 'Mac', req);
  assert.deepEqual([store.u1[0].id, store.u1[0].name, store.u1[0].publicKey], ['K1', 'Mac', 'AQID']);
  assert.deepEqual([calls[0].expectedOrigin, calls[0].expectedRPID, calls[0].expectedChallenge], ['https://garage.example.com', 'garage.example.com', ro.challenge]);
  await assert.rejects(pk.register(u1, { id: 'K2', response: { clientDataJSON: cd(ro.challenge) } }, 'x', req), /took too long/); // used up
  const lo = await pk.loginOptions(req);
  assert.deepEqual(lo.allowCredentials, []); // any passkey: it says whose it is
  assert.equal(await pk.login({ id: 'K1', response: { clientDataJSON: cd(lo.challenge) } }, req), 'u1');
  assert.equal(store.u1[0].counter, 1);
  const lo2 = await pk.loginOptions(req, 'u2'); // second step for u2: u1's key doesn't count
  await assert.rejects(pk.login({ id: 'K1', response: { clientDataJSON: cd(lo2.challenge) } }, req), /isn’t registered here/);
  const lo3 = await pk.loginOptions(req);
  await assert.rejects(pk.login({ id: 'nope', response: { clientDataJSON: cd(lo3.challenge) } }, req), /isn’t registered/);
  await assert.rejects(pk.login({ id: 'K1', response: { clientDataJSON: cd('made-up') } }, req), /took too long/);
});
