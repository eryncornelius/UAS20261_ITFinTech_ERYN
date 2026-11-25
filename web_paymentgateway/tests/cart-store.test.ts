import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearCart, getCartSnapshot, saveCart } from '../lib/cart-store';

test('keeps the session cart available from memory when browser storage is unavailable', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let storedCart: string | null = null;
  const workingStorage = {
    getItem: () => storedCart,
    setItem: (_key: string, value: string) => {
      storedCart = value;
    },
    removeItem: () => {
      storedCart = null;
    },
  };

  try {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { sessionStorage: workingStorage },
    });
    const savedCart = { '0123456789abcdef01234567': 2 };
    assert.equal(saveCart(savedCart), true);
    assert.deepEqual(getCartSnapshot(), savedCart);

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        sessionStorage: {
          getItem: () => { throw new Error('Storage disabled'); },
          setItem: () => { throw new Error('Storage disabled'); },
          removeItem: () => { throw new Error('Storage disabled'); },
        },
      },
    });
    const memoryOnlyCart = { '89abcdef0123456701234567': 1 };
    assert.equal(saveCart(memoryOnlyCart), false);
    assert.deepEqual(getCartSnapshot(), memoryOnlyCart);

    clearCart();
    assert.deepEqual(getCartSnapshot(), {});
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
    clearCart();
  }
});
