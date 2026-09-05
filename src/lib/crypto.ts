import 'server-only';
import crypto from 'node:crypto';

const SECRET = process.env.APP_SECRET || 'blogforge-insecure-development-secret-change-me';

if (process.env.NODE_ENV === 'production' && !process.env.APP_SECRET) {
  // Loud rather than silent: without a real secret, stored keys are trivially
  // decryptable by anyone who gets the .db file.
  console.warn('[blogforge] APP_SECRET is not set — API keys are encrypted with the default key.');
}

const aesKey = crypto.createHash('sha256').update(SECRET).digest();

/** AES-256-GCM. Output: iv.tag.ciphertext, all base64url. */
export function encrypt(plain: string): string {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(payload: string): string {
  if (!payload) return '';
  const parts = payload.split('.');
  if (parts.length !== 3) return '';
  try {
    const [iv, tag, enc] = parts.map((p) => Buffer.from(p, 'base64url'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

/** Show `AIza••••••4f2c` in the UI without ever shipping the whole key. */
export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 10) return '•'.repeat(key.length);
  return `${key.slice(0, 4)}${'•'.repeat(8)}${key.slice(-4)}`;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64url'), expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export const randomId = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');
