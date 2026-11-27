import { createHash, timingSafeEqual } from 'node:crypto';
import { Resend } from 'resend';

interface VercelRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface VercelResponse {
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
}

type OrderStatus = 'baru' | 'diproses' | 'dikirim' | 'selesai' | 'batal';
type OrderItem = { vid: string; nm: string; qty: number; harga: number };
type StatusEvent = { status: OrderStatus; t: string };
type StoredOrder = {
  no: string;
  nama: string;
  email: string;
  hp: string;
  t: string;
  status: OrderStatus;
  items: OrderItem[];
  total: number;
  hist: StatusEvent[];
};

const localRateLimits = new Map<string, { count: number; expiresAt: number }>();
const localSent = new Map<string, number>();
const localLocks = new Set<string>();
const STATE_KEY = 'kunci_state_v2';
const STATUS_LABEL: Record<OrderStatus, string> = {
  baru: 'Baru',
  diproses: 'Diproses',
  dikirim: 'Siap Dikirim',
  selesai: 'Selesai',
  batal: 'Dibatalkan',
};
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const money = (value: number) => `Rp${value.toLocaleString('id-ID')}`;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[char]!));

function header(req: VercelRequest, name: string): string {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function sameSecret(a: string, b: string): boolean {
  const left = Uint8Array.from(Buffer.from(a));
  const right = Uint8Array.from(Buffer.from(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function renderEmail(order: StoredOrder, event: 'confirmation' | 'status', trackingUrl: string): string {
  const items = order.items.map(item => `
    <tr>
      <td style="padding:12px 8px;border-bottom:1px solid #f0e5df">
        <strong>${escapeHtml(item.nm)}</strong>
        <div style="margin-top:4px;color:#786861;font-size:13px">${item.qty} × ${money(item.harga)}</div>
      </td>
      <td style="padding:12px 8px;border-bottom:1px solid #f0e5df;text-align:right;white-space:nowrap">${money(item.qty * item.harga)}</td>
    </tr>`).join('');
  const greeting = event === 'confirmation' ? 'Pesanan Anda sudah kami terima.' : 'Ada pembaruan pada pesanan Anda.';
  const date = new Date(order.t).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
  return `<!doctype html>
<html lang="id"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><title>Konfirmasi Pesanan KUNCI</title></head>
<body style="margin:0;padding:24px 12px;background:#fbf8f3;font-family:Arial,Helvetica,sans-serif;color:#231917">
  <table role="presentation" style="width:100%;max-width:620px;margin:0 auto;border-collapse:collapse;background:#fff;border:1px solid #eaded4;border-radius:16px;overflow:hidden">
    <tr><td style="padding:26px 28px;background:#d94e2b;color:#fff">
      <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.85">Pedasan Kunchung</div>
      <div style="margin-top:4px;font-size:30px;font-weight:800;letter-spacing:2px">KUNCI</div>
    </td></tr>
    <tr><td style="padding:28px">
      <h1 style="margin:0 0 10px;font-size:22px">Halo ${escapeHtml(order.nama)},</h1>
      <p style="margin:0 0 22px;color:#62534d;line-height:1.6">${greeting} Terima kasih telah berbelanja di Pedasan Kunchung.</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr><td style="padding:7px 0;color:#786861">Nomor pesanan</td><td style="padding:7px 0;text-align:right;font-weight:700">${escapeHtml(order.no)}</td></tr>
        <tr><td style="padding:7px 0;color:#786861">Tanggal dan waktu</td><td style="padding:7px 0;text-align:right">${escapeHtml(date)}</td></tr>
        <tr><td style="padding:7px 0;color:#786861">Status pesanan</td><td style="padding:7px 0;text-align:right;font-weight:700">${STATUS_LABEL[order.status]}</td></tr>
      </table>
      <h2 style="margin:0 0 8px;font-size:16px">Ringkasan pesanan</h2>
      <table role="presentation" style="width:100%;border-collapse:collapse">${items}
        <tr><td style="padding:16px 8px 0">Subtotal</td><td style="padding:16px 8px 0;text-align:right">${money(order.total)}</td></tr>
        <tr><td style="padding:16px 8px 0;font-weight:700">Total pesanan</td><td style="padding:16px 8px 0;text-align:right;font-weight:700;color:#d94e2b">${money(order.total)}</td></tr>
      </table>
      <p style="margin:24px 0 16px;color:#62534d;line-height:1.6">Lihat perkembangan pesanan Anda melalui halaman pelacakan KUNCI.</p>
      <p style="margin:0 0 24px"><a href="${escapeHtml(trackingUrl)}" style="display:inline-block;padding:12px 18px;border-radius:9px;background:#d94e2b;color:#fff;text-decoration:none;font-weight:700">Lacak pesanan</a></p>
      <p style="margin:0;color:#786861;font-size:13px;line-height:1.6">Simpan nomor pesanan dan gunakan alamat email ini untuk melihat status terbaru.</p>
    </td></tr>
  </table>
</body></html>`;
}

async function redisPipeline(url: string, token: string, commands: unknown[][]): Promise<Array<{ result?: unknown; error?: string }>> {
  const response = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  const results = await response.json() as Array<{ result?: unknown; error?: string }>;
  if (!response.ok || results.some(result => result.error)) throw new Error('Shared storage request failed.');
  return results;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' });

  const host = header(req, 'x-forwarded-host') || header(req, 'host');
  const origin = header(req, 'origin');
  try {
    if (!host || !origin || new URL(origin).host !== host.split(',')[0].trim()) {
      return res.status(403).json({ ok: false, error: 'Request origin is not allowed.' });
    }
  } catch {
    return res.status(403).json({ ok: false, error: 'Request origin is not allowed.' });
  }

  let parsedBody: unknown;
  try {
    parsedBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body.' });
  }
  if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
    return res.status(400).json({ ok: false, error: 'Invalid request body.' });
  }
  const body = parsedBody as { orderNo?: unknown; event?: unknown; order?: unknown };
  const orderNo = typeof body.orderNo === 'string' ? body.orderNo.trim().toUpperCase() : '';
  const event = body.event;
  if (!/^KC-\d{4,}$/.test(orderNo) || (event !== 'confirmation' && event !== 'status')) {
    return res.status(400).json({ ok: false, error: 'Invalid order email request.' });
  }
  if (event === 'status' && !sameSecret(header(req, 'x-admin-pin'), process.env.ADMIN_PIN || 'kunci123')) {
    return res.status(401).json({ ok: false, error: 'Admin authorization required.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const storage = url && token ? { url, token } : null;
  if (!apiKey || !from) return res.status(503).json({ ok: false, error: 'Konfigurasi Resend belum lengkap.' });
  const testingSender = /onboarding@resend\.dev/i.test(from);
  const recipient = testingSender ? process.env.RESEND_TEST_TO?.trim().toLowerCase() : '';
  if (testingSender && (!recipient || !EMAIL_PATTERN.test(recipient))) {
    return res.status(503).json({ ok: false, error: 'Atur RESEND_TEST_TO ke alamat pemilik akun Resend yang diizinkan.' });
  }
  if (!storage && !testingSender) {
    return res.status(503).json({ ok: false, error: 'Pengiriman ke konsumen memerlukan penyimpanan pesanan bersama.' });
  }

  let lockKey = '';
  let localLock = false;
  let localLockKey = '';
  try {
    let order: StoredOrder | undefined;
    if (storage) {
      const stateResponse = await fetch(`${storage.url}/get/${STATE_KEY}`, { headers: { Authorization: `Bearer ${storage.token}` } });
      if (!stateResponse.ok) throw new Error('Could not read shared order storage.');
      const stateResult = await stateResponse.json() as { result?: string | null };
      if (!stateResult.result) return res.status(404).json({ ok: false, error: 'Pesanan tidak ditemukan.' });
      const state = JSON.parse(stateResult.result) as { o?: StoredOrder[] };
      order = state.o?.find(item => item.no === orderNo);
    } else {
      const localOrder = body.order as StoredOrder | undefined;
      if (localOrder?.no === orderNo) order = localOrder;
    }
    if (!order) return res.status(404).json({ ok: false, error: 'Pesanan tidak ditemukan.' });

    if (!order.nama || order.nama.length > 50 || !EMAIL_PATTERN.test(order.email || '') || order.email.length > 254
      || !/^KC-\d{4,}$/.test(order.no) || !/^\d{9,15}$/.test(order.hp || '')
      || !['baru', 'diproses', 'dikirim', 'selesai', 'batal'].includes(order.status)
      || !Array.isArray(order.items) || order.items.length < 1 || order.items.length > 100
      || !Number.isSafeInteger(order.total) || order.total < 0
      || !Number.isFinite(Date.parse(order.t))) {
      return res.status(422).json({ ok: false, error: 'Data pesanan tersimpan tidak valid untuk email.' });
    }
    if (testingSender && order.email.toLowerCase() !== recipient) {
      return res.status(403).json({ ok: false, error: 'Untuk pengujian Resend, gunakan alamat penerima uji yang diizinkan saat checkout.' });
    }
    let total = 0;
    for (const item of order.items) {
      if (!item || typeof item.nm !== 'string' || !item.nm.trim() || item.nm.length > 160
        || !Number.isSafeInteger(item.qty) || item.qty <= 0
        || !Number.isSafeInteger(item.harga) || item.harga < 0) {
        return res.status(422).json({ ok: false, error: 'Item pesanan tidak valid.' });
      }
      total += item.qty * item.harga;
      if (!Number.isSafeInteger(total)) return res.status(422).json({ ok: false, error: 'Total pesanan tidak valid.' });
    }
    if (total !== order.total) return res.status(422).json({ ok: false, error: 'Total pesanan tidak sesuai dengan item.' });

    const history = Array.isArray(order.hist) ? order.hist : [];
    const statusEvent = event === 'confirmation' ? history[0] : history[history.length - 1];
    if (!statusEvent || (event === 'status' && history.length < 2)
      || !['baru', 'diproses', 'dikirim', 'selesai', 'batal'].includes(statusEvent.status)
      || !Number.isFinite(Date.parse(statusEvent.t))) {
      return res.status(409).json({ ok: false, error: 'Peristiwa email tidak cocok dengan riwayat pesanan.' });
    }

    const ipHeader = header(req, 'x-real-ip') || header(req, 'x-forwarded-for').split(',')[0].trim() || 'unknown';
    const ipHash = createHash('sha256').update(ipHeader).digest('hex');
    const eventId = event === 'confirmation' ? 'confirmation' : `status-${statusEvent.status}-${statusEvent.t}`;
    const keyHash = createHash('sha256').update(`${order.no}:${eventId}`).digest('hex');
    const sentKey = `kunci:email-sent:${keyHash}`;
    const lockKeyCandidate = `kunci:email-lock:${keyHash}`;
    if (storage) {
      const rateResults = await redisPipeline(storage.url, storage.token, [
        ['INCR', `kunci:email-limit:${ipHash}`],
        ['EXPIRE', `kunci:email-limit:${ipHash}`, 900],
      ]);
      if (Number(rateResults[0]?.result) > 8) {
        return res.status(429).json({ ok: false, error: 'Terlalu banyak permintaan email. Coba lagi nanti.' });
      }
      const sent = await redisPipeline(storage.url, storage.token, [['GET', sentKey]]);
      if (sent[0]?.result) return res.status(200).json({ ok: true, alreadySent: true, recipient: testingSender ? 'test' : 'customer' });
      const lock = await redisPipeline(storage.url, storage.token, [['SET', lockKeyCandidate, '1', 'NX', 'EX', 120]]);
      if (lock[0]?.result !== 'OK') return res.status(409).json({ ok: false, error: 'Email untuk pesanan ini sedang diproses.' });
      lockKey = lockKeyCandidate;
    } else {
      const now = Date.now();
      const rate = localRateLimits.get(ipHash);
      if (!rate || rate.expiresAt <= now) localRateLimits.set(ipHash, { count: 1, expiresAt: now + 900000 });
      else rate.count += 1;
      if ((localRateLimits.get(ipHash)?.count || 0) > 3) {
        return res.status(429).json({ ok: false, error: 'Terlalu banyak permintaan email. Coba lagi nanti.' });
      }
      for (const [sentId, sentAt] of localSent) if (sentAt <= now - 86400000) localSent.delete(sentId);
      if (localSent.has(keyHash)) return res.status(200).json({ ok: true, alreadySent: true, recipient: 'test' });
      if (localLocks.has(keyHash)) return res.status(409).json({ ok: false, error: 'Email untuk pesanan ini sedang diproses.' });
      localLocks.add(keyHash);
      localLock = true;
      localLockKey = keyHash;
    }

    const protocol = header(req, 'x-forwarded-proto').split(',')[0].trim() || new URL(origin).protocol.slice(0, -1);
    const trackingUrl = `${protocol}://${host}/tracking`;
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to: recipient || order.email.toLowerCase(),
      subject: `${event === 'confirmation' ? 'Konfirmasi' : 'Pembaruan'} Pesanan KUNCI - ${order.no}`,
      html: renderEmail(order, event, trackingUrl),
      text: [
        `Halo ${order.nama},`,
        event === 'confirmation' ? 'Pesanan Anda sudah kami terima.' : 'Ada pembaruan pada pesanan Anda.',
        `Nomor pesanan: ${order.no}`,
        `Tanggal: ${new Date(order.t).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
        `Status: ${STATUS_LABEL[order.status]}`,
        ...order.items.map(item => `${item.nm} — ${item.qty} x ${money(item.harga)} = ${money(item.qty * item.harga)}`),
        `Subtotal: ${money(order.total)}`,
        `Total: ${money(order.total)}`,
        `Lacak pesanan: ${trackingUrl}`,
      ].join('\n'),
    }, { idempotencyKey: `kunci-${keyHash}` });
    if (result.error) {
      console.error('Resend email delivery failed:', result.error.message);
      if (storage) await redisPipeline(storage.url, storage.token, [['DEL', lockKey]]);
      else localLocks.delete(keyHash);
      lockKey = '';
      localLock = false;
      localLockKey = '';
      return res.status(502).json({ ok: false, error: 'Email gagal dikirim. Pesanan tetap tersimpan; silakan coba kirim ulang.' });
    }
    if (storage) {
      await redisPipeline(storage.url, storage.token, [
        ['SET', sentKey, result.data?.id || 'sent', 'EX', 2592000],
        ['DEL', lockKey],
      ]);
      lockKey = '';
    } else {
      localSent.set(keyHash, Date.now());
      localLocks.delete(keyHash);
      localLock = false;
      localLockKey = '';
    }
    return res.status(200).json({ ok: true, id: result.data?.id, recipient: testingSender ? 'test' : 'customer' });
  } catch (error) {
    console.error('Email endpoint error:', error instanceof Error ? error.message : 'Unknown error');
    if (localLock) {
      localLocks.delete(localLockKey);
    } else if (lockKey && storage) {
      try { await redisPipeline(storage.url, storage.token, [['DEL', lockKey]]); } catch { /* lock expires automatically */ }
    }
    return res.status(500).json({ ok: false, error: 'Tidak dapat memproses email saat ini.' });
  }
}
