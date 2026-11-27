# KUNCI — Pedasan Kunchung (React + Tailwind + Vite)

## Jalankan lokal
npm install && npm run dev   (mode lokal, data di browser; PIN admin: kunci123)

## Deploy ke Vercel
1. Upload SEMUA isi folder ini ke GitHub (jangan upload node_modules / dist).
2. Vercel > Add New > Project > Import repo > Deploy (Framework: Vite terdeteksi otomatis).
3. Database bersama: Project > Storage > Upstash for Redis (Free) > Connect > Redeploy.
4. Project > Settings > Environment Variables: tambah ADMIN_PIN = PIN rahasia kamu > Redeploy.
5. Untuk mode uji Resend dengan `onboarding@resend.dev`, atur `RESEND_TEST_TO` ke alamat pemilik akun Resend yang diizinkan. Gunakan alamat yang sama pada checkout; endpoint menolak alamat lain dan mengirim hanya ke penerima uji tetap tersebut.
6. Di deployment Vercel tanpa Redis, email uji hanya dikirim ke penerima tetap `RESEND_TEST_TO`; pelacakan hanya dapat membaca pesanan dari browser yang sama. Upstash Redis diperlukan untuk tracking lintas perangkat dan verifikasi pesanan di server. `npm run dev` (Vite saja) tidak menjalankan Serverless Function dalam folder `api/`.

Email pesanan memerlukan `RESEND_API_KEY` dan `EMAIL_FROM`. Ketika `EMAIL_FROM` masih memakai `onboarding@resend.dev`, endpoint hanya mengirim ke `RESEND_TEST_TO` dan mengabaikan alamat penerima dari browser. Tanpa Redis, validasi bahwa pesanan tersimpan server-side tidak tersedia dan hanya mode pengiriman uji yang diizinkan. Setelah domain pengirim terverifikasi, hubungkan Upstash Redis dan ubah `EMAIL_FROM` ke alamat domain tersebut agar email dikirim ke alamat konsumen yang tersimpan.

Halaman pelacakan tersedia di `/tracking` dan memerlukan nomor pesanan serta email saat checkout.


## Alur
Konsumen: Pesan -> kode KC-0001 -> Lacak pesanan
Admin: Pesanan baru -> Diproses -> Siap Dikirim -> Selesai (atau Dibatalkan)
Stok berkurang saat pesanan masuk, kembali bila dibatalkan; penjualan tercatat saat Selesai.
Mitra: dikirimi stok oleh admin -> lapor terjual + sisa fisik -> selisih terdeteksi -> ajukan restok.
