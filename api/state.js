import { apply, seed, publicView, accessOf } from '../shared/logic.js';
import { createHash } from 'node:crypto';

const KEY = 'kunci_state_v2';
const PIN = process.env.ADMIN_PIN || 'kunci123';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return res.status(200).json({ configured: false });
  const H = { Authorization: 'Bearer ' + token };
  const rateLimitTrack = async () => {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = String(req.headers['x-real-ip'] || (Array.isArray(forwarded) ? forwarded[0] : forwarded) || 'unknown').split(',')[0].trim();
    const key = 'kunci:tracking-limit:' + createHash('sha256').update(ip).digest('hex');
    const r = await fetch(`${url}/pipeline`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify([['INCR', key], ['EXPIRE', key, 900]]) });
    const result = await r.json();
    if (!r.ok || result[0]?.error) throw new Error('Rate limiter unavailable.');
    return Number(result[0]?.result) <= 12;
  };
  const read = async () => {
    const r = await fetch(`${url}/get/${KEY}`, { headers: H });
    const j = await r.json();
    return j.result ? JSON.parse(j.result) : null;
  };
  const write = async S => {
    const r = await fetch(`${url}/set/${KEY}`, { method: 'POST', headers: H, body: JSON.stringify(S) });
    if (!r.ok) throw new Error('Database write failed.');
  };
  try {
    let S = await read();
    if (!S) { S = seed(); await write(S); }
    if (req.method === 'POST') {
      const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      if (b.type === 'order.track') {
        if (!(await rateLimitTrack())) return res.status(429).json({ error: 'Terlalu banyak percobaan pelacakan. Coba lagi beberapa saat.' });
      }
      const admin = accessOf(b.type) === 'admin';
      if (admin && b.pin !== PIN) return res.status(401).json({ error: 'PIN salah.' });
      let out;
      try { out = apply(S, { type: b.type, payload: b.payload }); }
      catch (e) { return res.status(400).json({ error: e.message }); }
      if (JSON.stringify(out.S) !== JSON.stringify(S)) await write(out.S);
      return res.status(200).json({ ok: true, res: out.res, catalog: publicView(out.S), data: admin ? out.S : undefined });
    }
    const isAdmin = req.headers['x-pin'] === PIN;
    return res.status(200).json({ configured: true, catalog: publicView(S), data: isAdmin ? S : undefined });
  } catch (e) {
    return res.status(500).json({ error: 'Database tidak dapat diakses.' });
  }
}
