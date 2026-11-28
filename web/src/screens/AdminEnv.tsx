// Admin settings → Export .env. The server writes the file, so secrets never sit in the page unless asked for.
import { useEffect, useState } from 'react';
import type { Garage } from '../lib/model.ts';
import { card } from './AdminMail.tsx';
import { Toggle } from './Settings.tsx';

export function EnvTab({ g }: { g: Garage }) {
  const [secrets, setSecrets] = useState(false), [env, setEnv] = useState<{ text: string; count: number } | null>(null);
  const [err, setErr] = useState(''), [copied, setCopied] = useState(false);
  useEffect(() => {
    let on = true; setErr('');
    fetch('/api/admin/env' + (secrets ? '?secrets=1' : ''), { credentials: 'same-origin' }).then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => { if (!on) return; if (ok) setEnv(j); else setErr(j.error || 'Couldn’t build the file.'); })
      .catch(() => on && setErr('Can’t reach the Garage server.'));
    return () => { on = false; };
  }, [secrets, g]); // g: rebuild after any saved change
  const hasSecrets = !!(g.ai?.hasKey || g.smtp?.hasPass || g.tunnel?.hasToken);
  const download = () => { if (!env) return; const url = URL.createObjectURL(new Blob([env.text], { type: 'text/plain' })); const a = document.createElement('a'); a.href = url; a.download = '.env'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); };
  const copy = () => { if (!env) return; navigator.clipboard?.writeText(env.text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {}); };
  return (
    <div style={card}>
      <div>
        <div className="card-t">Export as .env</div>
        <div style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 1.45 }}>Every admin setting as environment variables, ready for Docker Compose. On start, the environment wins over what's saved in the app.</div>
        <div style={{ fontSize: 12, color: 'var(--warn)', lineHeight: 1.45, marginTop: 4 }}>Once Garage runs from this file, every setting it sets shows a lock in Admin settings and can only be changed in .env, so edits never quietly revert on restart.</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
        <div style={{ minWidth: 0 }}><div style={{ fontSize: 14 }}>Include secrets</div><div style={{ fontSize: 12, color: secrets ? 'var(--warn)' : 'var(--mut)' }}>{secrets ? 'API keys and passwords are written out in full. Treat this file like a password.' : hasSecrets ? 'Off: secrets are replaced with change-me placeholders. Fill them in on the server.' : 'No secrets saved yet.'}</div></div>
        <Toggle on={secrets} label="Include secrets" onClick={() => setSecrets(!secrets)} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><span className="label">.env</span><span className="mono mut" style={{ fontSize: 11 }}>{env ? env.count + ' variables' : ''}</span></div>
      {err ? <span role="alert" style={{ fontSize: 13, color: 'var(--down)' }}>{err}</span>
        : <pre aria-label=".env file" style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.6, background: 'var(--card2)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 16px', maxHeight: 460, overflow: 'auto', whiteSpace: 'pre', color: 'var(--fg)' }}>{env?.text || ''}</pre>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn-p" onClick={download} style={{ padding: '0 18px' }}>Download .env</button>
        <button type="button" className="btn" onClick={copy} style={{ padding: '0 16px' }}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <span style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 1.5 }}>Put the .env next to docker-compose.yml and run <span className="mono" style={{ color: 'var(--fg)' }}>docker compose up -d</span>. Keep the file out of git if it has secrets in it.</span>
    </div>
  );
}
