// OAuth2 / OpenID Connect sign-in: discovery from the issuer, authorization code with PKCE, then the account's
// verified email from userinfo (or GitHub's API, which is plain OAuth2). Garage decides who that email is.
import { createHash, randomBytes } from 'node:crypto';

const GITHUB = { authorization_endpoint: 'https://github.com/login/oauth/authorize', token_endpoint: 'https://github.com/login/oauth/access_token' };

/** Who may sign in: a profile with that email, or anyone on the allowed list (emails and @domains). */
export function allowedBy(list, email) {
  const e = String(email || '').toLowerCase(), items = String(list || '').toLowerCase().split(/[\s,;]+/).filter(Boolean);
  return items.some(x => (x.startsWith('@') ? e.endsWith(x) : e === x));
}

export function createOAuth({ doFetch = fetch } = {}) {
  const states = new Map(), found = new Map(); // state → { verifier, redirect, at }; issuer → discovery
  const json = async (url, opts, what) => {
    let r, j;
    try { r = await doFetch(url, opts); j = await r.json(); } catch { throw new Error(`Couldn’t reach the sign-in provider (${what}). Check the issuer URL.`); }
    if (!r.ok) throw new Error(`The sign-in provider refused (${what}): ${j?.error_description || j?.error || r.status}`);
    return j;
  };
  const endpoints = async cfg => {
    if (cfg.oProvider === 'github') return GITHUB;
    const iss = String(cfg.issuer || '').replace(/\/+$/, '');
    if (!/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(iss + '/')) throw new Error('Use the provider’s https issuer URL.');
    const hit = found.get(iss); if (hit && Date.now() - hit.at < 3600_000) return hit.d;
    const d = await json(iss + '/.well-known/openid-configuration', { headers: { accept: 'application/json' } }, 'discovery');
    if (!d.authorization_endpoint || !d.token_endpoint || !d.userinfo_endpoint) throw new Error('That issuer’s OpenID configuration is missing endpoints.');
    found.set(iss, { d, at: Date.now() });
    return d;
  };

  return {
    /** Where to send the browser to sign in. */
    async start(cfg, redirect) {
      const d = await endpoints(cfg), state = randomBytes(16).toString('base64url'), verifier = randomBytes(32).toString('base64url');
      states.set(state, { verifier, redirect, at: Date.now() });
      for (const [k, v] of states) if (Date.now() - v.at > 600_000) states.delete(k);
      const u = new URL(d.authorization_endpoint);
      u.search = new URLSearchParams({ response_type: 'code', client_id: cfg.clientId, redirect_uri: redirect, scope: cfg.scopes || 'openid email profile', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
      return u.toString();
    },
    /** After the provider sends the browser back: { email, name } of a verified account. */
    async finish(cfg, secret, { code, state, error }) {
      if (error) throw new Error(`The sign-in provider said: ${error}`);
      const s = states.get(String(state || '')); states.delete(String(state || ''));
      if (!s || Date.now() - s.at > 600_000) throw new Error('That sign-in took too long, or started somewhere else. Try again.');
      const d = await endpoints(cfg);
      const tok = await json(d.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code: String(code || ''), redirect_uri: s.redirect, client_id: cfg.clientId, client_secret: secret, code_verifier: s.verifier }) }, 'token');
      if (!tok.access_token) throw new Error('The sign-in provider didn’t return an access token.');
      const auth = { authorization: 'Bearer ' + tok.access_token, accept: 'application/json', 'user-agent': 'Garage' };
      if (cfg.oProvider === 'github') {
        const [me, emails] = await Promise.all([json('https://api.github.com/user', { headers: auth }, 'profile'), json('https://api.github.com/user/emails', { headers: auth }, 'emails')]);
        const e = (emails || []).find(x => x.primary && x.verified);
        if (!e) throw new Error('Your GitHub account has no verified primary email.');
        return { email: e.email.toLowerCase(), name: me.name || me.login || e.email.split('@')[0] };
      }
      const u = await json(d.userinfo_endpoint, { headers: auth }, 'userinfo');
      if (!u.email) throw new Error('The sign-in provider didn’t share an email address. Add the “email” scope.');
      if (u.email_verified === false || u.email_verified === 'false') throw new Error('That account’s email address isn’t verified with the provider.');
      return { email: String(u.email).toLowerCase(), name: u.name || u.preferred_username || String(u.email).split('@')[0] };
    },
  };
}
