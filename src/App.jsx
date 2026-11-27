import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { load, act, findLocalOrder, sendOrderEmail } from './api.js';
import { JENIS, STATUS, NEXT, stat } from '../shared/logic.js';

const rp = n => 'Rp' + Number(n || 0).toLocaleString('id-ID');
const tgl = t => new Date(t).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const localDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const tanggalOrder = order => order.tanggal
  ? new Date(`${order.tanggal}T00:00:00`).toLocaleDateString('id-ID', { dateStyle: 'medium' })
  : tgl(order.t);
const nm = v => `${v.produk} ${v.varian} ${v.ukuran}`;
const LB = { aman: 'Aman', menipis: 'Menipis', habis: 'Habis' };
const PC = { aman: 'bg-green-100 text-ok', menipis: 'bg-orange-200 text-wa', habis: 'bg-red-200 text-rd', off: 'bg-stone-200 text-stone-600', baru: 'bg-orange-200 text-wa', diproses: 'bg-amber-200 text-amber-900', dikirim: 'bg-sky-100 text-sky-800', selesai: 'bg-green-100 text-ok', batal: 'bg-red-200 text-rd' };
const Pill = ({ k, children }) => <span className={'pill ' + PC[k]}>{children}</span>;
const L = ({ t, c = '', children }) => <label className={'lbl ' + c}>{t}{children}</label>;
const Empty = ({ children }) => <p className="py-8 text-center text-sm">{children}</p>;
const H = ({ children }) => <h2 className="text-4xl sm:text-5xl text-or mb-4">{children}</h2>;
const Tbl = ({ head, children }) => <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{head.map(h => <th key={h} className="th">{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
const toItems = val => Object.entries(val).filter(([, q]) => Number(q) > 0).map(([vid, q]) => ({ vid, qty: Number(q) }));

function QtyGrid({ vs, val, set, max }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{vs.map(v => (
    <label key={v.id} className="flex items-center justify-between gap-3 bg-cr rounded-xl px-3 py-2 text-sm">
      <span>{v.varian} <span className="opacity-60">({v.ukuran}){max ? ` · maks ${max(v)}` : ''}</span></span>
      <input type="number" min="0" inputMode="numeric" className="w-20 rounded-lg border-2 border-pe px-2 py-1 text-right" value={val[v.id] ?? ''} onChange={e => set({ ...val, [v.id]: e.target.value })} />
    </label>))}</div>;
}

/* ───────── KONSUMEN: pesan ───────── */
function Shop({ catalog, run, notify }) {
  const [cart, setCart] = useState({}), [f, setF] = useState({ nama: '', email: '', hp: '', tanggal: localDate(), alamat: '', cat: '' }), [done, setDone] = useState(null), [busy, setBusy] = useState(false);
  const ls = catalog.filter(v => cart[v.id] > 0), total = ls.reduce((a, v) => a + v.harga * cart[v.id], 0), count = ls.reduce((a, v) => a + cart[v.id], 0);
  const q = (v, n) => setCart(c => ({ ...c, [v.id]: Math.max(0, Math.min(v.stok, n)) }));
  const on = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const emailOrder = async no => {
    setDone(current => current?.no === no ? { ...current, emailStatus: 'sending' } : current);
    try {
      const delivery = await sendOrderEmail(no, 'confirmation', '', findLocalOrder(no));
      setDone(current => current?.no === no ? { ...current, emailStatus: 'sent', emailRecipient: delivery.recipient } : current);
      return delivery;
    } catch (error) {
      setDone(current => current?.no === no ? { ...current, emailStatus: 'failed' } : current);
      return error instanceof Error ? error.message : 'Email gagal dikirim.';
    }
  };
  const submit = async e => {
    e.preventDefault(); setBusy(true);
    const r = await run('order.create', { ...f, items: ls.map(v => ({ vid: v.id, qty: cart[v.id] })) });
    setBusy(false);
    if (r?.no) {
      setDone({ ...r, nama: f.nama, email: f.email, emailStatus: 'sending' });
      setCart({});
      setF({ nama: '', email: '', hp: '', tanggal: localDate(), alamat: '', cat: '' });
      const emailResult = await emailOrder(r.no);
      if (emailResult && typeof emailResult === 'object') notify(emailResult.recipient === 'test' ? 'Pesanan tersimpan dan email uji terkirim ke penerima Resend yang dikonfigurasi.' : 'Pesanan tersimpan dan email konfirmasi terkirim.');
      else notify(`Pesanan tersimpan, tetapi email gagal: ${emailResult}`, true);
    }
  };
  if (done) {
    return <div className="card text-center max-w-lg mx-auto">
      <h2 className="text-5xl text-rd mb-2">Pesanan masuk!</h2>
      <p className="text-sm">Simpan kode ini untuk melacak pesananmu.</p>
      <p className="font-display text-6xl text-or my-3">{done.no}</p>
      <p className="mb-3">Total {rp(done.total)}. Status pengiriman email konfirmasi ditampilkan di bawah.</p>
      <p role="status" className={'mb-4 text-sm ' + (done.emailStatus === 'failed' ? 'text-rd' : 'text-ok')}>
        {done.emailStatus === 'sending' ? 'Mengirim email konfirmasi…' : done.emailStatus === 'sent' ? done.emailRecipient === 'test' ? 'Email uji terkirim ke penerima Resend yang dikonfigurasi; email ini belum dikirim ke alamat konsumen.' : `Email konfirmasi terkirim ke ${done.email}.` : 'Pesanan tersimpan, tetapi email konfirmasi belum terkirim.'}
      </p>
      <div className="flex flex-wrap gap-2 justify-center">
        {done.emailStatus === 'failed' && <button className="btn" onClick={() => emailOrder(done.no)}>Kirim ulang email</button>}
        <a className="btn-g" href="#/tracking">Lacak pesanan</a>
        <button className="btn-g" onClick={() => setDone(null)}>Pesan lagi</button>
      </div></div>;
  }
  return <>
    <H>Pesan basreng</H>
    <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
      <div className="grid sm:grid-cols-2 gap-4">
        {!catalog.length && <Empty>Belum ada produk yang dijual.</Empty>}
        {catalog.map(v => {
          const s = v.stok <= 0 ? 'habis' : v.stok <= 10 ? 'menipis' : 'aman';
          return <div key={v.id} className="card !mb-0 flex flex-col gap-2">
            <div className="flex justify-between gap-2 items-start"><div><h3 className="text-2xl text-rd leading-tight">{v.varian}</h3><p className="text-sm">{v.produk} · {v.ukuran}</p></div>
              <Pill k={s}>{s === 'habis' ? 'Habis' : s === 'menipis' ? `Sisa ${v.stok}` : 'Tersedia'}</Pill></div>
            <p className="font-semibold">{rp(v.harga)}</p>
            <div className="flex items-center gap-2 mt-auto">
              <button type="button" className="btn-g !px-3" aria-label="Kurangi" disabled={!cart[v.id]} onClick={() => q(v, (cart[v.id] || 0) - 1)}>−</button>
              <span className="w-8 text-center font-semibold">{cart[v.id] || 0}</span>
              <button type="button" className="btn !px-3" aria-label="Tambah" disabled={v.stok <= (cart[v.id] || 0)} onClick={() => q(v, (cart[v.id] || 0) + 1)}>+</button>
            </div></div>;
        })}
      </div>
      <form onSubmit={submit} className="card lg:sticky lg:top-4 !mb-0 space-y-3">
        <h3 className="text-2xl text-rd">Pesananmu</h3>
        {!ls.length ? <p className="text-sm">Pilih varian di samping dulu, lalu isi data pemesan.</p> : <>
          <ul className="text-sm space-y-1">{ls.map(v => <li key={v.id} className="flex justify-between"><span>{cart[v.id]}× {v.varian}</span><span>{rp(v.harga * cart[v.id])}</span></li>)}</ul>
          <p className="flex justify-between font-semibold border-t border-sh pt-2"><span>Total ({count} bungkus)</span><span>{rp(total)}</span></p>
          <L t="Nama"><input className="inp" required maxLength="50" value={f.nama} onChange={on('nama')} /></L>
          <L t="Email"><input className="inp" required type="email" maxLength="254" autoComplete="email" placeholder="nama@email.com" value={f.email} onChange={on('email')} /></L>
          <L t="Nomor telepon"><input className="inp" required inputMode="tel" placeholder="08xxxxxxxxxx" value={f.hp} onChange={on('hp')} /></L>
          <L t="Tanggal pesanan"><input className="inp" type="date" required value={f.tanggal} onChange={on('tanggal')} /></L>
          <L t="Alamat (opsional)"><textarea className="inp" rows="2" maxLength="180" value={f.alamat} onChange={on('alamat')} /></L>
          <L t="Catatan (opsional)"><input className="inp" maxLength="120" placeholder="mis. ambil di kantin ITS" value={f.cat} onChange={on('cat')} /></L>
          <button className="btn w-full" disabled={busy}>{busy ? 'Mengirim…' : 'Kirim pesanan'}</button></>}
      </form>
    </div></>;
}

/* ───────── KONSUMEN: lacak ───────── */
function Track({ run }) {
  const [f, setF] = useState({ no: '', email: '' }), [o, setO] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lookup = async clear => {
    setBusy(true); setError('');
    if (clear) setO(null);
    const r = await run('order.track', f);
    setBusy(false);
    if (r) setO(r);
    else setError('Pesanan tidak ditemukan atau email tidak cocok. Pesanan lama tanpa email tidak dapat dilacak dengan cara ini.');
  };
  const sub = e => { e.preventDefault(); lookup(true); };
  const flow = ['baru', 'diproses', 'dikirim', 'selesai'];
  return <div className="max-w-xl mx-auto"><H>Lacak pesanan</H>
    <form onSubmit={sub} className="card grid sm:grid-cols-2 gap-3">
      <L t="Kode pesanan"><input className="inp" required placeholder="KC-0001" value={f.no} onChange={e => setF({ ...f, no: e.target.value })} /></L>
      <L t="Email saat memesan"><input className="inp" required type="email" maxLength="254" autoComplete="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></L>
      <div className="sm:col-span-2"><button className="btn" disabled={busy}>{busy ? 'Mencari pesanan…' : 'Cek status'}</button></div>
      {error && <p role="alert" className="sm:col-span-2 text-sm text-rd">{error}</p>}</form>
    {!o && !error && <p className="card text-sm">Masukkan nomor pesanan dan email yang digunakan saat checkout untuk melihat perkembangannya.</p>}
    {o && <div className="card"><div className="flex flex-wrap justify-between items-center gap-3 mb-4"><div><p className="eyebrow">Detail pesanan</p><h3 className="text-3xl text-rd">{o.no}</h3></div><Pill k={o.status}>{STATUS[o.status]}</Pill></div>
      <div className="flex justify-end mb-3"><button className="btn-g btn-sm" disabled={busy} onClick={() => lookup(false)}>{busy ? 'Memperbarui…' : 'Perbarui status'}</button></div>
      <div className="grid sm:grid-cols-2 gap-3 mb-4 text-sm"><p><span className="block text-xs opacity-70">Nama konsumen</span><b>{o.nama}</b></p><p><span className="block text-xs opacity-70">Tanggal pesanan</span><b>{o.tanggal || tgl(o.t)}</b></p><p><span className="block text-xs opacity-70">Terakhir diperbarui</span><b>{tgl(o.hist?.[o.hist.length - 1]?.t || o.t)}</b></p></div>
      {o.status === 'batal' ? <p className="rounded-xl bg-red-100 p-3 text-sm text-rd font-semibold">Pesanan ini dibatalkan.</p> : <ol className="tracking-timeline mb-5">{flow.map((s, i) => {
        const current = flow.indexOf(o.status), reached = current >= i;
        return <li key={s} className={reached ? 'reached' : ''}><span>{reached ? '✓' : i + 1}</span><b>{i === 0 ? 'Pesanan Dibuat' : STATUS[s]}</b></li>;
      })}</ol>}
      <div className="text-sm space-y-2">{o.items.map(i => <div key={i.vid} className="flex justify-between gap-3"><span>{i.qty} × {i.nm}<small className="block text-xs opacity-70">{rp(i.harga)} per item</small></span><b>{rp(i.qty * i.harga)}</b></div>)}</div>
      <p className="flex justify-between font-semibold border-t border-sh mt-3 pt-3"><span>Total pesanan</span><span>{rp(o.total)}</span></p>
      <div className="mt-5 border-t border-sh pt-4"><h4 className="font-semibold mb-2">Riwayat status</h4>{o.hist?.length ? <ol className="space-y-2 text-sm">{o.hist.map((item, index) => <li key={`${item.status}-${item.t}-${index}`} className="flex justify-between gap-3"><span><Pill k={item.status}>{STATUS[item.status]}</Pill></span><time className="text-xs">{tgl(item.t)}</time></li>)}</ol> : <p className="text-sm">Belum ada riwayat status.</p>}</div>
    </div>}
  </div>;
}

function DemoStories({ catalog }) {
  const activeVariants = catalog.filter(variant => variant.aktif !== false);
  const demoTime = new Date().toISOString();
  const firstVariant = activeVariants[0];
  const [orders, setOrders] = useState([{
    id: 'demo-1',
    no: 'DEMO-0001',
    nama: 'Mitra Contoh',
    tanggal: localDate(),
    cat: 'Pesanan simulasi untuk demonstrasi.',
    t: demoTime,
    status: 'diproses',
    hist: [{ status: 'baru', t: demoTime }, { status: 'diproses', t: demoTime }],
    items: firstVariant ? [{ vid: firstVariant.id, nm: nm(firstVariant), qty: 2, harga: firstVariant.harga }] : [],
  }]);
  const [selectedId, setSelectedId] = useState('demo-1');
  const [story, setStory] = useState('US-01');
  const [orderForm, setOrderForm] = useState({ nama: '', tanggal: localDate(), cat: '' });
  const [itemForm, setItemForm] = useState({ vid: firstVariant?.id || '', qty: '1' });
  const [itemError, setItemError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [notice, setNotice] = useState('');
  const [demoProducts, setDemoProducts] = useState(() => catalog.map(variant => ({ ...variant })));
  const [productForm, setProductForm] = useState({ produk: '', varian: '', ukuran: '', harga: '', min: '', awal: '0' });
  const [stockForm, setStockForm] = useState({ vid: firstVariant?.id || '', jenis: 'masuk', jumlah: '1', oleh: 'Admin demo' });
  const [demoStockLog, setDemoStockLog] = useState([]);
  const [demoPartners, setDemoPartners] = useState([]);
  const [partnerForm, setPartnerForm] = useState({ nama: '', lokasi: '' });
  const [shipForm, setShipForm] = useState({ mid: '', vid: firstVariant?.id || '', qty: '1' });
  const [saleForm, setSaleForm] = useState({ vid: firstVariant?.id || '', qty: '1', lokasi: 'Penjualan langsung' });
  const [saleCart, setSaleCart] = useState([]);
  const [demoSales, setDemoSales] = useState([]);
  const selected = orders.find(order => order.id === selectedId);
  const orderTotal = order => order.items.reduce((sum, item) => sum + item.qty * item.harga, 0);
  const selectedItems = selected?.items || [];
  const selectedTotal = selected ? orderTotal(selected) : 0;
  const stories = [
    ['US-01', 'Produk & varian'],
    ['US-02', 'Stok'],
    ['US-03', 'Mitra'],
    ['US-04', 'Penjualan'],
    ['US-05', 'Laporan'],
    ['US-06a', 'Data pesanan'],
    ['US-06b', 'Item pesanan'],
    ['US-07', 'Status'],
    ['US-08', 'Daftar & detail'],
    ['US-09', 'Kuantitas & subtotal'],
    ['US-10', 'Cari & filter'],
  ];
  const updateSelected = update => setOrders(current => current.map(order => order.id === selectedId ? update(order) : order));
  const createOrder = event => {
    event.preventDefault();
    const now = new Date().toISOString();
    const next = {
      id: `demo-${Date.now()}`,
      no: `DEMO-${String(orders.length + 1).padStart(4, '0')}`,
      nama: orderForm.nama.trim(),
      tanggal: orderForm.tanggal,
      cat: orderForm.cat.trim(),
      t: now,
      status: 'baru',
      hist: [{ status: 'baru', t: now }],
      items: [],
    };
    setOrders(current => [...current, next]);
    setSelectedId(next.id);
    setOrderForm({ nama: '', tanggal: localDate(), cat: '' });
    setNotice(`${next.no} ditambahkan ke simulasi.`);
  };
  const addItem = event => {
    event.preventDefault();
    const variant = activeVariants.find(item => item.id === itemForm.vid);
    const qty = Number(itemForm.qty);
    if (!selected) return;
    if (!variant) { setItemError('Pilih varian aktif yang tersedia.'); return; }
    if (!Number.isInteger(qty) || qty <= 0) { setItemError('Kuantitas harus bilangan bulat lebih dari nol.'); return; }
    updateSelected(order => {
      const existing = order.items.find(item => item.vid === variant.id);
      const items = existing
        ? order.items.map(item => item.vid === variant.id ? { ...item, qty: item.qty + qty } : item)
        : [...order.items, { vid: variant.id, nm: nm(variant), qty, harga: variant.harga }];
      return { ...order, items };
    });
    setItemError('');
    setNotice('Item demo ditambahkan; subtotal dan total dihitung ulang.');
  };
  const updateQuantity = (vid, value) => {
    const qty = Number(value);
    if (!Number.isInteger(qty) || qty <= 0) {
      setItemError('Kuantitas harus bilangan bulat lebih dari nol.');
      return;
    }
    updateSelected(order => ({ ...order, items: order.items.map(item => item.vid === vid ? { ...item, qty } : item) }));
    setItemError('');
  };
  const removeItem = vid => updateSelected(order => ({ ...order, items: order.items.filter(item => item.vid !== vid) }));
  const changeStatus = nextStatus => {
    if (!selected || !(NEXT[selected.status] || []).includes(nextStatus)) return;
    const now = new Date().toISOString();
    updateSelected(order => ({ ...order, status: nextStatus, hist: [...order.hist, { status: nextStatus, t: now }] }));
    setNotice(`Status simulasi diperbarui menjadi ${STATUS[nextStatus]}.`);
  };
  const resetFilters = () => { setSearch(''); setStatusFilter(''); setDateFilter(''); };
  const updateDemoStock = (vid, delta, jenis, cat) => {
    const now = new Date().toISOString();
    const variant = demoProducts.find(item => item.id === vid);
    if (!variant) return false;
    const after = variant.stok + delta;
    if (after < 0) return false;
    setDemoProducts(current => current.map(item => item.id === vid ? { ...item, stok: after } : item));
    setDemoStockLog(current => [{ id: `${Date.now()}-${Math.random()}`, vid, jenis, jumlah: delta, setelah: after, t: now, oleh: stockForm.oleh || 'Admin demo', cat }, ...current]);
    return true;
  };
  const saveDemoProduct = event => {
    event.preventDefault();
    const values = {
      produk: productForm.produk.trim(),
      varian: productForm.varian.trim(),
      ukuran: productForm.ukuran.trim(),
      harga: Number(productForm.harga),
      min: Number(productForm.min),
      stok: Number(productForm.awal) || 0,
      aktif: true,
    };
    if (!values.produk || !values.varian || !values.ukuran || !Number.isFinite(values.harga) || values.harga < 0
      || !Number.isInteger(values.min) || values.min < 0 || !Number.isInteger(values.stok) || values.stok < 0) {
      setNotice('Lengkapi data produk dengan harga, minimum stok, dan stok awal yang valid.');
      return;
    }
    const productKey = item => `${item.produk}|${item.varian}|${item.ukuran}`.toLowerCase();
    if (demoProducts.some(item => productKey(item) === productKey(values))) {
      setNotice('Produk dan varian dengan ukuran tersebut sudah ada.');
      return;
    }
    const variant = { id: `demo-product-${Date.now()}`, ...values };
    setDemoProducts(current => [...current, variant]);
    if (values.stok > 0) setDemoStockLog(current => [{ id: `${Date.now()}-initial`, vid: variant.id, jenis: 'awal', jumlah: values.stok, setelah: values.stok, t: new Date().toISOString(), oleh: 'Admin demo', cat: 'Stok awal' }, ...current]);
    setProductForm({ produk: '', varian: '', ukuran: '', harga: '', min: '', awal: '0' });
    setNotice(`${nm(variant)} ditambahkan ke katalog.`);
  };
  const updateDemoProduct = (id, changes) => setDemoProducts(current => current.map(item => item.id === id ? { ...item, ...changes } : item));
  const recordDemoStock = event => {
    event.preventDefault();
    const variant = demoProducts.find(item => item.id === stockForm.vid && item.aktif !== false);
    const qty = Number(stockForm.jumlah);
    if (!variant || !Number.isInteger(qty) || qty < (stockForm.jenis === 'sesuai' ? 0 : 1)) {
      setNotice('Pilih varian aktif dan masukkan jumlah stok yang valid.');
      return;
    }
    const delta = stockForm.jenis === 'masuk' || stockForm.jenis === 'awal' ? qty : stockForm.jenis === 'keluar' ? -qty : qty - variant.stok;
    if (variant.stok + delta < 0) {
      setNotice('Stok keluar melebihi jumlah stok yang tersedia.');
      return;
    }
    updateDemoStock(variant.id, delta, stockForm.jenis, 'Perubahan stok');
    setNotice('Perubahan stok dicatat.');
  };
  const addDemoPartner = event => {
    event.preventDefault();
    const nama = partnerForm.nama.trim();
    if (!nama) return;
    const partner = { id: `demo-partner-${Date.now()}`, nama, lokasi: partnerForm.lokasi.trim(), stok: {} };
    setDemoPartners(current => [...current, partner]);
    setShipForm(current => ({ ...current, mid: partner.id }));
    setPartnerForm({ nama: '', lokasi: '' });
    setNotice(`${nama} ditambahkan sebagai mitra.`);
  };
  const shipDemoStock = event => {
    event.preventDefault();
    const qty = Number(shipForm.qty);
    const partner = demoPartners.find(item => item.id === shipForm.mid);
    const variant = demoProducts.find(item => item.id === shipForm.vid && item.aktif !== false);
    if (!partner || !variant || !Number.isInteger(qty) || qty <= 0 || qty > variant.stok) {
      setNotice('Pilih mitra dan varian aktif; jumlah kirim harus tersedia di stok pusat.');
      return;
    }
    if (!updateDemoStock(variant.id, -qty, 'mitra', `Dikirim ke ${partner.nama}`)) return;
    setDemoPartners(current => current.map(item => item.id === partner.id ? { ...item, stok: { ...item.stok, [variant.id]: (item.stok[variant.id] || 0) + qty } } : item));
    setNotice(`${qty} unit dikirim ke ${partner.nama}.`);
  };
  const addSaleLine = event => {
    event.preventDefault();
    const qty = Number(saleForm.qty);
    const variant = demoProducts.find(item => item.id === saleForm.vid && item.aktif !== false);
    const alreadyAdded = saleCart.filter(item => item.vid === saleForm.vid).reduce((sum, item) => sum + item.qty, 0);
    if (!variant || !Number.isInteger(qty) || qty <= 0 || qty + alreadyAdded > variant.stok) {
      setNotice('Kuantitas penjualan harus lebih dari nol dan tidak melebihi stok tersedia.');
      return;
    }
    setSaleCart(current => {
      const existing = current.find(item => item.vid === variant.id);
      return existing
        ? current.map(item => item.vid === variant.id ? { ...item, qty: item.qty + qty } : item)
        : [...current, { vid: variant.id, nm: nm(variant), qty, harga: variant.harga }];
    });
    setNotice('Item ditambahkan ke transaksi.');
  };
  const completeDemoSale = () => {
    if (!saleCart.length) { setNotice('Tambahkan minimal satu item ke transaksi.'); return; }
    if (saleCart.some(item => item.qty > (demoProducts.find(variant => variant.id === item.vid)?.stok || 0))) {
      setNotice('Stok berubah dan tidak mencukupi. Periksa kembali item transaksi.');
      return;
    }
    const now = new Date().toISOString();
    saleCart.forEach(item => updateDemoStock(item.vid, -item.qty, 'cfd', saleForm.lokasi.trim() || 'Penjualan langsung'));
    setDemoSales(current => [...current, { id: `demo-sale-${Date.now()}`, t: now, ref: saleForm.lokasi.trim() || 'Penjualan langsung', items: saleCart, total: saleCart.reduce((sum, item) => sum + item.qty * item.harga, 0) }]);
    setSaleCart([]);
    setNotice('Penjualan dicatat dan stok diperbarui.');
  };
  const filteredOrders = [...orders].reverse().filter(order =>
    (!search || order.no.toLowerCase().includes(search.trim().toLowerCase()) || order.nama.toLowerCase().includes(search.trim().toLowerCase()))
    && (!statusFilter || order.status === statusFilter)
    && (!dateFilter || order.tanggal === dateFilter));
  const renderOrderList = () => <section className="card">
    <div className="flex flex-wrap justify-between items-center gap-2 mb-3"><h3 className="text-xl text-rd">Daftar pesanan demo</h3><span className="text-xs">{filteredOrders.length} pesanan</span></div>
    {!filteredOrders.length ? <Empty>Tidak ada pesanan demo yang cocok.</Empty> : <div className="space-y-2">{filteredOrders.map(order => <button key={order.id} type="button" className="demo-order-row" onClick={() => setSelectedId(order.id)}>
      <span><b>{order.no} · {order.nama}</b><small>{order.tanggal} · {order.items.length} jenis item</small></span><Pill k={order.status}>{STATUS[order.status]}</Pill>
    </button>)}</div>}
  </section>;
  const renderOrderDetail = order => <section className="card">
    <div className="flex flex-wrap justify-between items-center gap-2 mb-3"><div><p className="eyebrow">Detail simulasi</p><h3 className="text-2xl text-rd">{order.no}</h3></div><Pill k={order.status}>{STATUS[order.status]}</Pill></div>
    <div className="grid sm:grid-cols-2 gap-3 text-sm"><p><small className="block opacity-70">Mitra/pelanggan</small><b>{order.nama}</b></p><p><small className="block opacity-70">Tanggal pesanan</small><b>{order.tanggal}</b></p></div>
    <p className="text-sm mt-3"><small className="block opacity-70">Catatan</small>{order.cat || 'Tidak ada catatan.'}</p>
    <div className="mt-4 border-t border-sh pt-3"><h4 className="font-semibold mb-2">Item pesanan</h4>{order.items.length ? order.items.map(item => <div key={item.vid} className="flex justify-between gap-3 py-1 text-sm"><span>{item.qty} × {item.nm}</span><b>{rp(item.qty * item.harga)}</b></div>) : <p className="text-sm">Belum ada item pada pesanan ini.</p>}</div>
    <p className="flex justify-between border-t border-sh mt-2 pt-3 font-semibold"><span>Total</span><span>{rp(orderTotal(order))}</span></p>
  </section>;
  const renderItems = allowQuantityEdit => <section className="card">
    <div className="flex flex-wrap justify-between items-center gap-2 mb-3"><h3 className="text-xl text-rd">Item · {selected?.no}</h3><label className="lbl">Pesanan<select className="inp" value={selectedId} onChange={event => setSelectedId(event.target.value)}>{orders.map(order => <option key={order.id} value={order.id}>{order.no} · {order.nama}</option>)}</select></label></div>
    <p className="text-xs mb-3">Pilihan hanya memuat varian aktif dari katalog saat ini.</p>
    <form onSubmit={addItem} className="grid sm:grid-cols-[minmax(0,1fr)_8rem_auto] gap-3 items-end">
      <L t="Produk / varian"><select className="inp" required value={itemForm.vid} onChange={event => setItemForm(current => ({ ...current, vid: event.target.value }))}><option value="">Pilih varian aktif</option>{activeVariants.map(variant => <option key={variant.id} value={variant.id}>{nm(variant)} · {rp(variant.harga)}</option>)}</select></L>
      <L t="Kuantitas"><input className="inp" type="number" min="1" step="1" required value={itemForm.qty} onChange={event => setItemForm(current => ({ ...current, qty: event.target.value }))} /></L>
      <button className="btn" disabled={!selected || !activeVariants.length}>Tambah item</button>
    </form>
    {!activeVariants.length && <p className="mt-2 text-sm text-rd">Belum ada varian aktif di katalog.</p>}
    {itemError && <p role="alert" className="mt-2 text-sm text-rd">{itemError}</p>}
    {selected && <div className="mt-4">{selectedItems.length ? <Tbl head={['Item', 'Harga satuan', 'Kuantitas', 'Subtotal', '']}>{selectedItems.map(item => <tr key={item.vid}>
      <td className="td">{item.nm}</td><td className="td">{rp(item.harga)}</td>
      <td className="td">{allowQuantityEdit ? <input className="inp !mt-0 w-20" type="number" min="1" step="1" value={item.qty} onChange={event => updateQuantity(item.vid, event.target.value)} aria-label={`Kuantitas ${item.nm}`} /> : item.qty}</td>
      <td className="td font-semibold">{rp(item.qty * item.harga)}</td><td className="td"><button type="button" className="btn-g btn-sm" onClick={() => removeItem(item.vid)}>Hapus</button></td>
    </tr>)}</Tbl> : <Empty>Tambahkan satu atau beberapa item untuk melanjutkan simulasi.</Empty>}
      <p className="flex justify-between border-t border-sh mt-3 pt-3 font-semibold"><span>Total pesanan</span><span>{rp(selectedTotal)}</span></p>
    </div>}
  </section>;
  const renderStatus = () => selected && <section className="card">
    <div className="flex flex-wrap justify-between items-center gap-2 mb-4"><div><p className="eyebrow">US-07 · Riwayat status</p><h3 className="text-2xl text-rd">{selected.no}</h3></div><Pill k={selected.status}>{STATUS[selected.status]}</Pill></div>
    <p className="text-sm mb-3">Perubahan status demo mencatat waktu. Status Selesai tidak memiliki transisi kembali.</p>
    <div className="flex flex-wrap gap-2 mb-4">{(NEXT[selected.status] || []).map(next => <button key={next} type="button" className={next === 'batal' ? 'btn-g' : 'btn'} onClick={() => changeStatus(next)}>{next === 'diproses' ? 'Proses' : next === 'dikirim' ? 'Siap Dikirim' : next === 'selesai' ? 'Selesai' : 'Batalkan'}</button>)}
      {!NEXT[selected.status]?.length && <span className="text-sm">Tidak ada perubahan status berikutnya.</span>}
    </div>
    <h4 className="font-semibold mb-2">Riwayat perubahan</h4><ol className="space-y-2 text-sm">{selected.hist.map((entry, index) => <li key={`${entry.status}-${entry.t}-${index}`} className="flex justify-between gap-3"><Pill k={entry.status}>{STATUS[entry.status]}</Pill><time>{tgl(entry.t)}</time></li>)}</ol>
  </section>;
  const renderSearch = () => <section className="card">
    <h3 className="text-xl text-rd mb-3">Cari dan filter · US-10</h3>
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
      <L t="Nama mitra/pelanggan"><input className="inp" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari nama atau nomor demo" /></L>
      <L t="Status"><select className="inp" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">Semua status</option>{Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></L>
      <L t="Tanggal"><input className="inp" type="date" value={dateFilter} onChange={event => setDateFilter(event.target.value)} /></L>
      <button type="button" className="btn-g" onClick={resetFilters}>Reset filter</button>
    </div>
    <p className="text-xs mt-3">{filteredOrders.length} dari {orders.length} pesanan demo</p>
    <div className="mt-3 space-y-2">{filteredOrders.map(order => <button key={order.id} type="button" className="demo-order-row" onClick={() => setSelectedId(order.id)}><span><b>{order.no} · {order.nama}</b><small>{order.tanggal}</small></span><Pill k={order.status}>{STATUS[order.status]}</Pill></button>)}</div>
  </section>;
  const renderProductsDemo = () => <div className="grid lg:grid-cols-2 gap-4">
    <form className="card space-y-3" onSubmit={saveDemoProduct}><p className="eyebrow">US-01 · Katalog</p><h3 className="text-xl text-rd">Tambah produk dan varian</h3>
      <L t="Nama produk"><input className="inp" required maxLength="40" value={productForm.produk} onChange={event => setProductForm(current => ({ ...current, produk: event.target.value }))} /></L>
      <L t="Varian rasa"><input className="inp" required maxLength="40" value={productForm.varian} onChange={event => setProductForm(current => ({ ...current, varian: event.target.value }))} /></L>
      <div className="grid sm:grid-cols-2 gap-3"><L t="Ukuran"><input className="inp" required maxLength="30" value={productForm.ukuran} onChange={event => setProductForm(current => ({ ...current, ukuran: event.target.value }))} /></L>
        <L t="Harga (Rp)"><input className="inp" type="number" min="0" required value={productForm.harga} onChange={event => setProductForm(current => ({ ...current, harga: event.target.value }))} /></L>
        <L t="Minimum stok"><input className="inp" type="number" min="0" required value={productForm.min} onChange={event => setProductForm(current => ({ ...current, min: event.target.value }))} /></L>
        <L t="Stok awal"><input className="inp" type="number" min="0" required value={productForm.awal} onChange={event => setProductForm(current => ({ ...current, awal: event.target.value }))} /></L></div>
      <button className="btn">Tambah varian</button>
    </form>
    <section className="card"><p className="eyebrow">Katalog produk</p><h3 className="text-xl text-rd mb-3">{demoProducts.length} varian</h3>
      {demoProducts.length ? <div className="space-y-2">{demoProducts.map(item => <div key={item.id} className="demo-order-row"><span><b>{nm(item)}</b><small>{rp(item.harga)} · stok {item.stok} · min. {item.min}</small></span><span className="flex items-center gap-2"><Pill k={item.aktif ? 'aman' : 'off'}>{item.aktif ? 'Aktif' : 'Nonaktif'}</Pill><button type="button" className="btn-g btn-sm" onClick={() => updateDemoProduct(item.id, { aktif: !item.aktif })}>{item.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button></span></div>)}</div> : <Empty>Katalog produk masih kosong.</Empty>}
    </section>
  </div>;
  const renderStockDemo = () => <div className="grid lg:grid-cols-2 gap-4">
    <form className="card space-y-3" onSubmit={recordDemoStock}><p className="eyebrow">US-02 · Persediaan</p><h3 className="text-xl text-rd">Catat perubahan stok</h3>
      <L t="Varian"><select className="inp" required value={stockForm.vid} onChange={event => setStockForm(current => ({ ...current, vid: event.target.value }))}><option value="">Pilih varian aktif</option>{demoProducts.filter(item => item.aktif !== false).map(item => <option key={item.id} value={item.id}>{nm(item)} · stok {item.stok}</option>)}</select></L>
      <L t="Jenis perubahan"><select className="inp" value={stockForm.jenis} onChange={event => setStockForm(current => ({ ...current, jenis: event.target.value }))}><option value="masuk">Stok masuk</option><option value="keluar">Stok keluar</option><option value="awal">Stok awal</option><option value="sesuai">Penyesuaian stok fisik</option></select></L>
      <div className="grid sm:grid-cols-2 gap-3"><L t={stockForm.jenis === 'sesuai' ? 'Jumlah stok fisik' : 'Jumlah unit'}><input className="inp" type="number" min={stockForm.jenis === 'sesuai' ? '0' : '1'} step="1" required value={stockForm.jumlah} onChange={event => setStockForm(current => ({ ...current, jumlah: event.target.value }))} /></L><L t="Dicatat oleh"><input className="inp" required value={stockForm.oleh} onChange={event => setStockForm(current => ({ ...current, oleh: event.target.value }))} /></L></div>
      <button className="btn">Simpan perubahan stok</button>
    </form>
    <section className="card"><p className="eyebrow">Ringkasan stok</p><h3 className="text-xl text-rd mb-3">Posisi persediaan</h3>
      {demoProducts.length ? <div className="space-y-2">{demoProducts.map(item => <div key={item.id} className="demo-order-row"><span><b>{nm(item)}</b><small>Batas minimum {item.min}</small></span><Pill k={stat(item)}>{item.stok} unit · {LB[stat(item)]}</Pill></div>)}</div> : <Empty>Belum ada produk di katalog.</Empty>}
      <div className="mt-4 border-t border-sh pt-3"><h4 className="font-semibold mb-2">Riwayat perubahan stok</h4>{demoStockLog.length ? <div className="space-y-2 text-sm">{demoStockLog.slice(0, 5).map(log => <p key={log.id} className="flex justify-between gap-2"><span>{nm(demoProducts.find(item => item.id === log.vid) || { produk: 'Produk', varian: 'dihapus', ukuran: '' })}<small className="block text-xs opacity-70">{JENIS[log.jenis]} · {tgl(log.t)}</small></span><b>{log.jumlah > 0 ? '+' : ''}{log.jumlah} → {log.setelah}</b></p>)}</div> : <Empty>Belum ada perubahan stok dalam demo ini.</Empty>}</div>
    </section>
  </div>;
  const renderPartnersDemo = () => <div className="grid lg:grid-cols-2 gap-4">
    <div className="space-y-4">
      <form className="card space-y-3" onSubmit={addDemoPartner}><p className="eyebrow">US-03 · Mitra</p><h3 className="text-xl text-rd">Daftarkan mitra</h3>
        <L t="Nama mitra"><input className="inp" required maxLength="40" value={partnerForm.nama} onChange={event => setPartnerForm(current => ({ ...current, nama: event.target.value }))} /></L>
        <L t="Lokasi"><input className="inp" maxLength="60" value={partnerForm.lokasi} onChange={event => setPartnerForm(current => ({ ...current, lokasi: event.target.value }))} /></L>
        <button className="btn">Tambah mitra</button>
      </form>
      {demoPartners.map(partner => <section className="card" key={partner.id}><h3 className="text-xl text-rd">{partner.nama}</h3><p className="text-sm mb-3">{partner.lokasi || 'Lokasi belum diisi'}</p><p className="text-sm font-semibold">Stok konsinyasi</p>
        {Object.keys(partner.stok).length ? Object.entries(partner.stok).map(([vid, qty]) => <p key={vid} className="flex justify-between text-sm py-1"><span>{nm(demoProducts.find(item => item.id === vid) || { produk: 'Produk', varian: 'tidak tersedia', ukuran: '' })}</span><b>{qty} unit</b></p>) : <p className="text-sm opacity-70">Belum menerima stok.</p>}
      </section>)}
      {!demoPartners.length && <section className="card"><Empty>Tambahkan mitra untuk melihat data dan stok konsinyasi.</Empty></section>}
    </div>
    <form className="card space-y-3" onSubmit={shipDemoStock}><p className="eyebrow">Distribusi stok</p><h3 className="text-xl text-rd">Kirim stok ke mitra</h3>
      <L t="Mitra"><select className="inp" required value={shipForm.mid} onChange={event => setShipForm(current => ({ ...current, mid: event.target.value }))}><option value="">Pilih mitra</option>{demoPartners.map(partner => <option key={partner.id} value={partner.id}>{partner.nama}</option>)}</select></L>
      <L t="Produk / varian"><select className="inp" required value={shipForm.vid} onChange={event => setShipForm(current => ({ ...current, vid: event.target.value }))}><option value="">Pilih varian aktif</option>{demoProducts.filter(item => item.aktif !== false).map(item => <option key={item.id} value={item.id}>{nm(item)} · stok {item.stok}</option>)}</select></L>
      <L t="Jumlah dikirim"><input className="inp" type="number" min="1" step="1" required value={shipForm.qty} onChange={event => setShipForm(current => ({ ...current, qty: event.target.value }))} /></L>
      <button className="btn" disabled={!demoPartners.length}>Kirim stok</button>
    </form>
  </div>;
  const renderSalesDemo = () => <div className="grid lg:grid-cols-2 gap-4">
    <div className="card"><p className="eyebrow">US-04 · Penjualan</p><h3 className="text-xl text-rd mb-3">Catat penjualan langsung</h3>
      <form onSubmit={addSaleLine} className="space-y-3">
        <L t="Produk / varian"><select className="inp" required value={saleForm.vid} onChange={event => setSaleForm(current => ({ ...current, vid: event.target.value }))}><option value="">Pilih varian aktif</option>{demoProducts.filter(item => item.aktif !== false).map(item => <option key={item.id} value={item.id}>{nm(item)} · stok {item.stok}</option>)}</select></L>
        <L t="Kuantitas"><input className="inp" type="number" min="1" step="1" required value={saleForm.qty} onChange={event => setSaleForm(current => ({ ...current, qty: event.target.value }))} /></L>
        <button className="btn">Tambah item</button>
      </form>
      <L t="Lokasi / kanal" c="mt-3"><input className="inp" value={saleForm.lokasi} onChange={event => setSaleForm(current => ({ ...current, lokasi: event.target.value }))} /></L>
      <div className="mt-4 border-t border-sh pt-3"><h4 className="font-semibold mb-2">Item transaksi</h4>{saleCart.length ? saleCart.map(item => <div key={item.vid} className="flex justify-between gap-3 py-1 text-sm"><span>{item.qty} × {item.nm}<small className="block text-xs opacity-70">{rp(item.harga)} per item</small></span><span className="flex items-center gap-2"><b>{rp(item.qty * item.harga)}</b><button type="button" className="btn-g btn-sm" onClick={() => setSaleCart(current => current.filter(line => line.vid !== item.vid))}>Hapus</button></span></div>) : <Empty>Belum ada item transaksi.</Empty>}
        <p className="flex justify-between border-t border-sh mt-2 pt-3 font-semibold"><span>Total</span><span>{rp(saleCart.reduce((sum, item) => sum + item.qty * item.harga, 0))}</span></p>
        <button type="button" className="btn mt-3" disabled={!saleCart.length} onClick={completeDemoSale}>Simpan penjualan</button>
      </div>
    </div>
    <section className="card"><p className="eyebrow">Riwayat penjualan</p><h3 className="text-xl text-rd mb-3">{demoSales.length} transaksi</h3>{demoSales.length ? <div className="space-y-2">{[...demoSales].reverse().map(sale => <div className="demo-order-row" key={sale.id}><span><b>{sale.ref}</b><small>{tgl(sale.t)} · {sale.items.reduce((sum, item) => sum + item.qty, 0)} unit</small></span><b>{rp(sale.total)}</b></div>)}</div> : <Empty>Belum ada transaksi penjualan di demo.</Empty>}</section>
  </div>;
  const renderReportsDemo = () => {
    const revenue = demoSales.reduce((sum, sale) => sum + sale.total, 0);
    const unitsSold = demoSales.reduce((sum, sale) => sum + sale.items.reduce((total, item) => total + item.qty, 0), 0);
    const rankings = {};
    demoSales.forEach(sale => sale.items.forEach(item => {
      rankings[item.nm] = rankings[item.nm] || { qty: 0, revenue: 0 };
      rankings[item.nm].qty += item.qty;
      rankings[item.nm].revenue += item.qty * item.harga;
    }));
    const topProducts = Object.entries(rankings).sort((a, b) => b[1].qty - a[1].qty);
    return <div className="space-y-4"><section className="card"><p className="eyebrow">US-05 · Ringkasan</p><h3 className="text-xl text-rd mb-3">Laporan penjualan dan stok</h3>
      <div className="grid sm:grid-cols-3 gap-3"><div className="rounded-xl bg-cr p-4"><small>Total transaksi</small><b className="block text-2xl">{demoSales.length}</b></div><div className="rounded-xl bg-cr p-4"><small>Unit terjual</small><b className="block text-2xl">{unitsSold}</b></div><div className="rounded-xl bg-cr p-4"><small>Omzet tercatat</small><b className="block text-2xl">{rp(revenue)}</b></div></div>
    </section>
      <div className="grid lg:grid-cols-2 gap-4"><section className="card"><h3 className="text-xl text-rd mb-3">Produk terlaris</h3>{topProducts.length ? <div className="space-y-2">{topProducts.map(([name, value]) => <div className="demo-order-row" key={name}><span><b>{name}</b><small>{value.qty} unit terjual</small></span><b>{rp(value.revenue)}</b></div>)}</div> : <Empty>Belum ada transaksi untuk diringkas.</Empty>}</section>
        <section className="card"><h3 className="text-xl text-rd mb-3">Kondisi stok</h3>{demoProducts.length ? <div className="space-y-2">{demoProducts.map(item => <div className="demo-order-row" key={item.id}><span><b>{nm(item)}</b><small>Minimum {item.min}</small></span><Pill k={stat(item)}>{item.stok} unit · {LB[stat(item)]}</Pill></div>)}</div> : <Empty>Belum ada data produk.</Empty>}</section>
      </div>
    </div>;
  };
  return <div>
    <H>Demo User Story KUNCI</H>
    <div className="demo-story-tabs" role="tablist" aria-label="Demo user story KUNCI">{stories.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={story === key} className={story === key ? 'active' : ''} onClick={() => { setStory(key); setNotice(''); }}>{key} · {label}</button>)}</div>
    {notice && <p className="demo-notice" role="status">{notice}</p>}
    {story === 'US-01' && renderProductsDemo()}
    {story === 'US-02' && renderStockDemo()}
    {story === 'US-03' && renderPartnersDemo()}
    {story === 'US-04' && renderSalesDemo()}
    {story === 'US-05' && renderReportsDemo()}
    {story === 'US-06a' && <div className="grid lg:grid-cols-2 gap-4">
      <form className="card space-y-3" onSubmit={createOrder}><p className="eyebrow">US-06a · 2 poin</p><h3 className="text-xl text-rd">Data pesanan</h3>
        <L t="Nama mitra/pelanggan"><input className="inp" required maxLength="50" value={orderForm.nama} onChange={event => setOrderForm(current => ({ ...current, nama: event.target.value }))} /></L>
        <L t="Tanggal pesanan"><input className="inp" required type="date" value={orderForm.tanggal} onChange={event => setOrderForm(current => ({ ...current, tanggal: event.target.value }))} /></L>
        <L t="Catatan"><textarea className="inp" rows="3" maxLength="120" value={orderForm.cat} onChange={event => setOrderForm(current => ({ ...current, cat: event.target.value }))} /></L>
        <button className="btn">Buat pesanan demo</button>
      </form>{renderOrderList()}
    </div>}
    {story === 'US-06b' && renderItems(false)}
    {story === 'US-07' && <div className="grid lg:grid-cols-2 gap-4">{renderOrderList()}{renderStatus()}</div>}
    {story === 'US-08' && <div className="grid lg:grid-cols-2 gap-4">{renderOrderList()}{selected ? renderOrderDetail(selected) : <Empty>Pilih pesanan demo untuk melihat detail.</Empty>}</div>}
    {story === 'US-09' && renderItems(true)}
    {story === 'US-10' && <div className="grid lg:grid-cols-2 gap-4">{renderSearch()}{selected ? renderOrderDetail(selected) : <Empty>Pilih pesanan dari hasil pencarian untuk melihat detail.</Empty>}</div>}
  </div>;
}

/* ───────── MITRA ───────── */
function Mitra({ run }) {
  const [kode, setKode] = useState(''), [me, setMe] = useState(null);
  const open = async k => { const r = await run('partner.me', { kode: k }); if (r) setMe({ ...r, kode: k }); };
  if (!me) return <div className="max-w-md mx-auto"><H>Portal mitra</H>
    <form onSubmit={e => { e.preventDefault(); open(kode); }} className="card space-y-3"><p className="text-sm">Masukkan kode mitra dari Pedasan Kunchung untuk melapor penjualan, mengecek sisa stok, dan meminta restok.</p>
      <L t="Kode mitra"><input className="inp uppercase" required value={kode} onChange={e => setKode(e.target.value)} /></L><button className="btn">Masuk</button></form></div>;
  return <Portal me={me} reload={() => open(me.kode)} out={() => setMe(null)} run={run} />;
}
function Portal({ me, reload, out, run }) {
  const [v, setV] = useState({}), [cat, setCat] = useState('');
  const set = (id, k, x) => setV(o => ({ ...o, [id]: { ...o[id], [k]: x } }));
  const inp = (id, k) => <input type="number" min="0" inputMode="numeric" className="w-20 rounded-lg border-2 border-cr bg-cr px-2 py-1 text-right" value={v[id]?.[k] ?? ''} onChange={e => set(id, k, e.target.value)} />;
  const lap = async () => { const r = await run('partner.report', { kode: me.kode, items: me.rows.map(x => ({ vid: x.vid, terjual: v[x.vid]?.t, sisa: v[x.vid]?.s })) }, 'Laporan terkirim. Terima kasih!'); if (r) { setV({}); reload(); } };
  const res = async () => { const r = await run('partner.restok', { kode: me.kode, cat, items: me.rows.map(x => ({ vid: x.vid, qty: v[x.vid]?.r })) }, 'Permintaan restok terkirim.'); if (r) { setV({}); setCat(''); } };
  return <><div className="flex justify-between items-end flex-wrap gap-2"><H>{me.nama}</H><button className="btn-g mb-4" onClick={out}>Keluar</button></div>
    <div className="card"><p className="text-sm mb-3">Isi hanya baris yang berubah. <b>Terjual</b> mengurangi stok di tempatmu dan tercatat sebagai penjualan. <b>Sisa fisik</b> adalah hasil hitung langsung, dipakai untuk mencocokkan dengan catatan sistem.</p>
      <Tbl head={['Varian', 'Stok di mitra', 'Terjual', 'Sisa fisik', 'Minta restok']}>{me.rows.map(x => <tr key={x.vid}><td className="td">{x.nm}</td><td className="td font-semibold">{x.stok}</td><td className="td">{inp(x.vid, 't')}</td><td className="td">{inp(x.vid, 's')}</td><td className="td">{inp(x.vid, 'r')}</td></tr>)}</Tbl>
      <L t="Catatan restok (opsional)" c="mt-3"><input className="inp" maxLength="120" value={cat} onChange={e => setCat(e.target.value)} /></L>
      <div className="flex flex-wrap gap-2 mt-3"><button className="btn" onClick={lap}>Kirim laporan penjualan</button><button className="btn-g" onClick={res}>Ajukan restok</button></div></div></>;
}

/* ───────── ADMIN ───────── */
function Ringkasan({ d, go }) {
  const a = d.v.filter(x => x.aktif), c = { aman: 0, menipis: 0, habis: 0 }; a.forEach(x => c[stat(x)]++);
  const w = a.filter(x => stat(x) !== 'aman').sort((x, y) => x.stok - y.stok);
  const nb = d.o.filter(o => o.status === 'baru').length, rq = (d.q || []).filter(x => x.status === 'baru').length;
  const box = { aman: 'bg-pe text-ok', menipis: 'bg-or text-ink', habis: 'bg-rd text-cr' };
  return <><H>Kondisi hari ini</H>
    <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-5">{['aman', 'menipis', 'habis'].map(k => <button key={k} onClick={() => go('stok')} className={`${box[k]} rounded-3xl p-3 sm:p-5 text-left shadow-[5px_5px_0_#C46F26]`}><b className="block font-display font-normal text-5xl sm:text-6xl">{c[k]}</b><span className="text-sm">varian {k}</span></button>)}</div>
    <div className="grid sm:grid-cols-2 gap-4 mb-5">
      <button onClick={() => go('pesanan')} className="card !mb-0 text-left"><b className="font-display font-normal text-4xl text-rd">{nb}</b> <span>pesanan baru menunggu diproses</span></button>
      <button onClick={() => go('mitra')} className="card !mb-0 text-left"><b className="font-display font-normal text-4xl text-rd">{rq}</b> <span>permintaan restok dari mitra</span></button></div>
    <div className="card"><h3 className="text-2xl text-rd mb-2">Peringatan stok menipis</h3>
      {w.length ? w.map(x => <div key={x.id} className="flex flex-wrap justify-between gap-2 items-center py-2 border-t border-dashed border-sh first:border-0"><div><b>{nm(x)}</b><br /><span className="text-sm">Stok {x.stok} · batas minimum {x.min}</span></div><Pill k={stat(x)}>{LB[stat(x)]}</Pill></div>) : <Empty>Semua varian di atas batas minimum.</Empty>}</div></>;
}

function Pesanan({ d, run, notify, pin }) {
  const [fl, setFl] = useState(''), [query, setQuery] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState(''), [selectedId, setSelectedId] = useState(null), [emailState, setEmailState] = useState({});
  const modalRef = useRef(null);
  const BL = { diproses: 'Proses', dikirim: 'Tandai dikirim', selesai: 'Selesai', batal: 'Batalkan' };
  const list = [...d.o].reverse().filter(o => {
    const needle = query.trim().toLowerCase();
    const date = String(o.tanggal || o.t || '').slice(0, 10);
    return (!fl || o.status === fl)
      && (!needle || o.no.toLowerCase().includes(needle) || o.nama.toLowerCase().includes(needle))
      && (!from || date >= from)
      && (!to || date <= to);
  });
  const chg = async (o, s) => {
    if (s === 'batal' && !confirm(`Batalkan ${o.no}? Stok akan dikembalikan.`)) return;
    const updated = await run('order.status', { id: o.id, status: s });
    if (!updated) return;
    const key = `${o.no}:${s}`;
    setEmailState(state => ({ ...state, [key]: 'sending' }));
    try {
      const delivery = await sendOrderEmail(o.no, 'status', pin, findLocalOrder(o.no));
      setEmailState(state => ({ ...state, [key]: 'sent' }));
      notify(delivery.recipient === 'test' ? 'Status diperbarui dan email uji terkirim ke penerima Resend yang dikonfigurasi.' : `Status diperbarui dan email ${STATUS[s]} terkirim.`);
    } catch (error) {
      setEmailState(state => ({ ...state, [key]: 'failed' }));
      notify(`Status diperbarui, tetapi email gagal terkirim: ${error.message}`, true);
    }
  };
  const reset = () => { setFl(''); setQuery(''); setFrom(''); setTo(''); };
  const selected = d.o.find(o => o.id === selectedId);
  useEffect(() => {
    if (!selectedId) return undefined;
    const closeOnEscape = event => { if (event.key === 'Escape') setSelectedId(null); };
    addEventListener('keydown', closeOnEscape);
    return () => removeEventListener('keydown', closeOnEscape);
  }, [selectedId]);
  useLayoutEffect(() => {
    if (!selected || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const ctx = gsap.context(() => gsap.from(modalRef.current, { y: 12, opacity: 0, duration: 0.2, ease: 'power2.out' }));
    return () => ctx.revert();
  }, [selectedId, selected]);
  const resendStatusEmail = async order => {
    const key = `${order.no}:${order.status}`;
    setEmailState(state => ({ ...state, [key]: 'sending' }));
    try {
      const delivery = await sendOrderEmail(order.no, 'status', pin, findLocalOrder(order.no));
      setEmailState(state => ({ ...state, [key]: 'sent' }));
      notify(delivery.recipient === 'test' ? 'Email uji terkirim ke penerima Resend yang dikonfigurasi.' : 'Email pembaruan status terkirim.');
    } catch (error) {
      setEmailState(state => ({ ...state, [key]: 'failed' }));
      notify(`Email gagal dikirim: ${error.message}`, true);
    }
  };
  return <><H>Pesanan</H>
    <section className="card order-filters" aria-label="Cari dan filter pesanan">
      <label className="lbl">Cari pesanan<input className="inp" type="search" placeholder="Nomor pesanan atau nama pelanggan" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <label className="lbl">Status<select className="inp" value={fl} onChange={e => setFl(e.target.value)}><option value="">Semua status</option>{Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="lbl">Dari tanggal<input className="inp" type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label className="lbl">Sampai tanggal<input className="inp" type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
      <button className="btn-g order-reset" onClick={reset}>Reset filter</button>
    </section>
    <div className="order-list-heading"><p>{list.length} dari {d.o.length} pesanan</p></div>
    {!list.length && <Empty>{d.o.length ? 'Tidak ada pesanan yang cocok dengan filter.' : 'Belum ada pesanan.'}</Empty>}
    {list.map(o => <article key={o.id} className="card order-card">
      <div className="order-card-top"><div><p className="eyebrow">Nomor pesanan</p><h3>{o.no}</h3></div><Pill k={o.status}>{STATUS[o.status]}</Pill></div>
      <div className="order-card-meta"><span><small>Pelanggan</small><b>{o.nama}</b></span><span><small>Tanggal</small><b>{tanggalOrder(o)}</b></span><span><small>Jumlah item</small><b>{o.items.reduce((sum, item) => sum + item.qty, 0)}</b></span><span><small>Total</small><b>{rp(o.total)}</b></span></div>
      <div className="order-card-actions"><button className="btn-g btn-sm" onClick={() => setSelectedId(o.id)}>Detail pesanan</button>{(NEXT[o.status] || []).map(s => <button key={s} className={(s === 'batal' ? 'btn-g' : 'btn') + ' btn-sm'} onClick={() => chg(o, s)}>{BL[s]}</button>)}</div>
    </article>)}
    {selected && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSelectedId(null); }}>
      <section ref={modalRef} className="order-modal" role="dialog" aria-modal="true" aria-labelledby="order-modal-title">
        <div className="order-modal-heading"><div><p className="eyebrow">Detail pesanan</p><h2 id="order-modal-title">{selected.no}</h2></div><button className="btn-g btn-sm" aria-label="Tutup detail pesanan" onClick={() => setSelectedId(null)}>Tutup</button></div>
        <div className="order-detail-meta"><p><small>Pelanggan</small><b>{selected.nama}</b></p><p><small>Email</small><b>{selected.email || 'Belum tersedia'}</b></p><p><small>Nomor telepon</small><b>{selected.hp}</b></p><p><small>Tanggal pesanan</small><b>{tanggalOrder(selected)}</b></p><p><small>Status</small><Pill k={selected.status}>{STATUS[selected.status]}</Pill></p>
          {selected.alamat && <p className="order-detail-wide"><small>Alamat</small><b>{selected.alamat}</b></p>}{selected.cat && <p className="order-detail-wide"><small>Catatan</small><b>{selected.cat}</b></p>}</div>
        <div className="order-detail-items"><h3>Item pesanan</h3>{selected.items.map(i => <div key={i.vid}><span>{i.nm} <small>{i.qty} × {rp(i.harga)}</small></span><b>{rp(i.qty * i.harga)}</b></div>)}
          <p><span>Total pesanan</span><b>{rp(selected.total)}</b></p>
        </div>
        {emailState[`${selected.no}:${selected.status}`] === 'failed' && <p className="email-retry-note" role="alert">Email pembaruan status gagal. Status pesanan tetap tersimpan.</p>}
        {emailState[`${selected.no}:${selected.status}`] === 'sent' && <p className="email-retry-note" role="status">Email pembaruan status telah terkirim.</p>}
        <div className="order-modal-actions">
          {emailState[`${selected.no}:${selected.status}`] === 'failed' && <button className="btn" onClick={() => resendStatusEmail(selected)}>Kirim ulang email</button>}
          {emailState[`${selected.no}:${selected.status}`] === 'sending' && <span className="text-sm">Mengirim email…</span>}
          {(NEXT[selected.status] || []).map(s => <button key={s} className={s === 'batal' ? 'btn-g' : 'btn'} onClick={() => chg(selected, s)}>{BL[s]}</button>)}
        </div>
      </section>
    </div>}
  </>;
}

function Stok({ d, run }) {
  const a = d.v.filter(v => v.aktif), [f, setF] = useState({ vid: '', jenis: 'masuk', jumlah: '', oleh: localStorage.getItem('k_oleh') || '', cat: '' }), [q, setQ] = useState(''), [sel, setSel] = useState('');
  const on = k => e => setF(x => ({ ...x, [k]: e.target.value })), vid = f.vid || a[0]?.id, byId = Object.fromEntries(d.v.map(v => [v.id, v]));
  const sub = async e => { e.preventDefault(); localStorage.setItem('k_oleh', f.oleh); const r = await run('stock.add', { ...f, vid }, 'Stok tersimpan.'); if (r) setF(x => ({ ...x, jumlah: '', cat: '' })); };
  const rows = d.v.filter(v => !q || nm(v).toLowerCase().includes(q.toLowerCase())), logs = [...d.l].reverse().filter(l => !sel || l.vid === sel).slice(0, sel ? 100 : 15);
  return <><H>Stok pusat</H>
    <form onSubmit={sub} className="card grid sm:grid-cols-2 lg:grid-cols-3 gap-3"><h3 className="text-2xl text-rd sm:col-span-full">Catat perubahan stok</h3>
      <L t="Varian" c="lg:col-span-2"><select className="inp" value={vid} onChange={on('vid')}>{a.map(v => <option key={v.id} value={v.id}>{nm(v)} — stok {v.stok}</option>)}</select></L>
      <L t="Jenis"><select className="inp" value={f.jenis} onChange={on('jenis')}><option value="masuk">Stok masuk</option><option value="keluar">Stok keluar</option><option value="awal">Stok awal</option><option value="sesuai">Penyesuaian (hitung fisik)</option></select></L>
      <L t={f.jenis === 'sesuai' ? 'Stok hasil hitung fisik' : 'Jumlah'}><input className="inp" type="number" min="0" required inputMode="numeric" value={f.jumlah} onChange={on('jumlah')} /></L>
      <L t="Dicatat oleh"><input className="inp" required maxLength="40" value={f.oleh} onChange={on('oleh')} /></L>
      <L t="Catatan (opsional)"><input className="inp" maxLength="120" value={f.cat} onChange={on('cat')} /></L>
      <div className="sm:col-span-full"><button className="btn" disabled={!a.length}>Simpan perubahan</button></div></form>
    <div className="card"><input className="inp !mt-0 mb-3 sm:max-w-xs" placeholder="Cari produk atau varian" value={q} onChange={e => setQ(e.target.value)} />
      <Tbl head={['Produk', 'Varian', 'Ukuran', 'Stok', 'Min.', 'Status', '']}>{rows.map(v => <tr key={v.id}><td className="td">{v.produk}</td><td className="td">{v.varian}</td><td className="td">{v.ukuran}</td><td className="td font-semibold">{v.stok}</td><td className="td">{v.min}</td><td className="td">{v.aktif ? <Pill k={stat(v)}>{LB[stat(v)]}</Pill> : <Pill k="off">Nonaktif</Pill>}</td><td className="td"><button className="btn-g btn-sm" onClick={() => setSel(v.id)}>Riwayat</button></td></tr>)}</Tbl></div>
    <div className="card"><div className="flex justify-between items-center mb-2"><h3 className="text-2xl text-rd">{sel ? `Riwayat: ${nm(byId[sel])}` : 'Pencatatan terakhir'}</h3>{sel && <button className="btn-g btn-sm" onClick={() => setSel('')}>Semua</button>}</div>
      {logs.length ? <Tbl head={['Waktu', ...(sel ? [] : ['Varian']), 'Jenis', 'Perubahan', 'Stok akhir', 'Oleh', 'Catatan']}>{logs.map(l => <tr key={l.id}><td className="td whitespace-nowrap">{tgl(l.t)}</td>{!sel && <td className="td">{byId[l.vid] ? nm(byId[l.vid]) : '-'}</td>}<td className="td">{JENIS[l.jenis]}</td><td className={'td font-semibold ' + (l.jumlah >= 0 ? 'text-ok' : 'text-rd')}>{l.jumlah > 0 ? '+' : ''}{l.jumlah}</td><td className="td">{l.setelah}</td><td className="td">{l.oleh}</td><td className="td">{l.cat}</td></tr>)}</Tbl> : <Empty>Belum ada pencatatan.</Empty>}</div></>;
}

function Produk({ d, run }) {
  const empty = { produk: '', varian: '', ukuran: '', harga: '', min: '', awal: '0' }, [f, setF] = useState(empty), [id, setId] = useState(null), on = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const sub = async e => { e.preventDefault(); const r = await run('product.save', { ...f, id }, id ? 'Varian diperbarui.' : 'Varian ditambahkan.'); if (r) { setF(empty); setId(null); } };
  return <><H>Produk & varian</H>
    <form onSubmit={sub} className="card grid sm:grid-cols-2 lg:grid-cols-3 gap-3"><h3 className="text-2xl text-rd sm:col-span-full">{id ? 'Ubah varian' : 'Tambah varian'}</h3>
      <L t="Produk"><input className="inp" required maxLength="40" placeholder="Basreng" value={f.produk} onChange={on('produk')} /></L>
      <L t="Varian rasa"><input className="inp" required maxLength="40" placeholder="Pedas Daun Jeruk" value={f.varian} onChange={on('varian')} /></L>
      <L t="Ukuran / kemasan"><input className="inp" required maxLength="30" placeholder="100 gr" value={f.ukuran} onChange={on('ukuran')} /></L>
      <L t="Harga (Rp)"><input className="inp" type="number" min="0" step="500" required value={f.harga} onChange={on('harga')} /></L>
      <L t="Batas minimum stok"><input className="inp" type="number" min="0" required value={f.min} onChange={on('min')} /></L>
      {!id && <L t="Stok awal (opsional)"><input className="inp" type="number" min="0" value={f.awal} onChange={on('awal')} /></L>}
      <div className="sm:col-span-full flex gap-2"><button className="btn">{id ? 'Simpan perubahan' : 'Tambah varian'}</button>{id && <button type="button" className="btn-g" onClick={() => { setId(null); setF(empty); }}>Batal</button>}</div></form>
    <div className="card">{d.v.length ? <Tbl head={['Produk', 'Varian', 'Ukuran', 'Harga', 'Min.', 'Status', '']}>{d.v.map(v => <tr key={v.id}><td className="td">{v.produk}</td><td className="td">{v.varian}</td><td className="td">{v.ukuran}</td><td className="td">{rp(v.harga)}</td><td className="td">{v.min}</td><td className="td">{v.aktif ? <Pill k="aman">Aktif</Pill> : <Pill k="off">Nonaktif</Pill>}</td>
      <td className="td whitespace-nowrap"><button className="btn-g btn-sm mr-1" onClick={() => { setId(v.id); setF({ produk: v.produk, varian: v.varian, ukuran: v.ukuran, harga: v.harga, min: v.min, awal: '0' }); scrollTo(0, 0); }}>Ubah</button><button className="btn-g btn-sm" onClick={() => run('product.toggle', { id: v.id })}>{v.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button></td></tr>)}</Tbl> : <Empty>Belum ada varian.</Empty>}
      <p className="text-xs mt-2">Varian nonaktif tidak tampil di halaman pesan, tetapi riwayat stoknya tetap tersimpan.</p></div></>;
}

function MitraAdmin({ d, run }) {
  const a = d.v.filter(v => v.aktif), [f, setF] = useState({ nama: '', lokasi: '', kode: '' }), [ship, setShip] = useState({}), mid = Object.fromEntries(d.m.map(m => [m.id, m]));
  const sub = async e => { e.preventDefault(); const r = await run('partner.save', f, 'Mitra ditambahkan.'); if (r) setF({ nama: '', lokasi: '', kode: '' }); };
  const kirim = async m => { const r = await run('partner.ship', { mid: m.id, items: toItems(ship[m.id] || {}) }, `Stok dikirim ke ${m.nama}.`); if (r) setShip(s => ({ ...s, [m.id]: {} })); };
  const rq = [...(d.q || [])].reverse().filter(x => x.status === 'baru'), rr = [...(d.r || [])].reverse().slice(0, 8);
  return <><H>Mitra</H>
    <form onSubmit={sub} className="card grid sm:grid-cols-4 gap-3 items-end"><L t="Nama mitra"><input className="inp" required value={f.nama} onChange={e => setF({ ...f, nama: e.target.value })} /></L><L t="Lokasi"><input className="inp" value={f.lokasi} onChange={e => setF({ ...f, lokasi: e.target.value })} /></L><L t="Kode login mitra"><input className="inp uppercase" required minLength="4" maxLength="12" value={f.kode} onChange={e => setF({ ...f, kode: e.target.value })} /></L><button className="btn">Tambah mitra</button></form>
    {rq.length > 0 && <div className="card"><h3 className="text-2xl text-rd mb-2">Permintaan restok</h3>{rq.map(x => <div key={x.id} className="flex flex-wrap justify-between gap-2 py-2 border-t border-dashed border-sh first:border-0 text-sm"><div><b>{mid[x.mid]?.nama}</b> · {tgl(x.t)}<br />{x.items.map(i => `${i.qty}× ${i.nm}`).join(', ')}{x.cat && ` — ${x.cat}`}</div><button className="btn-g btn-sm" onClick={() => run('restok.done', { id: x.id }, 'Ditandai selesai.')}>Tandai dipenuhi</button></div>)}<p className="text-xs mt-2">Penuhi dengan “Kirim stok” pada kartu mitra di bawah, lalu tandai selesai.</p></div>}
    {d.m.map(m => <div key={m.id} className="card"><div className="flex flex-wrap justify-between gap-2"><h3 className="text-2xl text-rd">{m.nama}</h3><span className="text-sm">Kode: <b>{m.kode}</b>{m.lokasi && ` · ${m.lokasi}`}</span></div>
      <p className="text-sm my-2">Stok di mitra: {a.map(v => `${v.varian} ${m.stok[v.id] || 0}`).join(' · ') || '-'}</p>
      <QtyGrid vs={a} val={ship[m.id] || {}} set={x => setShip(s => ({ ...s, [m.id]: x }))} max={v => v.stok} />
      <button className="btn mt-3" onClick={() => kirim(m)}>Kirim stok ke mitra</button></div>)}
    <div className="card"><h3 className="text-2xl text-rd mb-2">Laporan mitra terbaru</h3>{rr.length ? rr.map(r => <div key={r.id} className="py-2 border-t border-dashed border-sh first:border-0 text-sm"><b>{mid[r.mid]?.nama}</b> · {tgl(r.t)}{r.rows.map(x => <div key={x.vid}>{x.nm}: terjual {x.terjual}, sisa sistem {x.sisaSistem}{x.sisaFisik !== null && <>, sisa fisik {x.sisaFisik} {x.selisih !== 0 ? <Pill k="habis">Selisih {x.selisih > 0 ? '+' : ''}{x.selisih}</Pill> : <Pill k="aman">Cocok</Pill>}</>}</div>)}</div>) : <Empty>Belum ada laporan dari mitra.</Empty>}</div></>;
}

function Penjualan({ d, run }) {
  const a = d.v.filter(v => v.aktif), [lok, setLok] = useState(''), [q, setQ] = useState({}), K = { online: 'Online', mitra: 'Mitra', cfd: 'CFD/langsung' };
  const sub = async e => { e.preventDefault(); const r = await run('cfd.sale', { lokasi: lok, items: toItems(q) }, 'Penjualan tercatat, stok berkurang.'); if (r) { setQ({}); setLok(''); } };
  return <><H>Penjualan</H>
    <form onSubmit={sub} className="card space-y-3"><h3 className="text-2xl text-rd">Catat penjualan CFD / langsung</h3><L t="Lokasi atau acara"><input className="inp sm:max-w-sm" placeholder="mis. CFD Taman Bungkul" value={lok} onChange={e => setLok(e.target.value)} /></L><QtyGrid vs={a} val={q} set={setQ} max={v => v.stok} /><button className="btn">Simpan penjualan</button></form>
    <div className="card"><h3 className="text-2xl text-rd mb-2">Riwayat penjualan</h3><p className="text-xs mb-2">Pesanan online masuk ke sini saat statusnya Selesai; penjualan mitra masuk saat mitra mengirim laporan.</p>
      {d.s.length ? <Tbl head={['Waktu', 'Kanal', 'Referensi', 'Isi', 'Total']}>{[...d.s].reverse().slice(0, 100).map(s => <tr key={s.id}><td className="td whitespace-nowrap">{tgl(s.t)}</td><td className="td">{K[s.kanal]}</td><td className="td">{s.ref}</td><td className="td">{s.items.map(i => `${i.qty}× ${i.nm}`).join(', ')}</td><td className="td font-semibold">{rp(s.total)}</td></tr>)}</Tbl> : <Empty>Belum ada penjualan tercatat.</Empty>}</div></>;
}

function Laporan({ d }) {
  const [per, setPer] = useState('30'), from = per === '0' ? 0 : Date.now() - Number(per) * 864e5;
  const s = d.s.filter(x => +new Date(x.t) >= from), omzet = s.reduce((a, x) => a + x.total, 0), top = {}, kn = {}, mv = {};
  s.forEach(x => { kn[x.kanal] = (kn[x.kanal] || 0) + x.total; x.items.forEach(i => { top[i.nm] ||= { q: 0, r: 0 }; top[i.nm].q += i.qty; top[i.nm].r += i.qty * i.harga; }); });
  d.l.filter(l => +new Date(l.t) >= from).forEach(l => { mv[l.jenis] = (mv[l.jenis] || 0) + l.jumlah; });
  const tl = Object.entries(top).sort((a, b) => b[1].q - a[1].q), mx = tl[0]?.[1].q || 1, KL = { online: 'Online', mitra: 'Mitra', cfd: 'CFD/langsung' };
  return <><div className="flex flex-wrap justify-between items-end gap-2"><H>Laporan</H><select className="inp !w-auto mb-4" value={per} onChange={e => setPer(e.target.value)}><option value="7">7 hari terakhir</option><option value="30">30 hari terakhir</option><option value="0">Semua waktu</option></select></div>
    <div className="grid grid-cols-2 gap-4 mb-5"><div className="card !mb-0"><p className="text-sm">Omzet</p><b className="font-display font-normal text-4xl text-rd">{rp(omzet)}</b></div><div className="card !mb-0"><p className="text-sm">Jumlah transaksi</p><b className="font-display font-normal text-4xl text-rd">{s.length}</b></div></div>
    <div className="card"><h3 className="text-2xl text-rd mb-2">Produk terlaris</h3>{tl.length ? tl.map(([n, x]) => <div key={n} className="mb-2 text-sm"><div className="flex justify-between"><span>{n}</span><span>{x.q} bungkus · {rp(x.r)}</span></div><div className="h-2.5 rounded-full bg-cr"><div className="h-full rounded-full bg-or" style={{ width: x.q / mx * 100 + '%' }} /></div></div>) : <Empty>Belum ada penjualan pada periode ini.</Empty>}</div>
    <div className="grid sm:grid-cols-2 gap-4"><div className="card"><h3 className="text-2xl text-rd mb-2">Penjualan per kanal</h3>{Object.keys(kn).length ? Object.entries(kn).map(([k, v]) => <p key={k} className="flex justify-between text-sm py-1"><span>{KL[k]}</span><b>{rp(v)}</b></p>) : <Empty>Belum ada data.</Empty>}</div>
      <div className="card"><h3 className="text-2xl text-rd mb-2">Pergerakan stok pusat</h3>{Object.keys(mv).length ? Object.entries(mv).map(([k, v]) => <p key={k} className="flex justify-between text-sm py-1"><span>{JENIS[k]}</span><b className={v >= 0 ? 'text-ok' : 'text-rd'}>{v > 0 ? '+' : ''}{v}</b></p>) : <Empty>Belum ada data.</Empty>}</div></div></>;
}

const ADMIN_NAV = [
  ['ring', 'Overview', '⌂', 'OVERVIEW'], ['pesanan', 'Pesanan', '◌', 'BUSINESS'], ['produk', 'Produk', '▦', 'BUSINESS'],
  ['stok', 'Inventori', '▤', 'BUSINESS'], ['mitra', 'Mitra', '◎', 'BUSINESS'], ['jual', 'Penjualan langsung', '↗', 'BUSINESS'],
  ['lap', 'Laporan', '⌁', 'ANALYTICS']
];

function AdminSidebar({ tab, setTab, logout, pending }) {
  let group = '';
  return <aside className="admin-sidebar">
    <div className="admin-brand"><span className="admin-brand-mark">K</span><span><b>KUNCI</b><small>Control centre</small></span></div>
    <div className="admin-nav">{ADMIN_NAV.map(([key, label, icon, section]) => {
      const title = group !== section ? <p key={section} className="admin-nav-label">{section}</p> : null;
      group = section;
      return <Fragment key={key}>{title}<button className={tab === key ? 'active' : ''} onClick={() => setTab(key)}><span className="admin-icon">{icon}</span>{label}{key === 'pesanan' && pending > 0 && <em>{pending}</em>}</button></Fragment>;
    })}</div>
    <div className="admin-sidebar-footer"><span className="admin-avatar">A</span><span><b>Admin bisnis</b><small>Workspace owner</small></span><button aria-label="Keluar" onClick={logout}>↪</button></div>
  </aside>;
}

function Kpi({ label, value, note, tone = 'default' }) {
  return <div className={'kpi-card kpi-' + tone}><div className="kpi-top"><span>{label}</span><i /></div><strong>{value}</strong><small>{note}</small></div>;
}

function Dashboard({ d, go }) {
  const sold = d.s.reduce((sum, x) => sum + x.items.reduce((n, i) => n + i.qty, 0), 0);
  const revenue = d.s.reduce((sum, x) => sum + x.total, 0);
  const active = d.v.filter(x => x.aktif), low = active.filter(x => stat(x) !== 'aman').sort((a, b) => a.stok - b.stok);
  const pending = d.o.filter(x => x.status === 'baru').length, partners = d.m.filter(x => x.aktif !== false).length;
  const productMap = {};
  d.s.forEach(s => s.items.forEach(i => { productMap[i.nm] ||= { qty: 0, revenue: 0 }; productMap[i.nm].qty += i.qty; productMap[i.nm].revenue += i.qty * i.harga; }));
  const top = Object.entries(productMap).sort((a, b) => b[1].qty - a[1].qty).slice(0, 4), maxTop = top[0]?.[1].qty || 1;
  const days = [...Array(7)].map((_, index) => { const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (6 - index)); const key = date.toISOString().slice(0, 10); return { key, label: date.toLocaleDateString('id-ID', { weekday: 'short' }), total: d.s.filter(x => x.t.slice(0, 10) === key).reduce((n, x) => n + x.total, 0) }; });
  const maxDay = Math.max(...days.map(x => x.total), 1), orderStates = Object.entries(STATUS).map(([key, label]) => ({ key, label, count: d.o.filter(x => x.status === key).length })).filter(x => x.count);
  const distributed = d.m.reduce((sum, m) => sum + Object.values(m.stok || {}).reduce((n, qty) => n + Number(qty || 0), 0), 0);
  return <div className="dashboard-page">
    <div className="admin-topbar"><div><p className="eyebrow">Workspace / Overview</p><h1>Business overview</h1><p className="admin-subtitle">Pantau penjualan, inventori, dan operasional dalam satu ruang kerja.</p></div><div className="admin-period"><span className="status-dot" /> Live workspace <b>{new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</b></div></div>
    <div className="dashboard-hero"><div><span className="eyebrow light">Pedasan Kunchung / Command centre</span><h2>Good morning, admin.</h2><p>Berikut ringkasan kondisi bisnis berdasarkan transaksi yang sudah tercatat.</p></div><button className="btn light-btn" onClick={() => go('pesanan')}>Lihat pesanan <span>↗</span></button></div>
    <div className="kpi-grid"><Kpi label="Total omzet" value={rp(revenue)} note={d.s.length ? `${d.s.length} transaksi tercatat` : 'Belum ada transaksi'} tone="accent" /><Kpi label="Total pesanan" value={d.o.length} note={pending ? `${pending} perlu diproses` : 'Tidak ada pesanan baru'} tone="warm" /><Kpi label="Produk terjual" value={sold} note={`${active.length} varian aktif`} /><Kpi label="Status inventori" value={low.length} note={low.length ? `${low.length} varian perlu perhatian` : 'Semua stok aman'} tone={low.length ? 'warning' : 'good'} /></div>
    <div className="dashboard-grid dashboard-grid-main">
      <section className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">Performance</p><h3>Revenue trend</h3></div><span className="panel-note">7 hari terakhir</span></div>{d.s.length ? <div className="bar-chart" aria-label="Grafik omzet tujuh hari terakhir">{days.map(day => <div className="bar-column" key={day.key}><div className="bar-value">{day.total ? rp(day.total).replace('Rp', 'Rp ') : '—'}</div><div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max(day.total / maxDay * 100, day.total ? 8 : 2)}%` }} /></div><span>{day.label}</span></div>)}</div> : <Empty>Grafik akan muncul setelah transaksi selesai tercatat.</Empty>}</section>
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Orders</p><h3>Order activity</h3></div><button className="text-link" onClick={() => go('pesanan')}>Kelola ↗</button></div>{orderStates.length ? <div className="order-status-list">{orderStates.map(item => <button key={item.key} onClick={() => go('pesanan')}><span className={'status-dot status-' + item.key} /><span>{item.label}</span><b>{item.count}</b></button>)}</div> : <Empty>Belum ada aktivitas order.</Empty>}<div className="panel-divider" /><div className="mini-metric"><span>Active partners</span><b>{partners}</b><small>{distributed} unit stok terdistribusi</small></div></section>
    </div>
    <div className="dashboard-grid dashboard-grid-secondary"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">Inventory intelligence</p><h3>Stock watchlist</h3></div><button className="text-link" onClick={() => go('stok')}>Buka inventori ↗</button></div>{low.length ? <div className="stock-list">{low.slice(0, 4).map(item => <button key={item.id} onClick={() => go('stok')}><span><b>{item.varian}</b><small>{item.ukuran} · minimum {item.min}</small></span><strong className={stat(item) === 'habis' ? 'danger' : ''}>{item.stok}<small>unit tersisa</small></strong></button>)}</div> : <Empty>Semua varian berada di atas batas minimum.</Empty>}</section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">Product performance</p><h3>Top sellers</h3></div><button className="text-link" onClick={() => go('lap')}>Lihat laporan ↗</button></div>{top.length ? <div className="top-products">{top.map(([name, item], index) => <div key={name}><span className="rank">0{index + 1}</span><div className="product-bar"><div><b>{name}</b><span>{item.qty} unit · {rp(item.revenue)}</span></div><i><em style={{ width: `${item.qty / maxTop * 100}%` }} /></i></div></div>)}</div> : <Empty>Belum ada penjualan untuk dirangking.</Empty>}</section></div>
    <section className="panel recent-orders"><div className="panel-heading"><div><p className="eyebrow">Aktivitas terbaru</p><h3>Pesanan terakhir</h3></div><button className="text-link" onClick={() => go('pesanan')}>Semua pesanan ↗</button></div>{d.o.length ? <div className="recent-order-list">{[...d.o].reverse().slice(0, 5).map(order => <button key={order.id} onClick={() => go('pesanan')}><span><b>{order.no} · {order.nama}</b><small>{tgl(order.t)}</small></span><span className="recent-order-total"><b>{rp(order.total)}</b><Pill k={order.status}>{STATUS[order.status]}</Pill></span></button>)}</div> : <Empty>Aktivitas pesanan akan tampil di sini.</Empty>}</section>
    <div className="quick-actions"><span className="eyebrow">Quick actions</span><button onClick={() => go('produk')}>＋ Tambah produk</button><button onClick={() => go('stok')}>＋ Update stok</button><button onClick={() => go('jual')}>＋ Catat penjualan</button><button onClick={() => go('mitra')}>＋ Tambah mitra</button></div>
  </div>;
}

function Admin({ d, run, logout, notify, pin }) {
  const [tab, setTab] = useState('ring'), T = [['ring', 'Ringkasan'], ['pesanan', 'Pesanan'], ['stok', 'Stok'], ['produk', 'Produk'], ['mitra', 'Mitra'], ['jual', 'Penjualan'], ['lap', 'Laporan']], nb = d.o.filter(o => o.status === 'baru').length;
  const V = { ring: <Dashboard d={d} go={setTab} />, pesanan: <Pesanan d={d} run={run} notify={notify} pin={pin} />, stok: <Stok d={d} run={run} />, produk: <Produk d={d} run={run} />, mitra: <MitraAdmin d={d} run={run} />, jual: <Penjualan d={d} run={run} />, lap: <Laporan d={d} /> };
  return <div className="admin-layout"><AdminSidebar tab={tab} setTab={setTab} logout={logout} pending={nb} /><section className="admin-content"><div className="admin-mobile-nav">{T.map(([k, n]) => <button key={k} onClick={() => setTab(k)} className={tab === k ? 'active' : ''}>{n}{k === 'pesanan' && nb > 0 && ` (${nb})`}</button>)}</div>{V[tab]}</section></div>;
}

function Login({ onLogin }) {
  const [p, setP] = useState('');
  return <form onSubmit={e => { e.preventDefault(); onLogin(p); }} className="card max-w-sm mx-auto space-y-3"><h2 className="text-4xl text-or">Masuk admin</h2><L t="PIN"><input className="inp" type="password" required autoFocus value={p} onChange={e => setP(e.target.value)} /></L><button className="btn">Masuk</button></form>;
}

/* ───────── SHELL ───────── */
gsap.registerPlugin(ScrollTrigger);

export default function App() {
  const routeFromLocation = () => location.hash.slice(1) || (location.pathname === '/tracking' ? '/tracking' : '/');
  const [route, setRoute] = useState(routeFromLocation), [catalog, setCatalog] = useState(null), [data, setData] = useState(null), [pin, setPin] = useState(sessionStorage.getItem('kpin') || ''), [toast, setToast] = useState(null);
  const shell = useRef(null);
  const say = (m, err) => { setToast({ m, err }); clearTimeout(window._kt); window._kt = setTimeout(() => setToast(null), 3200); };
  const refresh = useCallback(async p => { const r = await load(p ?? pin); setCatalog(r.catalog); setData(r.data); return r; }, [pin]);
  const run = async (type, payload, ok) => {
    try { const r = await act(type, payload, pin); if (r.catalog) setCatalog(r.catalog); if (r.data) setData(r.data); if (ok) say(ok); return r.res ?? {}; }
    catch (e) { say(e.message, 1); return null; }
  };
  const login = async p => { const r = await load(p); setCatalog(r.catalog); if (r.data) { setData(r.data); setPin(p); sessionStorage.setItem('kpin', p); } else say('PIN salah.', 1); };
  const logout = () => { setPin(''); setData(null); sessionStorage.removeItem('kpin'); };
  useEffect(() => { refresh().catch(() => say('Gagal memuat data.', 1)); const h = () => { setRoute(routeFromLocation()); scrollTo(0, 0); }; addEventListener('hashchange', h); addEventListener('popstate', h); const t = setInterval(() => refresh().catch(() => {}), 20000); return () => { removeEventListener('hashchange', h); removeEventListener('popstate', h); clearInterval(t); }; }, [refresh]);
  useLayoutEffect(() => {
    if (!shell.current) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = gsap.context(() => {
      if (reduced) return;
      const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
      const hero = shell.current.querySelector('[data-hero]');
      const nav = shell.current.querySelectorAll('[data-nav] a');
      const page = shell.current.querySelectorAll('[data-page] > *');
      if (hero) intro.from(hero, { y: -18, opacity: 0, duration: 0.55 });
      if (nav.length) intro.from(nav, { y: 10, opacity: 0, duration: 0.35, stagger: 0.06 }, hero ? '-=0.25' : undefined);
      if (page.length) intro.from(page, { y: 18, opacity: 0, duration: 0.45, stagger: 0.06 }, hero || nav.length ? '-=0.15' : undefined);
      gsap.utils.toArray('[data-page] .card').forEach((card, index) => {
        gsap.from(card, { y: 24, opacity: 0, duration: 0.5, delay: Math.min(index * 0.035, 0.25), ease: 'power2.out', scrollTrigger: { trigger: card, start: 'top 90%', once: true } });
      });
    }, shell);
    return () => ctx.revert();
  }, [route, catalog, data]);
  const N = [['/', 'Pesan'], ['/tracking', 'Lacak pesanan'], ['/mitra', 'Portal mitra'], ['/admin', 'Admin'], ['/demo-tracking', 'Demo user story']];
  const adminWorkspace = route === '/admin' && Boolean(data);
  let page;
  if (!catalog) page = <Empty>Memuat…</Empty>;
  else if (route === '/tracking' || route === '/lacak') page = <Track run={run} />;
  else if (route === '/demo-tracking') page = <DemoStories catalog={catalog} />;
  else if (route === '/mitra') page = <Mitra run={run} />;
  else if (route === '/admin') page = data ? <Admin d={data} run={run} logout={logout} notify={say} pin={pin} /> : <Login onLogin={login} />;
  else page = <Shop catalog={catalog} run={run} notify={say} />;
  return <div ref={shell} className="app-shell min-h-screen">
    {!adminWorkspace && <header className="site-header bg-or px-4 pt-4" data-hero><div className="max-w-5xl mx-auto flex items-end justify-between gap-3 flex-wrap">
      <a href="#/"><div className="font-display text-6xl sm:text-7xl leading-[.9] text-cr">KUNCI</div><p className="text-cr font-medium text-sm my-2">Pedasan Kunchung · stok, pesanan & penjualan terpusat</p></a></div>
      <nav className="site-nav max-w-5xl mx-auto flex gap-1.5 overflow-x-auto" data-nav aria-label="Navigasi utama">{N.map(([r, n]) => <a key={r} href={'#' + r} className={(route === r ? 'active ' : '') + 'px-4 py-2.5 rounded-t-2xl text-sm whitespace-nowrap'}>{n}</a>)}</nav></header>}
    <main className={'page-wrap' + (adminWorkspace ? ' admin-page-wrap' : '')} data-page>{page}</main>
    {!adminWorkspace && <footer className="site-footer"><span>KUNCI / Pedasan Kunchung</span><span>Stok, pesanan & penjualan terpusat</span></footer>}
    {toast && <div role="status" className={'toast fixed bottom-5 left-1/2 -translate-x-1/2 max-w-[92vw] rounded-2xl px-5 py-3 text-sm font-medium text-cr shadow-lg z-50 ' + (toast.err ? 'error bg-rd' : 'bg-ink')}>{toast.m}</div>}
  </div>;
}
