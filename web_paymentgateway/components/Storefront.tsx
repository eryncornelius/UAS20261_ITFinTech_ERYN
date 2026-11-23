'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import AuthNav from '@/components/AuthNav';
import type { AuthUser } from '@/lib/models';
import { useRouter } from 'next/navigation';
import {
  clearCart,
  getCartSnapshot,
  getEmptyCartSnapshot,
  saveCart,
  subscribeToCart,
} from '@/lib/cart-store';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
  Flame,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';

type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  image: string;
  badge?: string;
};

type StorefrontProps = {
  initialProducts: Product[];
  catalogError: string;
  currentUser: AuthUser | null;
};

const categories = ['Semua', 'Mie goreng', 'Mie kuah', 'Paket'];
const shippingFee = 8000;

function productImage(image: string, width: number) {
  return image.startsWith('http')
    ? image
    : `https://images.unsplash.com/${image}?auto=format&fit=crop&w=${width}&q=82`;
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function Storefront({ initialProducts, catalogError, currentUser }: StorefrontProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState('Semua');
  const [search, setSearch] = useState('');
  const storedCart = useSyncExternalStore(subscribeToCart, getCartSnapshot, getEmptyCartSnapshot);
  const [cartStorageError, setCartStorageError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('QRIS');
  const [customerName, setCustomerName] = useState(currentUser?.name ?? '');
  const [address, setAddress] = useState('');
  const [voucherCode, setVoucherCode] = useState('');
  const [appliedVoucherCode, setAppliedVoucherCode] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [voucherMessage, setVoucherMessage] = useState('');
  const [isValidatingVoucher, setIsValidatingVoucher] = useState(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  const visibleProducts = useMemo(
    () =>
      initialProducts.filter((product) => {
        const matchesCategory = category === 'Semua' || product.category === category;
        const matchesSearch = `${product.name} ${product.description}`
          .toLowerCase()
          .includes(search.toLowerCase());
        return matchesCategory && matchesSearch;
      }),
    [category, initialProducts, search],
  );

  const validProductIds = useMemo(() => new Set(initialProducts.map((product) => product.id)), [initialProducts]);
  const cart = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(storedCart).filter(([productId]) => validProductIds.has(productId)),
      ),
    [storedCart, validProductIds],
  );
  const cartItems = initialProducts.filter((product) => (cart[product.id] ?? 0) > 0);
  const itemCount = Object.values(cart).reduce((total, quantity) => total + quantity, 0);
  const subtotal = cartItems.reduce(
    (total, product) => total + product.price * cart[product.id],
    0,
  );
  const tax = Math.round((subtotal - discountAmount) * 0.11);
  const deliveryFee = itemCount > 0 && subtotal < 150000 ? shippingFee : 0;
  const total = subtotal - discountAmount + tax + deliveryFee;

  function changeQuantity(productId: string, change: number) {
    const nextQuantity = (cart[productId] ?? 0) + change;
    const next = { ...cart };
    if (nextQuantity <= 0) delete next[productId];
    else next[productId] = nextQuantity;
    if (!saveCart(next)) setCartStorageError('Keranjang tidak dapat disimpan di browser ini.');
    else setCartStorageError('');
    if (appliedVoucherCode) {
      setDiscountAmount(0);
      setAppliedVoucherCode('');
      setVoucherMessage('Subtotal berubah. Validasi voucher kembali.');
    }
  }

  function removeFromCart(productId: string) {
    const next = { ...cart };
    delete next[productId];
    if (!saveCart(next)) setCartStorageError('Keranjang tidak dapat disimpan di browser ini.');
    else setCartStorageError('');
    if (appliedVoucherCode) {
      setDiscountAmount(0);
      setAppliedVoucherCode('');
      setVoucherMessage('Subtotal berubah. Validasi voucher kembali.');
    }
  }

  async function applyVoucher() {
    if (!currentUser || currentUser.role !== 'customer') {
      setVoucherMessage('Masuk sebagai customer untuk menggunakan voucher.');
      return;
    }
    if (!voucherCode.trim() || isValidatingVoucher) return;
    setIsValidatingVoucher(true);
    setVoucherMessage('');
    setDiscountAmount(0);
    setAppliedVoucherCode('');
    try {
      const response = await fetch('/api/vouchers/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: voucherCode, subtotal }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Voucher tidak dapat digunakan.');
      setDiscountAmount(data.discountAmount);
      setAppliedVoucherCode(data.code);
      setVoucherMessage(`Voucher ${data.code} berhasil diterapkan.`);
    } catch (error) {
      setVoucherMessage(error instanceof Error ? error.message : 'Voucher tidak dapat digunakan.');
    } finally {
      setIsValidatingVoucher(false);
    }
  }

  function beginCheckout() {
    if (itemCount === 0) return;
    if (!currentUser) {
      if (saveCart(cart)) {
        router.push('/login?next=%2F');
      } else {
        setCartStorageError('Keranjang tidak dapat disimpan. Izinkan penyimpanan situs lalu coba lagi.');
      }
      return;
    }
    if (currentUser.role !== 'customer') {
      router.push('/account');
      return;
    }
    setStep(2);
  }

  async function submitPayment() {
    if (!customerName.trim() || !address.trim() || isSubmittingPayment) return;
    setIsSubmittingPayment(true);
    setPaymentError('');

    try {
      const checkoutResponse = await fetch('/api/checkouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          address,
          paymentMethod,
          voucherCode: appliedVoucherCode,
          items: Object.entries(cart).map(([productId, quantity]) => ({ productId, quantity })),
        }),
      });
      const checkoutData = await checkoutResponse.json();
      if (!checkoutResponse.ok) throw new Error(checkoutData.error ?? 'Checkout gagal disimpan.');
      clearCart();
      window.location.assign(checkoutData.invoiceUrl);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Pembayaran gagal diproses.');
    } finally {
      setIsSubmittingPayment(false);
    }
  }

  const stepNames = ['Pilih produk', 'Checkout', 'Pembayaran'];

  return (
    <main className="storefront">
      <header className="site-header">
        <a className="brand" href="#menu" onClick={() => setStep(1)} aria-label="Indomie Corner home">
          <span className="brand-mark"><Flame size={19} strokeWidth={1.8} /></span>
          <span className="brand-name">indomie<span>corner</span></span>
        </a>
        <nav className="header-links" aria-label="Main navigation">
          <a className={step === 1 ? 'active' : ''} href="#menu" onClick={() => setStep(1)}>Menu</a>
          <a href="#cerita">Cerita kami</a>
          <a href="#lokasi">Lokasi</a>
        </nav>
        <div className="header-actions">
          <AuthNav user={currentUser} />
          <button className="cart-trigger" onClick={beginCheckout} aria-label={`Keranjang, ${itemCount} item`}>
            <ShoppingBag size={19} strokeWidth={1.8} />
            <span className="cart-trigger-label">Keranjang</span>
            <span className="cart-count">{itemCount}</span>
          </button>
        </div>
      </header>

      <section className="hero-strip">
        <div className="hero-copy">
          <h1>Selalu ada cara<br /><em>buat makan enak.</em></h1>
          <p className="hero-note">Stok Indomie favoritmu, dari mie goreng klasik sampai varian kuah.<br className="desktop-break" /> Pilih rasa, tambah topping, langsung beres.</p>
          <a className="hero-link" href="#menu" onClick={() => setStep(1)}>Pilih rasa favorit <ArrowRight size={15} /></a>
        </div>
        <div className="hero-photo" role="img" aria-label="Semangkuk mie instan dengan topping" />
      </section>

      <div className="page-content" id="menu">
        {step > 1 && (
          <div className="stepper" aria-label="Tahapan pemesanan">
            {stepNames.map((name, index) => {
              const number = index + 1;
              const done = step > number;
              return (
                <div className={`step-item ${step === number ? 'current' : ''} ${done ? 'complete' : ''}`} key={name}>
                  <span className="step-dot">{done ? <Check size={14} /> : `0${number}`}</span>
                  <span className="step-name">{name}</span>
                  {index < stepNames.length - 1 && <span className="step-rule" />}
                </div>
              );
            })}
          </div>
        )}

        <div className="section-heading">
          <div><h2>{step === 1 ? <>Pilih <em>Indomie-mu.</em></> : step === 2 ? <>Cek lagi <em>pesananmu.</em></> : <>Selesaikan <em>pesanan.</em></>}</h2></div>
          {step === 1 && <span className="menu-date">SENIN – MINGGU <b>·</b> 08.00 – 21.00</span>}
          {step > 1 && <button className="text-back" onClick={() => setStep(step - 1)}><ArrowLeft size={15} /> Kembali</button>}
        </div>

        {step === 1 && (
          <>
            <div className="menu-toolbar">
              <div className="category-tabs" role="tablist" aria-label="Kategori menu">
                {categories.map((item) => (
                  <button key={item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)} role="tab" aria-selected={category === item}>
                    {item === 'Semua' ? 'Semua produk' : item}
                  </button>
                ))}
              </div>
              <label className="search-box">
                <Search size={17} strokeWidth={1.8} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari menu..." aria-label="Cari menu" />
                {search && <button onClick={() => setSearch('')} aria-label="Hapus pencarian"><X size={14} /></button>}
              </label>
            </div>
            <div className="product-grid">
              {cartStorageError && <p className="api-error" role="alert">{cartStorageError}</p>}
              {catalogError && <div className="empty-search"><strong>Katalog belum tersedia</strong><span>{catalogError}</span></div>}
              {!catalogError && visibleProducts.map((product, index) => (
                <article className="product-card" key={product.id} style={{ animationDelay: `${index * 65}ms` }}>
                  <div className="product-photo" style={{ backgroundImage: `url("${productImage(product.image, 760)}")` }} role="img" aria-label={product.name}>
                    {product.badge && <span className="product-badge">{product.badge}</span>}
                    <span className="product-category">{product.category}</span>
                  </div>
                  <div className="product-info">
                    <div className="product-title-row">
                      <div><h3>{product.name}</h3><p>{product.description}</p></div>
                      <strong className="product-price">{formatRupiah(product.price)}</strong>
                    </div>
                    <div className="product-action-row">
                      {(cart[product.id] ?? 0) === 0 ? (
                        <button className="add-button" onClick={() => changeQuantity(product.id, 1)}><Plus size={15} /> Tambah</button>
                      ) : (
                        <div className="quantity-control" aria-label={`Jumlah ${product.name}`}>
                          <button onClick={() => changeQuantity(product.id, -1)} aria-label="Kurangi"><Minus size={14} /></button>
                          <span>{cart[product.id]}</span>
                          <button onClick={() => changeQuantity(product.id, 1)} aria-label="Tambah"><Plus size={14} /></button>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              ))}
              {!catalogError && visibleProducts.length === 0 && <div className="empty-search"><Search size={22} /><strong>Menu tidak ditemukan</strong><span>Coba kata kunci atau kategori lain.</span></div>}
            </div>
            {itemCount > 0 && (
              <div className="cart-bar">
                <div className="cart-bar-info"><span className="cart-bar-icon"><ShoppingBag size={17} /></span><span><strong>{itemCount} item dipilih</strong><small>{formatRupiah(subtotal)} · belum termasuk pajak & ongkir</small></span></div>
                <button className="primary-button" onClick={beginCheckout}>
                  {currentUser?.role === 'customer'
                    ? 'Lanjut ke checkout'
                    : currentUser
                      ? 'Buka dashboard'
                      : 'Masuk untuk checkout'} <ArrowRight size={16} />
                </button>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <div className="checkout-layout">
            <section className="checkout-items">
              <div className="list-heading"><span>ITEM PESANAN</span><span>{itemCount} ITEM</span></div>
              {cartItems.map((product) => (
                <article className="checkout-item" key={product.id}>
                  <div className="checkout-thumb" style={{ backgroundImage: `url("${productImage(product.image, 200)}")` }} />
                  <div className="checkout-item-main">
                    <h3>{product.name}</h3><p>{product.category} · {formatRupiah(product.price)} / item</p>
                    <div className="quantity-control"><button onClick={() => changeQuantity(product.id, -1)} aria-label="Kurangi"><Minus size={14} /></button><span>{cart[product.id]}</span><button onClick={() => changeQuantity(product.id, 1)} aria-label="Tambah"><Plus size={14} /></button></div>
                  </div>
                  <div className="checkout-item-end"><strong>{formatRupiah(product.price * cart[product.id])}</strong><button className="remove-item" onClick={() => removeFromCart(product.id)} aria-label={`Hapus ${product.name}`}><X size={15} /></button></div>
                </article>
              ))}
            </section>
            <aside className="order-panel">
              <p className="panel-kicker">RINGKASAN</p><h3>Total pesanan</h3>
              <label className="field-label voucher-entry">Kode voucher
                <span><input value={voucherCode} onChange={(event) => { setVoucherCode(event.target.value.toUpperCase()); setDiscountAmount(0); setAppliedVoucherCode(''); setVoucherMessage(''); }} placeholder="Masukkan kode" maxLength={30} /><button type="button" className="text-back" onClick={applyVoucher} disabled={isValidatingVoucher}>{isValidatingVoucher ? 'Memeriksa...' : 'Pakai'}</button></span>
              </label>
              {voucherMessage && <p className="voucher-message" role="status">{voucherMessage}</p>}
              <div className="summary-lines"><div><span>Subtotal</span><strong>{formatRupiah(subtotal)}</strong></div>{discountAmount > 0 && <div><span>Diskon voucher</span><strong>-{formatRupiah(discountAmount)}</strong></div>}<div><span>Pajak (11%)</span><strong>{formatRupiah(tax)}</strong></div><div><span>Ongkos kirim</span><strong>{deliveryFee ? formatRupiah(deliveryFee) : 'Gratis'}</strong></div></div>
              <div className="summary-total"><span>Total pembayaran</span><strong>{formatRupiah(total)}</strong></div>
              <button className="primary-button full-button" onClick={() => setStep(3)} disabled={itemCount === 0}>Lanjut ke pembayaran <ArrowRight size={16} /></button>
              <p className="secure-note"><ShieldCheck size={14} /> Pembayaran aman dan terenkripsi</p>
            </aside>
          </div>
        )}

        {step === 3 && (
          <div className="payment-layout">
            <section className="payment-form">
              <div className="form-section">
                <div className="form-section-title"><span className="form-number">01</span><div><h3>Informasi pengiriman</h3><p>Kami akan mengantar pesananmu ke sini.</p></div></div>
                <label className="field-label">Nama penerima<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Nama lengkap" /></label>
                <label className="field-label">Alamat pengiriman<textarea value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Nama jalan, nomor, kecamatan, kota" rows={3} /></label>
              </div>
              <div className="form-section payment-methods">
                <div className="form-section-title"><span className="form-number">02</span><div><h3>Metode pembayaran</h3><p>Pilih cara pembayaran yang paling nyaman.</p></div></div>
                {[
                  { name: 'QRIS', detail: 'Scan dari aplikasi bank atau e-wallet', icon: <Smartphone size={18} /> },
                  { name: 'Transfer bank', detail: 'BCA, Mandiri, BNI, dan BRI', icon: <ArrowRight size={18} /> },
                  { name: 'Kartu debit / kredit', detail: 'Visa, Mastercard, dan JCB', icon: <CreditCard size={18} /> },
                ].map((method) => (
                  <button className={`payment-option ${paymentMethod === method.name ? 'chosen' : ''}`} key={method.name} onClick={() => setPaymentMethod(method.name)}>
                    <span className="method-icon">{method.icon}</span><span className="method-copy"><strong>{method.name}</strong><small>{method.detail}</small></span><span className="radio-mark">{paymentMethod === method.name && <span />}</span>
                  </button>
                ))}
              </div>
            </section>
            <aside className="order-panel payment-summary">
              <p className="panel-kicker">PESANANMU</p><h3>Ringkasan tagihan</h3>
              <div className="mini-order-list">{cartItems.map((product) => <div key={product.id}><span>{product.name} <b>× {cart[product.id]}</b></span><strong>{formatRupiah(product.price * cart[product.id])}</strong></div>)}</div>
              <div className="summary-lines"><div><span>Subtotal</span><strong>{formatRupiah(subtotal)}</strong></div>{discountAmount > 0 && <div><span>Diskon voucher</span><strong>-{formatRupiah(discountAmount)}</strong></div>}<div><span>Pajak (11%)</span><strong>{formatRupiah(tax)}</strong></div><div><span>Ongkos kirim</span><strong>{deliveryFee ? formatRupiah(deliveryFee) : 'Gratis'}</strong></div></div>
              <div className="summary-total"><span>Total tagihan</span><strong>{formatRupiah(total)}</strong></div>
              <button className="primary-button full-button pay-button" onClick={submitPayment} disabled={!customerName.trim() || !address.trim() || isSubmittingPayment}><ShieldCheck size={16} /> {isSubmittingPayment ? 'Memproses...' : `Bayar ${formatRupiah(total)}`}</button>
              {paymentError && <p className="api-error" role="alert">{paymentError}</p>}
            </aside>
          </div>
        )}
      </div>

      <footer className="site-footer"><div className="footer-brand"><span className="brand-mark"><Flame size={17} /></span><span className="brand-name">indomie<span>corner</span></span></div><span>Teman makan enak, kapan saja.</span><span className="footer-right">© 2026 INDOMIE CORNER</span></footer>
    </main>
  );
}
