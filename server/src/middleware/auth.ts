import type { Request, RequestHandler } from 'express';
import { verifyToken, type TokenPayload } from '../utils/security.ts';
import { findById, type User } from '../models/User.ts';

export type AuthedRequest = Request & { auth?: TokenPayload; currentUser?: User };

function extractToken(req: Request): string {
  const header = req.header('authorization') ?? '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return (req.header('x-session-token') ?? '').trim();
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const payload = verifyToken(extractToken(req));
  if (!payload) {
    res.status(401).json({ error: 'الجلسة غير صالحة أو منتهية. يرجى تسجيل الدخول من جديد.' });
    return;
  }
  const user = findById(payload.sub);
  if (!user) {
    res.status(401).json({ error: 'الحساب غير موجود' });
    return;
  }
  const authed = req as AuthedRequest;
  authed.auth = payload;
  authed.currentUser = user;
  next();
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  const currentUser = (req as AuthedRequest).currentUser;
  if (currentUser?.role !== 'admin') {
    res.status(403).json({ error: 'هذه العملية تتطلب صلاحيات مدير المختبر' });
    return;
  }
  next();
};

/** teacher يرى بياناته فقط، أما admin فيرى الكل. */
export function canAccessTeacher(req: Request, teacherId: number): boolean {
  const currentUser = (req as AuthedRequest).currentUser;
  if (!currentUser) return false;
  return currentUser.role === 'admin' || currentUser.id === teacherId;
}
