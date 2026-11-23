import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

function derivePasswordKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derivePasswordKey(password, salt);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const [algorithm, saltHex, keyHex, extra] = passwordHash.split('$');
  if (algorithm !== 'scrypt' || !saltHex || !keyHex || extra !== undefined) return false;

  const salt = Buffer.from(saltHex, 'hex');
  const expectedKey = Buffer.from(keyHex, 'hex');
  if (salt.length !== 16 || expectedKey.length !== 64) return false;

  const actualKey = await derivePasswordKey(password, salt);
  return timingSafeEqual(actualKey, expectedKey);
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
