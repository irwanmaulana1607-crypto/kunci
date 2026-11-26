import { useCallback, useEffect, useState } from 'react';
import { load, act, getMode } from './api.js';
import { WA_NUMBER } from './config.js';
import { JENIS, STATUS, NEXT, stat } from '../shared/logic.js';

const rp = n => 'Rp' + Number(n || 0).toLocaleString('id-ID');
const tgl = t => new Date(t).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const wa = hp => 'https://wa.me/' + (hp.startsWith('0') ? '62' + hp.slice(1) : hp);
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
function Shop({ catalog, run }) {
  const [cart, setCart] = useState({}), [f, setF] = useState({ nama: '', hp: '', cat: '' }), [done, setDone] = useState(null), [busy, setBusy] = useState(false);
  const ls = catalog.filter(v => cart[v.id] > 0), total = ls.reduce((a, v) => a + v.harga * cart[v.id], 0), count = ls.reduce((a, v) => a + cart[v.id], 0);
  const q = (v, n) => setCart(c => ({ ...c, [v.id]: Math.max(0, Math.min(v.stok, n)) }));
  const on = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const submit = async e => {
    e.preventDefault(); setBusy(true);
    const r = await run('order.create', { ...f, items: ls.map(v => ({ vid: v.id, qty: cart[v.id] })) });
    setBusy(false);
    if (r) { setDone({ ...r, nama: f.nama }); setCart({}); setF({ nama: '', hp: '', cat: '' }); }
  };
  if (done) {
    const msg = encodeURIComponent(`Halo Pedasan Kunchung, saya ${done.nama} sudah memesan lewat KUNCI. Kode pesanan: ${done.no}.`);
    return <div className="card text-center max-w-lg mx-auto">
      <h2 className="text-5xl text-rd mb-2">Pesanan masuk!</h2>
      <p className="text-sm">Simpan kode ini untuk melacak pesananmu.</p>
      <p className="font-display text-6xl text-or my-3">{done.no}</p>
      <p className="mb-4">Total {rp(done.total)}. Admin akan menghubungimu lewat WhatsApp untuk konfirmasi dan pembayaran.</p>
      <div className="flex flex-wrap gap-2 justify-center">
        <a className="btn" href={`https://wa.me/${WA_NUMBER}?text=${msg}`} target="_blank" rel="noreferrer">Konfirmasi lewat WhatsApp</a>
        <a className="btn-g" href="#/lacak">Lacak pesanan</a>
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
          <L t="Nomor WhatsApp"><input className="inp" required inputMode="tel" placeholder="08xxxxxxxxxx" value={f.hp} onChange={on('hp')} /></L>
          <L t="Catatan (opsional)"><input className="inp" maxLength="120" placeholder="mis. ambil di kantin ITS" value={f.cat} onChange={on('cat')} /></L>
          <button className="btn w-full" disabled={busy}>{busy ? 'Mengirim…' : 'Kirim pesanan'}</button></>}
      </form>
    </div></>;
}

/* ───────── KONSUMEN: lacak ───────── */
function Track({ run }) {
  const [f, setF] = useState({ no: '', hp: '' }), [o, setO] = useState(null);
  const sub = async e => { e.preventDefault(); const r = await run('order.track', f); if (r) setO(r); };
  const flow = ['baru', 'diproses', 'dikirim', 'selesai'];
  return <div className="max-w-xl mx-auto"><H>Lacak pesanan</H>
    <form onSubmit={sub} className="card grid sm:grid-cols-2 gap-3">
      <L t="Kode pesanan"><input className="inp" required placeholder="KC-0001" value={f.no} onChange={e => setF({ ...f, no: e.target.value })} /></L>
      <L t="Nomor WhatsApp saat memesan"><input className="inp" required inputMode="tel" value={f.hp} onChange={e => setF({ ...f, hp: e.target.value })} /></L>
      <div className="sm:col-span-2"><button className="btn">Cek status</button></div></form>
    {o && <div className="card"><div className="flex justify-between items-center mb-3"><h3 className="text-3xl text-rd">{o.no}</h3><Pill k={o.status}>{STATUS[o.status]}</Pill></div>
      {o.status !== 'batal' && <ol className="grid grid-cols-4 gap-1 text-center text-xs mb-4">{flow.map((s, i) => <li key={s} className={'rounded-lg py-2 ' + (i <= flow.indexOf(o.status) ? 'bg-rd text-cr font-semibold' : 'bg-cr')}>{STATUS[s]}</li>)}</ol>}
      <ul className="text-sm space-y-1">{o.items.map(i => <li key={i.vid} className="flex justify-between"><span>{i.qty}× {i.nm}</span><span>{rp(i.qty * i.harga)}</span></li>)}</ul>
      <p className="flex justify-between font-semibold border-t border-sh mt-2 pt-2"><span>Total</span><span>{rp(o.total)}</span></p>
      <p className="text-xs mt-2">Dipesan {tgl(o.t)} atas nama {o.nama}</p></div>}
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

function Pesanan({ d, run }) {
  const [fl, setFl] = useState('baru'), BL = { diproses: 'Proses', dikirim: 'Tandai dikirim', selesai: 'Selesai', batal: 'Batalkan' };
  const list = [...d.o].reverse().filter(o => !fl || o.status === fl);
  const chg = (o, s) => { if (s === 'batal' && !confirm(`Batalkan ${o.no}? Stok akan dikembalikan.`)) return; run('order.status', { id: o.id, status: s }, 'Status diperbarui.'); };
  return <><H>Pesanan</H>
    <div className="flex gap-2 overflow-x-auto pb-3">{['', ...Object.keys(STATUS)].map(s => <button key={s} onClick={() => setFl(s)} className={'pill !px-4 !py-1.5 ' + (fl === s ? 'bg-rd text-cr' : 'bg-pe')}>{s ? STATUS[s] : 'Semua'} ({s ? d.o.filter(o => o.status === s).length : d.o.length})</button>)}</div>
    {!list.length && <Empty>Tidak ada pesanan di kategori ini.</Empty>}
    {list.map(o => <div key={o.id} className="card"><div className="flex flex-wrap justify-between gap-2"><div><h3 className="text-2xl text-rd">{o.no}</h3><p className="text-xs">{tgl(o.t)}</p></div><Pill k={o.status}>{STATUS[o.status]}</Pill></div>
      <p className="mt-2 text-sm"><b>{o.nama}</b> · <a className="underline" href={wa(o.hp)} target="_blank" rel="noreferrer">{o.hp}</a>{o.cat && <> · “{o.cat}”</>}</p>
      <ul className="text-sm mt-2">{o.items.map(i => <li key={i.vid}>{i.qty}× {i.nm}</li>)}</ul>
      <div className="flex flex-wrap justify-between items-center gap-2 mt-3"><b>{rp(o.total)}</b><div className="flex gap-2">{(NEXT[o.status] || []).map(s => <button key={s} className={(s === 'batal' ? 'btn-g' : 'btn') + ' btn-sm'} onClick={() => chg(o, s)}>{BL[s]}</button>)}</div></div></div>)}</>;
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

function Admin({ d, run, logout }) {
  const [tab, setTab] = useState('ring'), T = [['ring', 'Ringkasan'], ['pesanan', 'Pesanan'], ['stok', 'Stok'], ['produk', 'Produk'], ['mitra', 'Mitra'], ['jual', 'Penjualan'], ['lap', 'Laporan']], nb = d.o.filter(o => o.status === 'baru').length;
  const V = { ring: <Ringkasan d={d} go={setTab} />, pesanan: <Pesanan d={d} run={run} />, stok: <Stok d={d} run={run} />, produk: <Produk d={d} run={run} />, mitra: <MitraAdmin d={d} run={run} />, jual: <Penjualan d={d} run={run} />, lap: <Laporan d={d} /> };
  return <><div className="flex gap-2 overflow-x-auto pb-4 items-center">{T.map(([k, n]) => <button key={k} onClick={() => setTab(k)} className={'pill !px-4 !py-2 !text-sm ' + (tab === k ? 'bg-rd text-cr' : 'bg-pe')}>{n}{k === 'pesanan' && nb > 0 && ` (${nb})`}</button>)}<button className="btn-g btn-sm ml-auto" onClick={logout}>Keluar</button></div>{V[tab]}</>;
}

function Login({ onLogin }) {
  const [p, setP] = useState('');
  return <form onSubmit={e => { e.preventDefault(); onLogin(p); }} className="card max-w-sm mx-auto space-y-3"><h2 className="text-4xl text-or">Masuk admin</h2><L t="PIN"><input className="inp" type="password" required autoFocus value={p} onChange={e => setP(e.target.value)} /></L><button className="btn">Masuk</button></form>;
}

/* ───────── SHELL ───────── */
export default function App() {
  const [route, setRoute] = useState(location.hash.slice(1) || '/'), [catalog, setCatalog] = useState(null), [data, setData] = useState(null), [pin, setPin] = useState(sessionStorage.getItem('kpin') || ''), [toast, setToast] = useState(null);
  const say = (m, err) => { setToast({ m, err }); clearTimeout(window._kt); window._kt = setTimeout(() => setToast(null), 3200); };
  const refresh = useCallback(async p => { const r = await load(p ?? pin); setCatalog(r.catalog); setData(r.data); return r; }, [pin]);
  const run = async (type, payload, ok) => {
    try { const r = await act(type, payload, pin); if (r.catalog) setCatalog(r.catalog); if (r.data) setData(r.data); if (ok) say(ok); return r.res ?? {}; }
    catch (e) { say(e.message, 1); return null; }
  };
  const login = async p => { const r = await load(p); setCatalog(r.catalog); if (r.data) { setData(r.data); setPin(p); sessionStorage.setItem('kpin', p); } else say('PIN salah.', 1); };
  const logout = () => { setPin(''); setData(null); sessionStorage.removeItem('kpin'); };
  useEffect(() => { refresh().catch(() => say('Gagal memuat data.', 1)); const h = () => { setRoute(location.hash.slice(1) || '/'); scrollTo(0, 0); }; addEventListener('hashchange', h); const t = setInterval(() => refresh().catch(() => {}), 20000); return () => { removeEventListener('hashchange', h); clearInterval(t); }; }, [refresh]);
  const N = [['/', 'Pesan'], ['/lacak', 'Lacak pesanan'], ['/mitra', 'Portal mitra'], ['/admin', 'Admin']];
  let page;
  if (!catalog) page = <Empty>Memuat…</Empty>;
  else if (route === '/lacak') page = <Track run={run} />;
  else if (route === '/mitra') page = <Mitra run={run} />;
  else if (route === '/admin') page = data ? <Admin d={data} run={run} logout={logout} /> : <Login onLogin={login} />;
  else page = <Shop catalog={catalog} run={run} />;
  return <div className="min-h-screen">
    <header className="bg-or px-4 pt-4"><div className="max-w-5xl mx-auto flex items-end justify-between gap-3 flex-wrap">
      <a href="#/"><div className="font-display text-6xl sm:text-7xl leading-[.9] text-cr">KUNCI</div><p className="text-cr font-medium text-sm my-2">Pedasan Kunchung · stok, pesanan & penjualan terpusat</p></a>
      <span className="bg-cr text-rd text-xs font-semibold rounded-full px-3 py-1 mb-3">{getMode() === 'db' ? 'Database tersambung' : 'Mode lokal'}</span></div>
      <nav className="max-w-5xl mx-auto flex gap-1.5 overflow-x-auto">{N.map(([r, n]) => <a key={r} href={'#' + r} className={'px-4 py-2.5 rounded-t-2xl text-sm whitespace-nowrap ' + (route === r ? 'bg-cr text-rd font-semibold' : 'bg-cr/35 text-ink font-medium')}>{n}</a>)}</nav></header>
    <main className="max-w-5xl mx-auto px-4 py-6 pb-16">{page}</main>
    {toast && <div role="status" className={'fixed bottom-5 left-1/2 -translate-x-1/2 max-w-[92vw] rounded-2xl px-5 py-3 text-sm font-medium text-cr shadow-lg z-50 ' + (toast.err ? 'bg-rd' : 'bg-ink')}>{toast.m}</div>}
  </div>;
}
