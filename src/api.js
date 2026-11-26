import { apply, seed, publicView, accessOf, DEFAULT_PIN } from '../shared/logic.js';
let mode = 'lokal';
const K = 'kunci_local_v2';
export const getMode = () => mode;
const rd = () => { try { return JSON.parse(localStorage.getItem(K)) || seed(); } catch { return seed(); } };

export async function load(pin) {
  try {
    const r = await fetch('/api/state', { headers: pin ? { 'x-pin': pin } : {} });
    const j = await r.json();
    if (j.configured) { mode = 'db'; return { catalog: j.catalog, data: j.data || null }; }
  } catch { /* tidak ada database: pakai mode lokal */ }
  mode = 'lokal';
  const S = rd();
  return { catalog: publicView(S), data: pin === DEFAULT_PIN ? S : null };
}

export async function act(type, payload, pin) {
  if (mode === 'db') {
    const r = await fetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, payload, pin }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Terjadi kesalahan. Coba lagi.');
    return j;
  }
  if (accessOf(type) === 'admin' && pin !== DEFAULT_PIN) throw new Error('PIN salah.');
  const { S, res } = apply(rd(), { type, payload });
  localStorage.setItem(K, JSON.stringify(S));
  return { res, catalog: publicView(S), data: accessOf(type) === 'admin' ? S : undefined };
}
