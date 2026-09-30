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

Jalankan MongoDB, kemudian mulai aplikasi:

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`. Produk demo dimasukkan ke koleksi `products` secara otomatis saat endpoint katalog pertama kali dipanggil.

## MongoDB collections

- `products`: nama, kategori, harga, gambar, badge, dan status aktif.
- `checkouts`: informasi penerima, snapshot item/harga, pajak, ongkir, total, dan status pesanan.
- `payments`: checkout terkait, metode, jumlah, provider, waktu, dan status pembayaran.

Checkout menyimpan snapshot harga agar tagihan tidak berubah jika harga katalog diedit kemudian. Server membuat invoice Xendit dan browser diarahkan ke halaman hosted checkout Xendit. Status tidak ditandai lunas oleh browser; status hanya berubah setelah webhook Xendit lolos verifikasi `x-callback-token`, invoice cocok, dan nominal pembayaran sesuai. Setelah redirect, halaman membaca status checkout dari database sampai webhook mengonfirmasi pembayaran.

Di Xendit Dashboard, tambahkan webhook untuk **Invoice paid** dengan URL `https://<public-app-domain>/api/webhooks/xendit`. Salin callback verification token yang tampil di pengaturan webhook ke `XENDIT_WEBHOOK_TOKEN`. Pastikan URL tersebut mengarah ke deployment aktif dan dapat diakses dari internet.

## API routes

- `GET /api/products`: membaca katalog dan menyiapkan data produk awal.
- `POST /api/checkouts`: membuat checkout/payment `pending`, meminta invoice Xendit, lalu mengembalikan URL hosted checkout.
- `POST /api/webhooks/xendit`: memverifikasi callback Xendit dan memperbarui payment/checkout secara idempotent.
- `GET /api/checkouts/:checkoutId`: membaca status setelah pelanggan kembali dari halaman Xendit.
