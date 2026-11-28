// Admin settings → Sign-in → OAuth2 / OpenID Connect. Fields save when you leave them; the client secret has its own Save.
import { type CSSProperties } from 'react';
import type { Nav } from '../App.tsx';
import type { Garage } from '../lib/model.ts';
import type { Store } from '../lib/store.ts';
import { card, Field, Head, lab, Locked, mono, Secret } from './AdminMail.tsx';

const PRE: Record<string, [string, string, string, string]> = {
  google: ['Google', 'https://accounts.google.com', 'openid email profile', 'Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web application).'],
  microsoft: ['Microsoft', 'https://login.microsoftonline.com/common/v2.0', 'openid email profile', 'Entra admin centre → App registrations → New registration. Swap “common” for your tenant ID to keep it to your organisation.'],
  github: ['GitHub', 'https://github.com/login/oauth', 'read:user user:email', 'GitHub → Settings → Developer settings → OAuth Apps. GitHub is plain OAuth2 (no OIDC), so Garage reads the account’s primary verified email.'],
  authentik: ['Authentik', 'https://auth.example.com/application/o/garage/', 'openid email profile', 'Applications → Providers → OAuth2/OpenID Provider, confidential client. The issuer is the provider’s “OpenID Configuration Issuer”.'],
  authelia: ['Authelia', 'https://auth.example.com', 'openid email profile groups', 'Add a client under identity_providers.oidc.clients in configuration.yml, with the redirect URI below.'],
  keycloak: ['Keycloak', 'https://sso.example.com/realms/home', 'openid email profile', 'Clients → Create client (OpenID Connect), Client authentication on. The issuer is the realm URL.'],
  custom: ['SSO', '', 'openid email profile', 'Any OpenID Connect provider. Enter its issuer URL and Garage discovers the endpoints.'],
};
const pill = (on: boolean): CSSProperties => ({ boxSizing: 'content-box', height: 30, padding: '0 12px', borderRadius: 999, fontSize: 12, display: 'flex', alignItems: 'center', border: `1px solid ${on ? 'var(--acc)' : 'var(--line2)'}`, background: on ? 'var(--accs)' : 'transparent', color: on ? 'var(--fg)' : 'var(--mut)' });

/** Why OAuth2 can't be switched on yet, or ''. */
export const oauthProblem = (g: Garage, myEmail?: string) => { const a = g.auth; return !a.clientId || !a.hasSecret || (a.oProvider !== 'github' && !a.issuer) ? 'Fill in the client ID, client secret and issuer below' : !myEmail ? 'Add your own email in People & roles (it’s how OAuth2 knows you)' : ''; };

export function OAuthCard({ store, g, nav, myEmail, setMsg }: { store: Store; g: Garage; nav: Nav; myEmail?: string; setMsg: (m: string) => void }) {
  const a = g.auth, prov = a.oProvider || 'google', pre = PRE[prov] || PRE.custom, problem = oauthProblem(g, myEmail);
  const put = async (p: Record<string, unknown>) => { const r = await store.api('PUT', '/api/admin/oauth', p); setMsg(r.ok ? '' : r.json.error || 'Couldn’t save.'); return r.ok; };
  const st: [string, string] = a.google ? ['On', '#3fcf8e'] : problem ? ['Not set up', '#8d9099'] : ['Ready', '#8d9099'];
  const base = g.tunnel?.appUrl || (/^https?:/.test(location.origin) ? location.origin : 'https://garage.example.com');
  return (
    <div style={card}>
      <Head title="OAuth2 / OpenID Connect" hint="Sign in with any OAuth2 provider — Google, Microsoft, GitHub, or your own Authentik, Authelia or Keycloak." st={st} />
      <Locked g={g} re={/^OAUTH_|^AUTH_OAUTH$/} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="label">Provider</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{Object.entries(PRE).map(([k, p]) => <button key={k} type="button" className="plain" aria-pressed={prov === k} onClick={() => put({ oProvider: k, oName: p[0], issuer: p[1], scopes: p[2] })} style={pill(prov === k)}>{k === 'custom' ? 'Other' : p[0]}</button>)}</div>
        <span style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 1.45 }}>{pre[3]}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,260px),1fr))', gap: 12 }}>
        <label style={lab}><span className="label">Button label</span><Field value={a.oName || ''} placeholder="Google" style={mono} onSave={v => put({ oName: v })} /><span style={{ fontSize: 12, color: 'var(--mut)' }}>Shown as “Continue with …” on the sign-in screen.</span></label>
        <label style={lab}><span className="label">Issuer / discovery URL</span><Field value={a.issuer || ''} placeholder="https://auth.example.com" style={mono} onSave={v => put({ issuer: v })} /><span style={{ fontSize: 12, color: 'var(--mut)' }}>Garage reads /.well-known/openid-configuration from here.</span></label>
        <label style={lab}><span className="label">Client ID</span><Field value={a.clientId || ''} placeholder="From your provider" style={mono} onSave={v => put({ clientId: v })} /></label>
        <Secret label="Client secret" saved={!!a.hasSecret} ph="From your provider" keep="Kept on this server only, never shown again." onSave={v => put({ secret: v.trim() })}
          onRemove={() => nav.ask({ title: 'Remove the client secret?', body: 'OAuth2 sign-in turns off until you add it again.', label: 'Remove', fn: () => { put({ secret: null }); } })} />
        <label style={lab}><span className="label">Scopes</span><Field value={a.scopes || ''} placeholder="openid email profile" style={mono} onSave={v => put({ scopes: v })} /></label>
        <label style={lab}><span className="label">New users join as</span><select className="field" style={{ padding: '0 10px' }} value={a.googleRole || 'member'} onChange={e => put({ googleRole: e.target.value })}><option value="member">Member</option><option value="admin">Admin</option></select></label>
      </div>
      <label style={lab}><span className="label">Allowed accounts</span><Field value={a.allowed || ''} placeholder="@yourdomain.com, friend@example.com" onSave={v => put({ allowed: v })} />
        <span style={{ fontSize: 12, color: 'var(--mut)' }}>{['google', 'microsoft', 'github'].includes(prov) ? `Required for ${a.oName || pre[0]}: emails or @domains, comma separated. Anyone else is refused.` : 'Emails or @domains, comma separated. Leave blank to accept everyone your provider lets sign in.'} People with their email set in People &amp; roles can always sign in.</span></label>
      <div style={lab}><span className="label">Redirect URI — add this to your provider</span><div className="mono" style={{ fontSize: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--card2)', overflowWrap: 'anywhere', userSelect: 'all' }}>{base}/api/oauth/callback</div></div>
      {problem && !a.google && <span role="status" style={{ fontSize: 13, color: 'var(--warn)' }}>{problem}, then switch OAuth2 on above.</span>}
    </div>
  );
}
