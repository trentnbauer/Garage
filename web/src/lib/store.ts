// Loads and saves the garage. The demo build keeps everything in memory (nothing is saved).
import { useCallback, useEffect, useRef, useState } from 'react';
import { type Garage, SETTINGS0 } from './model.ts';
import { seed } from './seed.ts';

export const DEMO = !!import.meta.env.VITE_DEMO;

type Loaded = { garage: Garage; me: string | null };
export type Store = {
  g: Garage | null; me: string | null; error: string;
  update: (fn: (g: Garage) => Garage) => void;
  /** Sign in. `ticket` means a second step is needed: send the authenticator code to loginTotp. */
  login: (userId: string, cred: { pin?: string; newPin?: string; code?: string }) => Promise<{ error?: string; ticket?: string }>;
  loginTotp: (ticket: string, code: string) => Promise<string>; // '' on success, else the reason
  /** Account and admin calls; reloads the garage after a change. */
  api: (method: string, path: string, body?: unknown) => Promise<{ ok: boolean; json: Record<string, unknown> & { error?: string } }>;
  addUser: (name: string, color: string, pin: string) => Promise<string>;
  /** Ask the admin-configured AI. Nothing in the garage changes, so nothing reloads. */
  ai: (prompt: string) => Promise<{ text?: string; error?: string }>;
  logout: () => void;
};

async function call(method: string, path: string, body?: unknown) {
  const r = await fetch(path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  const json = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json };
}

const fill = (g: Garage): Garage => ({ ...g, settings: { ...SETTINGS0, ...(g.settings || {}) }, shelf: g.shelf || [], log: g.log || [], notes: g.notes || {}, boards: g.boards || {} });

export function useStore(): Store {
  const [s, setS] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const version = useRef(0), timer = useRef<number>(), latest = useRef<Garage | null>(null);

  const load = useCallback(async () => {
    if (DEMO) { setS({ garage: seed(), me: null }); return; }
    const r = await call('GET', '/api/state').catch(() => null);
    if (!r?.ok) { setError('Can’t reach the Garage server.'); return; }
    if (r.json.empty) {
      // First run: start from the sample garage so there is something to look at.
      const start = seed('u1'); // entries are credited to the first profile, the admin
      const w = await call('PUT', '/api/state', { garage: start });
      if (!w.ok) { setError(w.json.error || 'Couldn’t set up the garage.'); return; }
      return load();
    }
    // Anything still queued was built on the old copy; the fresh copy replaces it.
    window.clearTimeout(timer.current); latest.current = null;
    version.current = r.json.version;
    setS({ garage: fill(r.json.garage), me: r.json.me });
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = useCallback(async () => {
    const g = latest.current; if (!g || DEMO) return;
    latest.current = null;
    const r = await call('PUT', '/api/state', { version: version.current, garage: g });
    if (r.ok) { version.current = r.json.version; setError(''); }
    else if (r.status === 409) { setError(r.json.error); load(); }
    else setError(r.json.error || 'Couldn’t save. Your last change may be lost.');
  }, [load]);

  const update = useCallback((fn: (g: Garage) => Garage) => {
    setS(cur => {
      if (!cur) return cur;
      const garage = fn(cur.garage); latest.current = garage;
      window.clearTimeout(timer.current); timer.current = window.setTimeout(save, 400);
      return { ...cur, garage };
    });
  }, [save]);

  const login = useCallback(async (userId: string, cred: { pin?: string; newPin?: string; code?: string }) => {
    if (DEMO) { setS(cur => cur && { ...cur, me: userId }); return {}; }
    const r = await call('POST', '/api/login', { userId, ...cred });
    if (!r.ok) return { error: r.json.error || 'Couldn’t sign in' };
    if (r.json.tfa) return { ticket: r.json.ticket as string };
    await load();
    return {};
  }, [load]);

  const loginTotp = useCallback(async (ticket: string, code: string) => {
    const r = await call('POST', '/api/login/totp', { ticket, code });
    if (!r.ok) return r.json.error || 'Couldn’t sign in';
    await load();
    return '';
  }, [load]);

  const api = useCallback(async (method: string, path: string, body?: unknown) => {
    if (DEMO) return { ok: false, json: { error: 'The demo doesn’t save account or admin changes.' } };
    // Send any queued edit first, so the reload after this call can't drop it.
    if (latest.current) { window.clearTimeout(timer.current); await save(); }
    const r = await call(method, path, body).catch(() => ({ ok: false, status: 0, json: { error: 'Can’t reach the Garage server.' } }));
    if (r.ok) await load();
    return { ok: r.ok, json: r.json };
  }, [load, save]);

  const addUser = useCallback(async (name: string, color: string, pin: string) => {
    if (DEMO) {
      const id = 'u' + Date.now();
      setS(cur => cur && { me: id, garage: { ...cur.garage, users: [...cur.garage.users, { id, name, color, role: 'member', hasPin: !!pin }] } });
      return '';
    }
    const r = await call('POST', '/api/users', { name, color, pin: pin || undefined });
    if (!r.ok) return r.json.error || 'Couldn’t add that person';
    await load();
    return '';
  }, [load]);

  const ai = useCallback(async (prompt: string) => {
    if (DEMO) return { error: 'The demo can’t reach an AI provider. On your own server an admin sets one up in Admin settings → AI help.' };
    const r = await call('POST', '/api/ai', { prompt }).catch(() => ({ ok: false, status: 0, json: { error: 'Can’t reach the Garage server.' } }));
    return r.ok ? { text: String(r.json.text || '') } : { error: r.json.error || 'The AI request failed.' };
  }, []);

  const logout = useCallback(() => {
    setS(cur => cur && { ...cur, me: null });
    if (!DEMO) call('POST', '/api/logout').catch(() => {});
  }, []);

  return { g: s?.garage || null, me: s?.me || null, error, update, login, loginTotp, api, addUser, ai, logout };
}

/** Per-device UI state (which screen is open). Optional: a blocked or empty storage just starts at home. */
export function usePersisted<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => { try { const x = localStorage.getItem(key); return x ? { ...initial, ...JSON.parse(x) } : initial; } catch { return initial; } });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } }, [key, v]);
  return [v, setV];
}
