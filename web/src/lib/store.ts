// Loads and saves the garage. The demo build keeps everything in memory (nothing is saved).
import { useCallback, useEffect, useRef, useState } from 'react';
import { type Garage, SETTINGS0 } from './model.ts';
import { seed } from './seed.ts';

export const DEMO = !!import.meta.env.VITE_DEMO;

type Loaded = { garage: Garage; me: string | null };
export type Store = {
  g: Garage | null; me: string | null; error: string;
  update: (fn: (g: Garage) => Garage) => void;
  login: (userId: string, pin?: string, newPin?: string) => Promise<string>; // '' on success, else the reason
  addUser: (name: string, color: string, pin: string) => Promise<string>;
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
      const start = seed(null);
      const w = await call('PUT', '/api/state', { garage: start });
      if (!w.ok) { setError(w.json.error || 'Couldn’t set up the garage.'); return; }
      return load();
    }
    version.current = r.json.version;
    setS({ garage: fill(r.json.garage), me: r.json.me });
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = useCallback(async () => {
    const g = latest.current; if (!g || DEMO) return;
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

  const login = useCallback(async (userId: string, pin?: string, newPin?: string) => {
    if (DEMO) { setS(cur => cur && { ...cur, me: userId }); return ''; }
    const r = await call('POST', '/api/login', { userId, pin, newPin });
    if (!r.ok) return r.json.error || 'Couldn’t sign in';
    await load();
    return '';
  }, [load]);

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

  const logout = useCallback(() => {
    setS(cur => cur && { ...cur, me: null });
    if (!DEMO) call('POST', '/api/logout').catch(() => {});
  }, []);

  return { g: s?.garage || null, me: s?.me || null, error, update, login, addUser, logout };
}

/** Per-device UI state (which screen is open). Optional: a blocked or empty storage just starts at home. */
export function usePersisted<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => { try { const x = localStorage.getItem(key); return x ? { ...initial, ...JSON.parse(x) } : initial; } catch { return initial; } });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } }, [key, v]);
  return [v, setV];
}
