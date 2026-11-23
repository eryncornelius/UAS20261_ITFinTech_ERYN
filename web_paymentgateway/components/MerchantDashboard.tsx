'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  image: string;
  badge: string;
  isActive: boolean;
};

type Order = {
  id: string;
  customerName: string;
  address: string;
  items: { name: string; quantity: number }[];
  subtotal: number;
  discountAmount: number;
  total: number;
  status: string;
  fulfillmentStatus: string;
  reviewStatus: string;
  riskScore: number;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
};

type ProductForm = {
  name: string;
  description: string;
  category: string;
  price: string;
  image: string;
  badge: string;
};

const emptyForm: ProductForm = {
  name: '',
  description: '',
  category: 'Mie goreng',
  price: '',
  image: '',
  badge: '',
};

function formatRupiah(amount: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Permintaan gagal.');
  return data;
}

export default function MerchantDashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  async function loadDashboard() {
    setError('');
    const [productData, orderData] = await Promise.all([
      requestJson('/api/merchant/products'),
      requestJson('/api/merchant/orders'),
    ]);
    setProducts(productData.products);
    setOrders(orderData.orders);
    setIsLoading(false);
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      requestJson('/api/merchant/products'),
      requestJson('/api/merchant/orders'),
    ])
      .then(([productData, orderData]) => {
        if (!active) return;
        setProducts(productData.products);
        setOrders(orderData.orders);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Dashboard gagal dimuat.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setError('');
    try {
      await requestJson(
        editingId ? `/api/merchant/products/${editingId}` : '/api/merchant/products',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, price: Number(form.price) }),
        },
      );
      setForm(emptyForm);
      setEditingId('');
      await loadDashboard();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Produk gagal disimpan.');
    } finally {
      setIsSaving(false);
    }
  }

  function editProduct(product: Product) {
    setEditingId(product.id);
    setForm({
      name: product.name,
      description: product.description,
      category: product.category,
      price: String(product.price),
      image: product.image,
      badge: product.badge,
    });
    document.getElementById('merchant-product-form')?.scrollIntoView({ behavior: 'smooth' });
  }

  async function toggleProduct(product: Product) {
    setError('');
    try {
      await requestJson(`/api/merchant/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !product.isActive }),
      });
      await loadDashboard();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Status produk gagal diperbarui.');
    }
  }

  async function updateOrder(orderId: string, fulfillmentStatus: string) {
    setError('');
    try {
      await requestJson(`/api/merchant/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fulfillmentStatus }),
      });
      await loadDashboard();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Status pesanan gagal diperbarui.');
    }
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <Link className="auth-brand" href="/">indomie<span>corner</span></Link>
        <Link href="/" className="dashboard-back">Kembali ke toko</Link>
      </header>
      <div className="dashboard-content">
        <p className="panel-kicker">DASHBOARD MERCHANT / KASIR</p>
        <h1>Menu dan pesanan</h1>
        <p className="dashboard-intro">Kelola ketersediaan produk dan pantau pemenuhan pesanan.</p>
        {error && <p className="api-error" role="alert">{error}</p>}

        <section className="dashboard-panel" id="merchant-product-form">
          <div className="dashboard-panel-heading">
            <div><p className="panel-kicker">KATALOG</p><h2>{editingId ? 'Edit produk' : 'Tambah produk'}</h2></div>
            {editingId && <button className="text-back" onClick={() => { setEditingId(''); setForm(emptyForm); }}>Batal edit</button>}
          </div>
          <form className="merchant-product-form" onSubmit={saveProduct}>
            <label className="field-label">Nama produk<input required minLength={2} maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label className="field-label">Kategori<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>Mie goreng</option><option>Mie kuah</option><option>Paket</option></select></label>
            <label className="field-label">Harga (rupiah)<input required type="number" min="1" step="1" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label>
            <label className="field-label">Badge (opsional)<input maxLength={40} value={form.badge} onChange={(event) => setForm({ ...form, badge: event.target.value })} /></label>
            <label className="field-label form-wide">Deskripsi<input maxLength={300} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <label className="field-label form-wide">URL foto HTTPS<input required type="url" pattern="https://.*" value={form.image} onChange={(event) => setForm({ ...form, image: event.target.value })} /></label>
            <button className="primary-button form-wide" type="submit" disabled={isSaving}>{isSaving ? 'Menyimpan...' : editingId ? 'Simpan perubahan' : 'Tambah produk'}</button>
          </form>
          {isLoading ? <p>Memuat katalog…</p> : (
            <div className="managed-product-list">
              {products.map((product) => (
                <article className="managed-product" key={product.id}>
                  <div className="managed-product-info"><strong>{product.name}</strong><span>{product.category} · {formatRupiah(product.price)}</span><small>{product.isActive ? 'Aktif' : 'Nonaktif'}</small></div>
                  <div className="managed-actions"><button className="text-back" onClick={() => editProduct(product)}>Edit</button><button className="text-back" onClick={() => void toggleProduct(product)}>{product.isActive ? 'Nonaktifkan' : 'Aktifkan'}</button></div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-panel">
          <div className="dashboard-panel-heading"><div><p className="panel-kicker">TRANSAKSI</p><h2>Pesanan terbaru</h2></div><span className="dashboard-count">{orders.length} pesanan</span></div>
          {isLoading ? <p>Memuat pesanan…</p> : orders.length === 0 ? <p className="empty-dashboard">Belum ada pesanan.</p> : (
            <div className="managed-order-list">
              {orders.map((order) => (
                <article className="managed-order" key={order.id}>
                  <div className="order-heading"><strong>IM-{order.id.slice(-8).toUpperCase()} · {order.customerName}</strong><span>{formatDate(order.createdAt)}</span></div>
                  <p>{order.items.map((item) => `${item.name} × ${item.quantity}`).join(', ')}</p>
                  <p className="order-address">{order.address}</p>
                  <div className="order-financial"><span>Tagihan {formatRupiah(order.total)} · {order.paymentMethod} / {order.paymentStatus}</span><span>{order.reviewStatus === 'pending' ? `Perlu review risiko (${order.riskScore})` : order.status}</span></div>
                  {order.discountAmount > 0 && <small>Diskon voucher {formatRupiah(order.discountAmount)}</small>}
                  <label className="order-status-control">Status pemenuhan
                    <select value={order.fulfillmentStatus} disabled={order.status !== 'paid' || order.fulfillmentStatus === 'completed' || order.fulfillmentStatus === 'cancelled'} onChange={(event) => void updateOrder(order.id, event.target.value)}>
                      <option value="new">Baru</option><option value="preparing">Disiapkan</option><option value="ready">Siap</option><option value="completed">Selesai</option><option value="cancelled">Dibatalkan</option>
                    </select>
                  </label>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
