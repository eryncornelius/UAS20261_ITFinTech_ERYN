import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, verifyPassword } from '../lib/auth-crypto';

test('hashes passwords with the scrypt format', async () => {
  const hash = await hashPassword('correct horse battery staple');
  assert.match(hash, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
  assert.notEqual(hash, 'correct horse battery staple');
});

test('accepts the matching password', async () => {
  const hash = await hashPassword('correct horse battery staple');
  assert.equal(await verifyPassword('correct horse battery staple', hash), true);
});

test('rejects a different password', async () => {
  const hash = await hashPassword('correct horse battery staple');
  assert.equal(await verifyPassword('different password', hash), false);
});

test('uses a fresh salt for each password hash', async () => {
  const firstHash = await hashPassword('correct horse battery staple');
  const secondHash = await hashPassword('correct horse battery staple');
  assert.notEqual(firstHash, secondHash);
});

test('rejects malformed or unsupported password hashes', async () => {
  assert.equal(await verifyPassword('any password', 'plain-text'), false);
  assert.equal(await verifyPassword('any password', 'bcrypt$1234$abcd'), false);
});
