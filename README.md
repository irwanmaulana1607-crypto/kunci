# KUNCI — Pedasan Kunchung (React + Tailwind + Vite)

## Jalankan lokal
npm install && npm run dev   (mode lokal, data di browser; PIN admin: kunci123)

## Deploy ke Vercel
1. Upload SEMUA isi folder ini ke GitHub (jangan upload node_modules / dist).
2. Vercel > Add New > Project > Import repo > Deploy (Framework: Vite terdeteksi otomatis).
3. Database bersama: Project > Storage > Upstash for Redis (Free) > Connect > Redeploy.
4. Project > Settings > Environment Variables: tambah ADMIN_PIN = PIN rahasia kamu > Redeploy.
5. Ganti nomor WhatsApp di src/config.js.

## Alur
Konsumen: Pesan -> kode KC-0001 -> Lacak pesanan
Admin: Pesanan baru -> Diproses -> Dikirim -> Selesai (atau Dibatalkan)
Stok berkurang saat pesanan masuk, kembali bila dibatalkan; penjualan tercatat saat Selesai.
Mitra: dikirimi stok oleh admin -> lapor terjual + sisa fisik -> selisih terdeteksi -> ajukan restok.
