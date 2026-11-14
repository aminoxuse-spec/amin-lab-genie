import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { SECRET, SESSION_TTL_SECONDS } from '../config.ts';

export type UserRole = 'admin' | 'teacher';

export type TokenPayload = {
  sub: number;
  username: string;
  role: UserRole;
  exp: number;
};

/** تجزئة كلمة المرور باستخدام scrypt (بدون أي مكتبة خارجية). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = String(stored ?? '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const candidate = scryptSync(password, salt, expected.length);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(data: string): string {
  return createHmac('sha256', SECRET).update(data).digest('base64url');
}

/** توقيع رمز جلسة بسيط (HMAC-SHA256) — قابل للتحقق بدون قاعدة بيانات. */
export function signToken(
  user: { id: number; username: string; role: UserRole },
  ttlSeconds: number = SESSION_TTL_SECONDS,
): string {
  const payload: TokenPayload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifyToken(token: string | undefined | null): TokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = Buffer.from(sign(body));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    if (!payload || typeof payload.sub !== 'number' || typeof payload.exp !== 'number') return null;
    if (payload.exp * 1000 < Date.now()) return null;
    if (payload.role !== 'admin' && payload.role !== 'teacher') return null;
    return payload;
  } catch {
    return null;
  }
}
