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

Xendit tetap menjadi mode bawaan. Untuk menjalankan alur pembayaran tanpa menagih dana, atur `PAYMENT_MODE=simulator`. Mode ini tidak memerlukan `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`, atau `APP_URL`; pada halaman status pembayaran customer dapat mensimulasikan hasil berhasil/gagal dan refund internal. Refund simulator hanya mengubah status lokal, tidak memanggil refund Xendit/bank, dan hanya tersedia sebelum pesanan mulai disiapkan.

Biaya layanan dan penerimaan merchant adalah **estimasi demo**, bukan tarif resmi/aktual Xendit atau nilai settlement. Default yang digunakan: QRIS 0,7%, transfer bank Rp4.000, dan kartu 2,9% + Rp2.000. Asumsi dapat diubah lewat `PAYMENT_FEE_QRIS_RATE`, `PAYMENT_FEE_TRANSFER_FIXED`, `PAYMENT_FEE_CARD_RATE`, dan `PAYMENT_FEE_CARD_FIXED` di `.env.local`. Rate berupa pecahan (`0.007` = 0,7%); biaya tetap dalam rupiah. Estimasi biaya disimpan sejak checkout, tetapi hanya dianggap berlaku pada pembayaran berhasil. Pada refund simulator, pokok pembayaran dianggap dikembalikan penuh sementara biaya layanan estimasi tetap menjadi beban merchant, sehingga net menjadi negatif sebesar biaya tersebut.

Dashboard merchant menampilkan ringkasan seluruh transaksi yang pernah berhasil atau direfund: pendapatan kotor (subtotal sebelum diskon), diskon voucher, estimasi biaya payment, refund tercatat, dan penerimaan bersih. Penerimaan bersih dihitung sebagai total pembayaran tertagih dikurangi refund dan biaya payment estimasi. Diskon mencakup transaksi berhasil maupun yang kemudian direfund; transaksi menunggu, gagal, atau kedaluwarsa tidak masuk ringkasan. Refund yang terlihat berasal dari status internal simulator, bukan transfer pengembalian dana nyata.

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
- `payments`: checkout terkait, metode, jumlah, provider, status, estimasi biaya layanan, estimasi penerimaan merchant, dan waktu pembayaran/refund.
- `auditLogs`: aktor, perubahan status simulasi pembayaran, menu/promo/pemenuhan order, dan keputusan review.

## Accounts and roles

Customer dapat mendaftar dari `/register`; pendaftaran publik selalu membuat peran `customer`. Login tersedia di `/login`. Merchant dan admin tidak dapat dipilih dari form publik—buat akun elevated secara eksplisit dari terminal tepercaya dengan mengatur `AUTH_USER_NAME`, `AUTH_USER_EMAIL`, `AUTH_USER_PASSWORD`, serta `AUTH_USER_ROLE=merchant` atau `admin`, lalu jalankan:

```bash
npm run db:create-user
```

Jangan simpan password akun di source control atau bagikan melalui chat. Kata sandi disimpan sebagai hash scrypt. Sesi memakai cookie HTTP-only dan memiliki masa berlaku tujuh hari. Hanya customer yang dapat membuat pesanan; status checkout hanya dapat dibaca oleh customer pemiliknya. Dashboard `/merchant` mengelola produk dan status pemenuhan pesanan; `/admin` mengelola voucher serta tinjauan order dengan skor risiko minimal 40. Keputusan review dicatat, tetapi tidak membatalkan invoice atau menjalankan refund secara otomatis.

Pengguna dapat menghapus akunnya dari `/account` setelah mengonfirmasi kata sandi. Penghapusan menonaktifkan akun, mencabut semua sesi, dan menganonimkan nama/alamat pada riwayat checkout yang sudah selesai. Penghapusan ditolak selama masih ada pesanan aktif, dan admin terakhir tidak dapat menghapus akunnya sendiri. Catatan transaksi dan audit tetap dipertahankan.

Voucher divalidasi kembali oleh server saat checkout. Kuota global dan pemakaian per akun direservasi dalam transaksi MongoDB agar klaim bersamaan tidak melewati batas; gunakan Atlas atau MongoDB lokal yang berjalan sebagai replica set. Counter dikembalikan ketika Xendit mengirim event invoice `EXPIRED`, jadi pastikan webhook mengirim **Invoice paid** dan **Invoice expired** ke endpoint yang sama. Skor risiko awal adalah heuristik yang dapat dijelaskan: +30 untuk akun berusia <24 jam dengan diskon ≥Rp20.000, +25 untuk ≥2 order dalam 10 menit terakhir, +20 untuk rasio diskon ≥30%, dan +20 untuk diskon ≥Rp50.000. Order dengan skor ≥40 masuk antrean admin; setiap alasan ditampilkan. Skor bukan bukti fraud atau keputusan otomatis.

Admin dapat menyetujui atau menolak order dari antrean `/admin` dan mencatat catatan review. Perubahan keputusan dan audit log disimpan dalam satu transaksi MongoDB; satu order hanya dapat diputuskan sekali. Keputusan review tidak membatalkan invoice, mengubah status pembayaran, atau menjalankan refund secara otomatis.

Checkout menyimpan snapshot harga agar tagihan tidak berubah jika harga katalog diedit kemudian. Dalam mode bawaan, server membuat invoice Xendit dan browser diarahkan ke halaman hosted checkout Xendit. Status tidak ditandai lunas oleh browser; status hanya berubah setelah webhook Xendit lolos verifikasi `x-callback-token`, invoice cocok, dan nominal pembayaran sesuai. Setelah redirect, halaman membaca status checkout dari database sampai webhook mengonfirmasi pembayaran. Dalam mode simulator, perubahan status dibatasi ke customer pemilik checkout dan hanya berlaku untuk payment ber-provider `simulator`.

Di Xendit Dashboard, tambahkan webhook untuk **Invoice paid** dengan URL `https://<public-app-domain>/api/webhooks/xendit`. Salin callback verification token yang tampil di pengaturan webhook ke `XENDIT_WEBHOOK_TOKEN`. Pastikan URL tersebut mengarah ke deployment aktif dan dapat diakses dari internet.

## API routes

- `GET /api/products`: membaca katalog yang sudah ada di database.
- `POST /api/auth/register`: membuat akun customer dan sesi.
- `POST /api/auth/login` dan `POST /api/auth/logout`: mengelola sesi akun.
- `/api/merchant/products` dan `/api/merchant/orders`: operasi menu dan pemenuhan order khusus merchant.
- `/api/admin/vouchers` dan `/api/admin/reviews`: manajemen voucher dan antrean review khusus admin.
- `PATCH /api/admin/reviews/:checkoutId`: menyetujui/menolak review risiko dan mencatat keputusan serta catatan admin ke audit log.
- `POST /api/vouchers/validate`: validasi voucher untuk customer sebelum checkout.
- `POST /api/checkouts`: membuat checkout/payment `pending`, lalu meminta invoice Xendit atau mengembalikan URL status internal sesuai `PAYMENT_MODE`.
- `POST /api/webhooks/xendit`: memverifikasi callback Xendit dan memperbarui payment/checkout secara idempotent.
- `GET /api/checkouts/:checkoutId`: membaca status setelah pelanggan kembali dari halaman Xendit.
- `POST /api/checkouts/:checkoutId`: hanya dalam mode simulator, mengubah status transaksi milik customer antara menunggu, berhasil, gagal, dan refund internal.

## Automated tests

Jalankan semua uji otomatis dengan:

```bash
npm test
```

Suite ini mencakup validasi voucher valid/kedaluwarsa/kuota habis/pemakaian ulang customer, kalkulasi skor risiko, kalkulasi biaya dan penerimaan merchant/refund, serta fallback cache keranjang di memori ketika `sessionStorage` tidak tersedia. Fallback offline yang diuji hanya berlaku untuk keranjang pada browser; checkout, katalog, dan autentikasi tetap memerlukan server dan koneksi MongoDB.
