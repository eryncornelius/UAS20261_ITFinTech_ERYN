# Indomie Corner

Demo toko Next.js dengan katalog, checkout, dan status pembayaran yang disimpan di MongoDB.

## MongoDB setup

Gunakan MongoDB lokal atau MongoDB Atlas. Salin `.env.example` menjadi `.env.local`, kemudian atur MongoDB dan kredensial Xendit:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-host>/
XENDIT_SECRET_KEY=xnd_development_...
XENDIT_WEBHOOK_TOKEN=<callback-verification-token>
APP_URL=https://<public-app-domain>
```

Jangan commit `.env.local` atau mengekspos secret key di client/browser. Gunakan secret key mode Development untuk uji coba. `APP_URL` harus URL publik HTTPS (Vercel atau URL HTTPS dari ngrok); localhost tidak dapat menerima redirect Xendit.

Jalankan MongoDB, seed katalog demo satu kali (atau setelah memperbarui katalog), kemudian mulai aplikasi:

```bash
npm install
npm run db:seed
npm run dev
```

Buka `http://localhost:3000`. Perintah `npm run db:seed` memasukkan atau memperbarui produk demo di koleksi `products`. Endpoint `GET /api/products` dan halaman toko hanya membaca katalog; keduanya tidak mengubah data. Jika MongoDB tidak dapat dihubungi, aplikasi menampilkan pesan konfigurasi/koneksi yang dapat ditindaklanjuti dan endpoint mengembalikan status `503`.

## MongoDB collections

- `users`: email unik, hash kata sandi, status akun, dan peran customer/merchant/admin.
- `sessions`: hash token sesi dengan waktu kedaluwarsa TTL.
- `products`: nama, kategori, harga, gambar, badge, dan status aktif.
- `vouchers` / `voucherUsages`: aturan promo dan counter kuota global/per-customer.
- `checkouts`: customer, informasi penerima, snapshot item/harga, pajak, ongkir, total, dan status pesanan.
- `payments`: checkout terkait, metode, jumlah, provider, waktu, dan status pembayaran.
- `auditLogs`: aktor, perubahan menu/promo/pemenuhan order, dan keputusan review.

## Accounts and roles

Customer dapat mendaftar dari `/register`; pendaftaran publik selalu membuat peran `customer`. Login tersedia di `/login`. Merchant dan admin tidak dapat dipilih dari form publik—buat akun elevated secara eksplisit dari terminal tepercaya dengan mengatur `AUTH_USER_NAME`, `AUTH_USER_EMAIL`, `AUTH_USER_PASSWORD`, serta `AUTH_USER_ROLE=merchant` atau `admin`, lalu jalankan:

```bash
npm run db:create-user
```

Jangan simpan password akun di source control atau bagikan melalui chat. Kata sandi disimpan sebagai hash scrypt. Sesi memakai cookie HTTP-only dan memiliki masa berlaku tujuh hari. Hanya customer yang dapat membuat pesanan; status checkout hanya dapat dibaca oleh customer pemiliknya. Dashboard `/merchant` mengelola produk dan status pemenuhan pesanan; `/admin` mengelola voucher serta tinjauan order dengan skor risiko minimal 40. Keputusan review dicatat, tetapi tidak membatalkan invoice atau menjalankan refund secara otomatis.

Pengguna dapat menghapus akunnya dari `/account` setelah mengonfirmasi kata sandi. Penghapusan menonaktifkan akun, mencabut semua sesi, dan menganonimkan nama/alamat pada riwayat checkout yang sudah selesai. Penghapusan ditolak selama masih ada pesanan aktif, dan admin terakhir tidak dapat menghapus akunnya sendiri. Catatan transaksi dan audit tetap dipertahankan.

Voucher divalidasi kembali oleh server saat checkout. Kuota global dan pemakaian per akun direservasi dalam transaksi MongoDB agar klaim bersamaan tidak melewati batas; gunakan Atlas atau MongoDB lokal yang berjalan sebagai replica set. Counter dikembalikan ketika Xendit mengirim event invoice `EXPIRED`, jadi pastikan webhook mengirim **Invoice paid** dan **Invoice expired** ke endpoint yang sama. Skor risiko awal adalah heuristik yang dapat dijelaskan (akun baru dengan diskon besar, beberapa order dalam 10 menit, diskon ≥30%, atau nilai diskon ≥Rp50.000); skor bukan bukti fraud.

Checkout menyimpan snapshot harga agar tagihan tidak berubah jika harga katalog diedit kemudian. Server membuat invoice Xendit dan browser diarahkan ke halaman hosted checkout Xendit. Status tidak ditandai lunas oleh browser; status hanya berubah setelah webhook Xendit lolos verifikasi `x-callback-token`, invoice cocok, dan nominal pembayaran sesuai. Setelah redirect, halaman membaca status checkout dari database sampai webhook mengonfirmasi pembayaran.

Di Xendit Dashboard, tambahkan webhook untuk **Invoice paid** dengan URL `https://<public-app-domain>/api/webhooks/xendit`. Salin callback verification token yang tampil di pengaturan webhook ke `XENDIT_WEBHOOK_TOKEN`. Pastikan URL tersebut mengarah ke deployment aktif dan dapat diakses dari internet.

## API routes

- `GET /api/products`: membaca katalog yang sudah ada di database.
- `POST /api/auth/register`: membuat akun customer dan sesi.
- `POST /api/auth/login` dan `POST /api/auth/logout`: mengelola sesi akun.
- `/api/merchant/products` dan `/api/merchant/orders`: operasi menu dan pemenuhan order khusus merchant.
- `/api/admin/vouchers` dan `/api/admin/reviews`: manajemen voucher dan antrean review khusus admin.
- `POST /api/vouchers/validate`: validasi voucher untuk customer sebelum checkout.
- `POST /api/checkouts`: membuat checkout/payment `pending`, meminta invoice Xendit, lalu mengembalikan URL hosted checkout.
- `POST /api/webhooks/xendit`: memverifikasi callback Xendit dan memperbarui payment/checkout secara idempotent.
- `GET /api/checkouts/:checkoutId`: membaca status setelah pelanggan kembali dari halaman Xendit.
