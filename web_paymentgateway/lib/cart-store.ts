'use client';

export type Cart = Record<string, number>;

const storageKey = 'indomie-cart';
const emptyCart: Cart = {};
const subscribers = new Set<() => void>();
let currentCart = emptyCart;
let cachedValue: string | null = null;

function readStoredCart(): Cart {
  try {
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored === cachedValue) return currentCart;
    cachedValue = stored;
    if (!stored) {
      currentCart = emptyCart;
      return currentCart;
    }

    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      currentCart = emptyCart;
      return currentCart;
    }

    currentCart = Object.fromEntries(
      Object.entries(parsed).filter(
        ([productId, quantity]) =>
          /^[a-f\d]{24}$/i.test(productId) &&
          typeof quantity === 'number' &&
          Number.isSafeInteger(quantity) &&
          quantity > 0 &&
          quantity <= 99,
      ),
    );
    return currentCart;
  } catch {
    return emptyCart;
  }
}

export function getCartSnapshot(): Cart {
  if (typeof window === 'undefined') return emptyCart;
  return readStoredCart();
}

export function getEmptyCartSnapshot(): Cart {
  return emptyCart;
}

export function subscribeToCart(onChange: () => void): () => void {
  subscribers.add(onChange);
  const onStorage = () => {
    readStoredCart();
    onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    subscribers.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function saveCart(cart: Cart): boolean {
  let saved = true;
  const serialized = JSON.stringify(cart);
  try {
    window.sessionStorage.setItem(storageKey, serialized);
  } catch {
    saved = false;
  }

  cachedValue = serialized;
  currentCart = cart;
  subscribers.forEach((onChange) => onChange());
  return saved;
}

export function clearCart(): void {
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    return;
  }
  cachedValue = null;
  currentCart = emptyCart;
  subscribers.forEach((onChange) => onChange());
}
