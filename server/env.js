import { hostOf } from './tunnel.js';

// Admin settings as environment variables: read on start (the environment wins), and exported as a .env file.
// Each row: [variable, doc, field, kind, options]. A doc starting "secret:" holds a secret under its own key.
const ON = /^(1|true|yes|on)$/i;
export const VARS = [
  ['GARAGE_UNITS', 'settings', 'units', 'enum', ['km', 'mi']],
  ['GARAGE_CURRENCY', 'settings', 'currency', 'str'],
  ['AUTH_SIGNINS', 'auth', 'signins', 'bool'],
  ['AUTH_TOTP', 'auth', 'tfaTotp', 'bool'],
  ['AUTH_2FA_REQUIRED', 'auth', 'tfaRequire', 'enum', ['off', 'admins', 'all']],
  ['AI_ENABLED', 'ai', 'enabled', 'bool'],
  ['AI_PROVIDER', 'ai', 'provider', 'enum', ['anthropic', 'openai', 'ollama']],
  ['AI_MODEL', 'ai', 'model', 'str'],
  ['AI_BASE_URL', 'ai', 'baseUrl', 'str'],
  ['AI_API_KEY', 'secret:aiKey', null, 'secret'],
  ['AI_SHARE', 'ai', 'share', 'share'],
  ['SMTP_ENABLED', 'smtp', 'enabled', 'bool'],
  ['SMTP_HOST', 'smtp', 'host', 'str'],
  ['SMTP_PORT', 'smtp', 'port', 'num'],
  ['SMTP_SECURITY', 'smtp', 'security', 'enum', ['starttls', 'ssl', 'none']],
  ['SMTP_USER', 'smtp', 'user', 'str'],
  ['SMTP_PASSWORD', 'secret:smtpPass', null, 'secret'],
  ['SMTP_FROM_NAME', 'smtp', 'fromName', 'str'],
  ['SMTP_FROM', 'smtp', 'fromAddr', 'str'],
  ['SMTP_REPLY_TO', 'smtp', 'replyTo', 'str'],
  ['SMTP_TO', 'smtp', 'to', 'list'],
  ['EMAIL_DIGEST', 'smtp', 'digest', 'enum', ['off', 'daily', 'weekly']],
  ['EMAIL_OVERDUE', 'smtp', 'overdue', 'bool'],
  ['EMAIL_BLOCKERS', 'smtp', 'blockers', 'bool'],
  ['EMAIL_SUMMARY', 'smtp', 'summary', 'bool'],
  ['EMAIL_SIGNIN', 'smtp', 'signin', 'bool'],
  ['TUNNEL_ENABLED', 'tunnel', 'enabled', 'bool'],
  ['CLOUDFLARE_ACCOUNT_ID', 'tunnel', 'accountId', 'str'],
  ['CLOUDFLARE_API_TOKEN', 'secret:cfToken', null, 'secret'],
  ['APP_HOSTNAME', 'tunnel', 'appUrl', 'host'],
  ['ACCESS_EMAILS', 'tunnel', 'allow', 'list'],
];
const GROUPS = { settings: 'General', auth: 'Sign-in', ai: 'AI help', 'secret:aiKey': 'AI help', smtp: 'Email (SMTP)', 'secret:smtpPass': 'Email (SMTP)', tunnel: 'Cloudflare tunnel', 'secret:cfToken': 'Cloudflare tunnel' };
const SHARE = [['shareManual', 'manual'], ['shareSpecs', 'specs'], ['shareHistory', 'history'], ['shareNotes', 'notes']];

/** The variables set in env (an empty value counts: it says "blank"). */
export const lockedVars = env => VARS.map(v => v[0]).filter(k => env[k] !== undefined);
/** The variable that locks doc.field, if any. */
export const lockOf = (env, doc, field) => VARS.find(([k, d, f]) => d === doc && (f === field || (f === 'share' && /^share/.test(field))) && env[k] !== undefined)?.[0];

/** Doc patches for what env sets: { doc: { field: value } } and { 'secret:x': value }. Bad values are skipped with a warning. */
export function fromEnv(env, warn = () => {}) {
  const out = {};
  for (const [k, doc, field, kind, opts] of VARS) {
    const raw = env[k]; if (raw === undefined) continue;
    const s = String(raw).trim();
    if (kind === 'secret') { out[doc] = s; continue; }
    let v;
    if (kind === 'bool') v = ON.test(s);
    else if (kind === 'num') { v = +s; if (!Number.isInteger(v) || v < 0) { warn(`${k} should be a number; ignored.`); continue; } }
    else if (kind === 'enum') { if (!opts.includes(s)) { warn(`${k} should be one of ${opts.join(', ')}; ignored.`); continue; } v = s; }
    else if (kind === 'list') v = s.split(/[\s,]+/).filter(Boolean).join(doc === 'tunnel' ? '\n' : ', ');
    else if (kind === 'host') v = s ? 'https://' + hostOf(s) : '';
    else if (kind === 'share') { const on = s.split(/[\s,]+/); Object.assign(out[doc] ||= {}, Object.fromEntries(SHARE.map(([f, n]) => [f, on.includes(n)]))); continue; }
    else v = s;
    (out[doc] ||= {})[field] = v;
  }
  return out;
}

const q = v => { v = v == null ? '' : String(v); return /[\s#"'$=\\]/.test(v) ? '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' : v; };
/** The .env text for the saved settings. Secrets are placeholders unless asked for. */
export function toEnv(read, { secrets = false, port = 3000 } = {}) {
  const lines = ['# Garage settings — exported ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', '', '# General', `PORT=${port}`];
  let n = 1, group = 'General';
  for (const [k, doc, field, kind] of VARS) {
    if (GROUPS[doc] !== group) { group = GROUPS[doc]; lines.push('', '# ' + group); }
    let v;
    if (kind === 'secret') { const s = read(doc, ''); v = !s ? '' : secrets ? s : 'change-me-' + k.toLowerCase().replace(/_/g, '-'); }
    else if (kind === 'share') { const d = read(doc); v = SHARE.filter(([f]) => d[f]).map(([, x]) => x).join(','); }
    else { v = read(doc)[field]; if (kind === 'list') v = String(v || '').split(/[\s,]+/).filter(Boolean).join(','); if (kind === 'host') v = String(v || '').replace(/^https?:\/\//, ''); }
    lines.push(`${k}=${q(typeof v === 'boolean' ? String(v) : v ?? '')}`); n++;
  }
  return { text: lines.join('\n') + '\n', count: n };
}
