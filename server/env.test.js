import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromEnv, lockedVars, lockOf, toEnv } from './env.js';

test('.env round trip: export, read back, same settings; secrets are placeholders unless asked', () => {
  const docs = {
    settings: { units: 'mi', currency: '€', other: 1 }, auth: { signins: true, tfaTotp: true, tfaRequire: 'admins' },
    ai: { enabled: true, provider: 'openai', model: 'gpt-x', baseUrl: 'http://h:1/v1', shareSpecs: true, shareHistory: false, shareNotes: true, shareManual: false },
    smtp: { enabled: true, host: 'smtp.x.com', port: 465, security: 'ssl', user: 'me', fromName: 'My Garage', fromAddr: 'g@x.com', replyTo: '', to: 'a@x.com, b@x.com', digest: 'daily', overdue: true, blockers: false, summary: true, signin: false },
    tunnel: { enabled: false, accountId: 'a'.repeat(32), appUrl: 'https://garage.x.com', allow: 'me@x.com\n@fam.com' },
    'secret:aiKey': 'sk-1', 'secret:smtpPass': 'p w"d', 'secret:cfToken': '',
  };
  const read = (d, def) => docs[d] ?? def;
  const plain = toEnv(read).text, full = toEnv(read, { secrets: true }).text;
  assert.match(plain, /^AI_API_KEY=change-me-ai-api-key$/m);
  assert.match(plain, /^CLOUDFLARE_API_TOKEN=$/m);
  assert.match(plain, /^SMTP_FROM_NAME="My Garage"$/m);
  const env = Object.fromEntries(full.split('\n').filter(l => /^[A-Z]/.test(l)).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1); if (v.startsWith('"')) v = JSON.parse(v); return [l.slice(0, i), v]; }));
  const back = fromEnv(env);
  assert.deepEqual(back.settings, { units: 'mi', currency: '€' });
  assert.deepEqual(back.auth, docs.auth);
  assert.deepEqual(back.ai, docs.ai);
  assert.deepEqual(back.smtp, docs.smtp);
  assert.deepEqual(back.tunnel, docs.tunnel);
  assert.deepEqual([back['secret:aiKey'], back['secret:smtpPass'], back['secret:cfToken']], ['sk-1', 'p w"d', '']);
  // Locks, and bad values are skipped with a warning.
  const warns = []; assert.deepEqual(fromEnv({ SMTP_PORT: 'abc', AI_PROVIDER: 'x' }, w => warns.push(w)), {}); assert.equal(warns.length, 2);
  assert.deepEqual(lockedVars({ AI_MODEL: '', PATH: '/bin' }), ['AI_MODEL']);
  assert.equal(lockOf({ AI_SHARE: 'specs' }, 'ai', 'shareNotes'), 'AI_SHARE');
  assert.equal(lockOf({ AI_API_KEY: 'k' }, 'secret:aiKey', null), 'AI_API_KEY');
  assert.equal(lockOf({ AI_MODEL: 'm' }, 'ai', 'provider'), undefined);
});
