// Logika bisnis KUNCI: dipakai server (api/state.js) dan browser (mode lokal).
export const DEFAULT_PIN = 'kunci123';
export const PUBLIC_TYPES = ['order.create', 'order.track'];
export const MITRA_TYPES = ['partner.me', 'partner.report', 'partner.restok'];
export const accessOf = t => PUBLIC_TYPES.includes(t) ? 'public' : MITRA_TYPES.includes(t) ? 'mitra' : 'admin';
export const JENIS = { awal: 'Stok awal', masuk: 'Stok masuk', keluar: 'Stok keluar', sesuai: 'Penyesuaian', pesanan: 'Pesanan masuk', batal: 'Pesanan dibatalkan', mitra: 'Kirim ke mitra', cfd: 'Jual langsung/CFD' };
export const STATUS = { baru: 'Baru', diproses: 'Diproses', dikirim: 'Dikirim', selesai: 'Selesai', batal: 'Dibatalkan' };
export const NEXT = { baru: ['diproses', 'batal'], diproses: ['dikirim', 'batal'], dikirim: ['selesai', 'batal'] };
export const stat = v => v.stok <= 0 ? 'habis' : v.stok <= v.min ? 'menipis' : 'aman';
const uid = () => Math.random().toString(36).slice(2, 10);
const E = m => { throw new Error(m); };
const int = (x, min, msg) => { const n = Number(x); return Number.isInteger(n) && n >= min ? n : E(msg); };
const txt = (x, msg, max = 60) => { const s = String(x ?? '').trim(); return s ? s.slice(0, max) : E(msg); };
const label = v => `${v.produk} ${v.varian} ${v.ukuran}`;

export function seed() {
  const base = [['Basreng', 'Pedas Daun Jeruk', '100 gr', 15000, 20, 8], ['Basreng', 'Original', '100 gr', 14000, 20, 60], ['Basreng', 'Balado', '100 gr', 15000, 15, 0], ['Basreng', 'Level 5 Ekstra Pedas', '100 gr', 16000, 15, 35]];
  const S = { n: 0, v: [], l: [], o: [], m: [], s: [], r: [], q: [] }, t = new Date().toISOString();
  base.forEach(b => {
    const v = { id: uid(), produk: b[0], varian: b[1], ukuran: b[2], harga: b[3], min: b[4], stok: b[5], aktif: true };
    S.v.push(v);
    if (b[5] > 0) S.l.push({ id: uid(), vid: v.id, jenis: 'awal', jumlah: b[5], setelah: b[5], t, oleh: 'Contoh', cat: 'Data contoh, silakan diganti' });
  });
  S.m.push({ id: uid(), nama: 'Kantin ITS', lokasi: 'ITS Surabaya', kode: 'ITS01', stok: {} }, { id: uid(), nama: 'Kantin Telkom University', lokasi: 'Surabaya', kode: 'TEL01', stok: {} });
  return S;
}
export const publicView = S => S.v.filter(v => v.aktif).map(({ id, produk, varian, ukuran, harga, stok }) => ({ id, produk, varian, ukuran, harga, stok }));

function lines(S, items) {
  const map = {};
  (items || []).forEach(i => { const q = Number(i.qty); if (q > 0) map[i.vid] = (map[i.vid] || 0) + int(q, 1, 'Jumlah harus bilangan bulat.'); });
  const out = Object.entries(map).map(([vid, qty]) => { const v = S.v.find(x => x.id === vid); return v && v.aktif ? { v, qty } : E('Varian tidak tersedia.'); });
  return out.length ? out : E('Pilih minimal satu varian.');
}
const snap = ls => ls.map(({ v, qty }) => ({ vid: v.id, nm: label(v), qty, harga: v.harga }));
const sum = it => it.reduce((a, i) => a + i.qty * i.harga, 0);

export function apply(S0, a, now = new Date().toISOString()) {
  const S = JSON.parse(JSON.stringify(S0)); S.q ||= []; S.r ||= []; S.s ||= [];
  const p = a.payload || {}, V = i => S.v.find(v => v.id === i);
  const log = (v, jenis, d, oleh, cat) => { v.stok += d; S.l.push({ id: uid(), vid: v.id, jenis, jumlah: d, setelah: v.stok, t: now, oleh, cat: cat || '' }); };
  const mitra = k => S.m.find(m => m.kode === String(k || '').trim().toUpperCase()) || E('Kode mitra tidak ditemukan.');
  let res = {};
  switch (a.type) {
    case 'product.save': {
      const d = { produk: txt(p.produk, 'Isi nama produk.', 40), varian: txt(p.varian, 'Isi varian rasa.', 40), ukuran: txt(p.ukuran, 'Isi ukuran kemasan.', 30), harga: int(p.harga, 0, 'Harga harus angka 0 atau lebih.'), min: int(p.min, 0, 'Batas minimum harus angka 0 atau lebih.') };
      const key = x => [x.produk, x.varian, x.ukuran].join('|').toLowerCase();
      if (S.v.some(x => x.id !== p.id && key(x) === key(d))) E('Varian ini sudah ada (produk, rasa, dan ukuran sama).');
      if (p.id) Object.assign(V(p.id) || E('Varian tidak ditemukan.'), d);
      else { const v = { id: uid(), ...d, stok: 0, aktif: true }; S.v.push(v); const n = Number(p.awal) || 0; if (n > 0) log(v, 'awal', int(n, 1, 'Stok awal harus bilangan bulat.'), 'Admin', 'Stok awal saat varian dibuat'); }
      break;
    }
    case 'product.toggle': { const v = V(p.id) || E('Varian tidak ditemukan.'); v.aktif = !v.aktif; break; }
    case 'stock.add': {
      const v = V(p.vid); if (!v || !v.aktif) E('Pilih varian aktif.');
      if (!['awal', 'masuk', 'keluar', 'sesuai'].includes(p.jenis)) E('Jenis perubahan tidak valid.');
      const oleh = txt(p.oleh, 'Isi nama pencatat.', 40), n = int(p.jumlah, p.jenis === 'sesuai' ? 0 : 1, p.jenis === 'sesuai' ? 'Isi stok hasil hitung fisik (0 atau lebih).' : 'Jumlah harus bilangan bulat lebih dari 0.');
      if (p.jenis === 'keluar' && n > v.stok) E(`Stok keluar ${n} melebihi stok tersedia (${v.stok}).`);
      log(v, p.jenis, p.jenis === 'sesuai' ? n - v.stok : p.jenis === 'keluar' ? -n : n, oleh, String(p.cat || '').slice(0, 120)); break;
    }
    case 'order.create': {
      const nama = txt(p.nama, 'Isi nama pemesan.', 50), hp = String(p.hp || '').replace(/\D/g, '');
      if (hp.length < 9 || hp.length > 15) E('Nomor WhatsApp tidak valid.');
      const ls = lines(S, p.items);
      ls.forEach(({ v, qty }) => { if (qty > v.stok) E(`Stok ${v.varian} tersisa ${v.stok}.`); });
      const no = 'KC-' + String(++S.n).padStart(4, '0');
      ls.forEach(({ v, qty }) => log(v, 'pesanan', -qty, nama, no));
      const items = snap(ls), total = sum(items);
      S.o.push({ id: uid(), no, nama, hp, cat: String(p.cat || '').slice(0, 120), items, total, status: 'baru', t: now, hist: [{ status: 'baru', t: now }] });
      res = { no, total }; break;
    }
    case 'order.track': {
      const hp = String(p.hp || '').replace(/\D/g, ''), o = S.o.find(x => x.no === String(p.no || '').trim().toUpperCase());
      if (!o || hp.length < 6 || o.hp.slice(-6) !== hp.slice(-6)) E('Pesanan tidak ditemukan. Periksa kode dan nomor WhatsApp.');
      res = { no: o.no, nama: o.nama, status: o.status, total: o.total, t: o.t, items: o.items, hist: o.hist }; break;
    }
    case 'order.status': {
      const o = S.o.find(x => x.id === p.id) || E('Pesanan tidak ditemukan.');
      if (!(NEXT[o.status] || []).includes(p.status)) E('Perubahan status tidak diizinkan.');
      if (p.status === 'batal') o.items.forEach(i => { const v = V(i.vid); if (v) log(v, 'batal', i.qty, 'Admin', o.no); });
      if (p.status === 'selesai') S.s.push({ id: uid(), t: now, kanal: 'online', ref: o.no, items: o.items, total: o.total });
      o.status = p.status; o.hist.push({ status: p.status, t: now }); break;
    }
    case 'partner.save': {
      const kode = txt(p.kode, 'Isi kode mitra.', 12).toUpperCase().replace(/\s/g, '');
      if (kode.length < 4) E('Kode mitra minimal 4 karakter.');
      if (S.m.some(m => m.kode === kode)) E('Kode mitra sudah dipakai.');
      S.m.push({ id: uid(), nama: txt(p.nama, 'Isi nama mitra.', 40), lokasi: String(p.lokasi || '').slice(0, 60), kode, stok: {} }); break;
    }
    case 'partner.ship': {
      const m = S.m.find(x => x.id === p.mid) || E('Mitra tidak ditemukan.'), ls = lines(S, p.items);
      ls.forEach(({ v, qty }) => { if (qty > v.stok) E(`Stok pusat ${v.varian} tersisa ${v.stok}.`); });
      ls.forEach(({ v, qty }) => { log(v, 'mitra', -qty, 'Admin', m.nama); m.stok[v.id] = (m.stok[v.id] || 0) + qty; }); break;
    }
    case 'cfd.sale': {
      const ls = lines(S, p.items);
      ls.forEach(({ v, qty }) => { if (qty > v.stok) E(`Stok pusat ${v.varian} tersisa ${v.stok}.`); });
      const ref = String(p.lokasi || '').trim().slice(0, 50) || 'CFD', items = snap(ls);
      ls.forEach(({ v, qty }) => log(v, 'cfd', -qty, 'Admin', ref));
      S.s.push({ id: uid(), t: now, kanal: 'cfd', ref, items, total: sum(items) }); break;
    }
    case 'restok.done': { const q = S.q.find(x => x.id === p.id) || E('Permintaan tidak ditemukan.'); q.status = 'selesai'; break; }
    case 'partner.me': {
      const m = mitra(p.kode);
      res = { nama: m.nama, lokasi: m.lokasi, rows: S.v.filter(v => v.aktif).map(v => ({ vid: v.id, nm: `${v.varian} (${v.ukuran})`, harga: v.harga, stok: m.stok[v.id] || 0 })) }; break;
    }
    case 'partner.report': {
      const m = mitra(p.kode), rows = [], items = [];
      (p.items || []).forEach(i => {
        const v = V(i.vid); if (!v) return;
        const have = m.stok[v.id] || 0, t = i.terjual === '' || i.terjual == null ? 0 : int(i.terjual, 0, 'Jumlah terjual harus bilangan bulat.');
        if (t > have) E(`${v.varian}: terjual ${t} melebihi stok di mitra (${have}).`);
        const fisik = i.sisa === '' || i.sisa == null ? null : int(i.sisa, 0, 'Sisa fisik harus bilangan bulat.');
        m.stok[v.id] = have - t;
        if (t > 0 || fisik !== null) rows.push({ vid: v.id, nm: label(v), terjual: t, sisaSistem: have - t, sisaFisik: fisik, selisih: fisik === null ? null : fisik - (have - t) });
        if (t > 0) items.push({ vid: v.id, nm: label(v), qty: t, harga: v.harga });
      });
      if (!rows.length) E('Isi jumlah terjual atau sisa fisik.');
      if (items.length) S.s.push({ id: uid(), t: now, kanal: 'mitra', ref: m.nama, items, total: sum(items) });
      S.r.push({ id: uid(), mid: m.id, t: now, rows }); break;
    }
    case 'partner.restok': {
      const m = mitra(p.kode), items = lines(S, p.items).map(({ v, qty }) => ({ vid: v.id, nm: label(v), qty }));
      S.q.push({ id: uid(), mid: m.id, t: now, items, cat: String(p.cat || '').slice(0, 120), status: 'baru' }); break;
    }
    default: E('Aksi tidak dikenal.');
  }
  return { S, res };
}
