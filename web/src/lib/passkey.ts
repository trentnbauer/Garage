// Passkeys in the browser: turn the server's options into WebAuthn calls and the results back into JSON.
/* eslint-disable @typescript-eslint/no-explicit-any */
const enc = (b: ArrayBuffer | null) => (b ? btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : undefined);
const dec = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

async function post(path: string, body: unknown) {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : { error: 'Can’t reach the Garage server.' };
  if (!r?.ok) throw new Error(j.error || 'That didn’t work.');
  return j;
}
/** A message fit to show for a failed passkey call. */
export const pkError = (e: unknown) => {
  const x = e as { name?: string; message?: string };
  return !window.PublicKeyCredential ? 'This browser doesn’t support passkeys.'
    : x?.name === 'NotAllowedError' ? 'Passkey cancelled or timed out.'
    : x?.name === 'SecurityError' ? 'Passkeys need Garage open on its own address, over HTTPS (or at localhost).'
    : x?.name === 'InvalidStateError' ? 'That passkey is already on your account.'
    : x?.message || 'Couldn’t use a passkey.';
};
const deviceName = () => { const ua = navigator.userAgent; return /iPhone|iPad/.test(ua) ? 'iPhone / iPad' : /Mac/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : 'Passkey'; };

/** Add a passkey to the signed-in person's account. */
export async function addPasskey() {
  const o = await post('/api/passkeys/options', {});
  const c = await navigator.credentials.create({ publicKey: { ...o, challenge: dec(o.challenge), user: { ...o.user, id: dec(o.user.id) }, excludeCredentials: (o.excludeCredentials || []).map((x: any) => ({ ...x, id: dec(x.id) })) } }) as PublicKeyCredential;
  const r = c.response as AuthenticatorAttestationResponse;
  await post('/api/passkeys', { name: deviceName(), response: { id: c.id, rawId: enc(c.rawId), type: c.type, clientExtensionResults: c.getClientExtensionResults(), authenticatorAttachment: c.authenticatorAttachment, response: { clientDataJSON: enc(r.clientDataJSON), attestationObject: enc(r.attestationObject), transports: r.getTransports?.() || [] } } });
}

/** Sign in with a passkey: on its own, or as the second step after a PIN (ticket). Resolves once signed in. */
export async function passkeySignIn(ticket?: string) {
  const o = await post('/api/passkey/login/options', { ticket });
  const c = await navigator.credentials.get({ publicKey: { ...o, challenge: dec(o.challenge), allowCredentials: (o.allowCredentials || []).map((x: any) => ({ ...x, id: dec(x.id) })) } }) as PublicKeyCredential;
  const r = c.response as AuthenticatorAssertionResponse;
  await post('/api/passkey/login', { ticket, response: { id: c.id, rawId: enc(c.rawId), type: c.type, clientExtensionResults: c.getClientExtensionResults(), authenticatorAttachment: c.authenticatorAttachment, response: { clientDataJSON: enc(r.clientDataJSON), authenticatorData: enc(r.authenticatorData), signature: enc(r.signature), userHandle: enc(r.userHandle) } } });
}
