import type { Request, Response } from 'express';
import { createUser, deleteUser, findByUsername, findById, listUsers, updatePassword, updateUser } from '../models/User.ts';
import { hashPassword, signToken, verifyPassword } from '../utils/security.ts';
import type { AuthedRequest } from '../middleware/auth.ts';
import type { UserRole } from '../utils/security.ts';
import { logger } from '../utils/logger.ts';

export function login(req: Request, res: Response): void {
  const { username, password } = req.body as { username?: string; password?: string };
  const account = username ? findByUsername(username) : undefined;

  if (!account || !verifyPassword(String(password ?? ''), account.password_hash)) {
    logger.warn('محاولة دخول فاشلة', { username });
    res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    return;
  }

  const token = signToken({ id: account.id, username: account.username, role: account.role });
  logger.info('دخول ناجح', { username: account.username, role: account.role });
  res.json({
    token,
    user: {
      id: account.id,
      username: account.username,
      full_name: account.full_name,
      role: account.role,
      specialty: account.specialty,
    },
  });
}

export function me(req: Request, res: Response): void {
  res.json({ user: (req as AuthedRequest).currentUser });
}

export function index(_req: Request, res: Response): void {
  res.json({ users: listUsers() });
}

/** تغيير كلمة مرور المستخدم الحالي. */
export function changePassword(req: Request, res: Response): void {
  const current = (req as AuthedRequest).currentUser;
  if (!current) {
    res.status(401).json({ error: 'يجب تسجيل الدخول' });
    return;
  }
  const body = req.body as { current_password: string; new_password: string };
  const account = findByUsername(current.username);
  if (!account || !verifyPassword(body.current_password, account.password_hash)) {
    res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    return;
  }
  updatePassword(current.id, hashPassword(body.new_password));
  logger.info('تغيير كلمة المرور', { userId: current.id });
  res.json({ ok: true });
}

/** تعديل مستخدم (admin): الاسم الكامل، الدور، وكلمة مرور جديدة اختيارية. */
export function update(req: Request, res: Response): void {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'معرّف غير صالح' });
    return;
  }
  const target = findById(id);
  if (!target) {
    res.status(404).json({ error: 'المستخدم غير موجود' });
    return;
  }
  const body = req.body as { full_name: string; role: UserRole; phone?: string; specialty?: string; password?: string };
  if (body.password) updatePassword(id, hashPassword(body.password));
  const user = updateUser(id, {
    full_name: body.full_name,
    role: body.role,
    phone: body.phone ?? null,
    specialty: body.specialty ?? null,
  });
  logger.info('تعديل مستخدم', { id });
  res.json({ user });
}

/** حذف مستخدم (admin) — يُرفض إن كانت له إعارات أو حصص مرتبطة. */
export function remove(req: Request, res: Response): void {
  const id = Number(req.params.id);
  const current = (req as AuthedRequest).currentUser;
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'معرّف غير صالح' });
    return;
  }
  if (current?.id === id) {
    res.status(409).json({ error: 'لا يمكنك حذف حسابك الحالي' });
    return;
  }
  if (!findById(id)) {
    res.status(404).json({ error: 'المستخدم غير موجود' });
    return;
  }
  try {
    deleteUser(id);
  } catch (error) {
    res.status(409).json({ error: 'لا يمكن حذف المستخدم: لديه إعارات أو حصص مرتبطة' });
    return;
  }
  logger.info('حذف مستخدم', { id });
  res.json({ ok: true });
}

export function create(req: Request, res: Response): void {
  const body = req.body as {
    username?: string;
    full_name?: string;
    role?: UserRole;
    phone?: string;
    specialty?: string;
    password?: string;
  };
  if (findByUsername(body.username ?? '')) {
    res.status(409).json({ error: 'اسم المستخدم مستعمل مسبقاً' });
    return;
  }
  const user = createUser({
    username: body.username as string,
    full_name: body.full_name as string,
    role: body.role ?? 'teacher',
    phone: body.phone ?? null,
    specialty: body.specialty ?? null,
    password_hash: hashPassword(body.password as string),
  });
  res.status(201).json({ user });
}
