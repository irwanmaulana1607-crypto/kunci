import { apply, seed, publicView, accessOf } from '../shared/logic.js';

const KEY = 'kunci_state_v2';
const PIN = process.env.ADMIN_PIN || 'kunci123';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return res.status(200).json({ configured: false });
  const H = { Authorization: 'Bearer ' + token };
  const read = async () => {
    const r = await fetch(`${url}/get/${KEY}`, { headers: H });
    const j = await r.json();
    return j.result ? JSON.parse(j.result) : null;
  };
  const write = S => fetch(`${url}/set/${KEY}`, { method: 'POST', headers: H, body: JSON.stringify(S) });
  try {
    let S = await read();
    if (!S) { S = seed(); await write(S); }
    if (req.method === 'POST') {
      const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
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
