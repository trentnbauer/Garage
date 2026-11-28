// Passkeys (WebAuthn): register them in Settings, sign in with one alone, or use one as the second step after a PIN.
// Verification is @simplewebauthn/server; this keeps the challenges and where the keys are stored.
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';

/** The site a passkey belongs to: this server as the browser reached it (through a tunnel, the App URL). */
export function site(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  return { origin: `${proto}://${host}`, rpID: host.replace(/:\d+$/, '') };
}

/** keys(uid) / setKeys(uid, list) store each person's passkeys: { id, publicKey, counter, transports, name, at }. */
export function createPasskeys({ keys, setKeys, allKeys, verify = { verifyRegistrationResponse, verifyAuthenticationResponse } }) {
  const challenges = new Map(); // challenge → { uid, kind, at }, single use, five minutes
  const keep = (challenge, v) => { challenges.set(challenge, { ...v, at: Date.now() }); for (const [k, x] of challenges) if (Date.now() - x.at > 300_000) challenges.delete(k); };
  const take = (response, kind) => {
    let c = ''; try { c = JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8')).challenge; } catch { /* checked below */ }
    const x = challenges.get(c); challenges.delete(c);
    if (!x || x.kind !== kind || Date.now() - x.at > 300_000) throw new Error('That took too long. Try again.');
    return { challenge: c, ...x };
  };

  return {
    /** Options for adding a passkey to this person's account. */
    async registerOptions(user, req) {
      const { rpID } = site(req);
      const o = await generateRegistrationOptions({
        rpName: 'Garage', rpID, userName: user.name, userDisplayName: user.name, userID: new TextEncoder().encode(user.id), attestationType: 'none',
        excludeCredentials: keys(user.id).map(k => ({ id: k.id, transports: k.transports })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' }, // discoverable, so it can sign in without picking a profile
      });
      keep(o.challenge, { uid: user.id, kind: 'reg' });
      return o;
    },
    async register(user, response, name, req) {
      const c = take(response, 'reg'); if (c.uid !== user.id) throw new Error('That passkey setup was for someone else.');
      const { origin, rpID } = site(req);
      const v = await verify.verifyRegistrationResponse({ response, expectedChallenge: c.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false });
      if (!v.verified) throw new Error('The passkey couldn’t be checked. Try again.');
      const cr = v.registrationInfo.credential;
      const key = { id: cr.id, publicKey: Buffer.from(cr.publicKey).toString('base64url'), counter: cr.counter, transports: response.response.transports || [], name: String(name || 'Passkey').slice(0, 60), at: new Date().toISOString() };
      setKeys(user.id, [...keys(user.id).filter(k => k.id !== key.id), key]);
      return key;
    },
    /** Options for signing in: any passkey on this server, or only this person's when it's their second step. */
    async loginOptions(req, uid) {
      const o = await generateAuthenticationOptions({ rpID: site(req).rpID, userVerification: 'preferred', allowCredentials: uid ? keys(uid).map(k => ({ id: k.id, transports: k.transports })) : [] });
      keep(o.challenge, { uid: uid || null, kind: 'auth' });
      return o;
    },
    /** Returns the user id the passkey belongs to. */
    async login(response, req) {
      const c = take(response, 'auth');
      const hit = allKeys().find(([, k]) => k.id === response.id);
      if (!hit || (c.uid && hit[0] !== c.uid)) throw new Error('That passkey isn’t registered here.');
      const [uid, k] = hit, { origin, rpID } = site(req);
      const v = await verify.verifyAuthenticationResponse({ response, expectedChallenge: c.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false,
        credential: { id: k.id, publicKey: Buffer.from(k.publicKey, 'base64url'), counter: k.counter, transports: k.transports } });
      if (!v.verified) throw new Error('The passkey couldn’t be checked. Try again.');
      setKeys(uid, keys(uid).map(x => (x.id === k.id ? { ...x, counter: v.authenticationInfo.newCounter, used: new Date().toISOString() } : x)));
      return uid;
    },
  };
}
