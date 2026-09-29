# Indomie Corner

Demo toko Next.js dengan katalog, checkout, dan status pembayaran yang disimpan di MongoDB.

## MongoDB setup

Gunakan MongoDB lokal atau MongoDB Atlas. Salin `.env.example` menjadi `.env.local`, lalu isi `MONGODB_URI` dengan connection string database Anda. Contoh lokal:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/indomie_corner
```

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

Checkout menyimpan snapshot harga agar tagihan tidak berubah jika harga katalog diedit kemudian. Tombol bayar saat ini memakai simulasi: endpoint demo menandai payment dan checkout menjadi `paid`. Integrasi transaksi sungguhan memerlukan gateway server-side dan verifikasi webhook.

## API routes

- `GET /api/products`: membaca katalog dan menyiapkan data produk awal.
- `POST /api/checkouts`: membuat checkout serta payment berstatus `pending`.
- `POST /api/payments/:paymentId/simulate`: simulasi pembayaran berhasil dan memperbarui status menjadi `paid`.
