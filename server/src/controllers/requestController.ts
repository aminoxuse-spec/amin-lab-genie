import type { Request, Response } from 'express';
import { transaction } from '../db.ts';
import { adjustAvailable, getInventory } from '../models/Inventory.ts';
import { createSession, setStatus } from '../models/BorrowingSession.ts';
import { createItem } from '../models/BorrowingItem.ts';
import {
  addRequestItem,
  createRequest,
  decide,
  getRequest,
  listRequests,
  pendingCount,
  requestItems,
  type RequestItemView,
  type RequestStatus,
} from '../models/MaterialRequest.ts';
import { canAccessTeacher, type AuthedRequest } from '../middleware/auth.ts';
import { HttpError, parseId } from '../middleware/validation.ts';
import { levelOf } from '../services/itemMatcher.ts';
import { logger } from '../utils/logger.ts';

const STATUSES: RequestStatus[] = ['pending', 'approved', 'rejected', 'cancelled'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** دمج الأسطر المكرّرة لنفس الصنف والتحقق من صحتها. */
function normalizeLines(raw: unknown): { inventory_id: number; quantity: number }[] {
  const merged = new Map<number, number>();
  for (const line of Array.isArray(raw) ? (raw as { inventory_id?: unknown; quantity?: unknown }[]) : []) {
    const inventoryId = Number(line?.inventory_id);
    const quantity = Number(line?.quantity);
    if (!Number.isInteger(inventoryId) || inventoryId <= 0) throw new HttpError(400, 'صنف غير صالح في الطلب');
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new HttpError(400, 'الكمية يجب أن تكون عدداً صحيحاً أكبر من صفر');
    }
    merged.set(inventoryId, (merged.get(inventoryId) ?? 0) + quantity);
  }
  const lines = [...merged.entries()].map(([inventory_id, quantity]) => ({ inventory_id, quantity }));
  if (!lines.length) throw new HttpError(400, 'أضف وسيلة واحدة على الأقل إلى الطلب');
  return lines;
}

/** نقص المخزون الحالي مقارنة بالطلب (يُعاد فحصه عند الموافقة). */
function stockShortage(items: { inventory_id: number; quantity: number }[]): string | null {
  for (const line of items) {
    const item = getInventory(line.inventory_id);
    if (!item || item.deleted_at) return `الصنف رقم ${line.inventory_id} غير موجود في الجرد`;
    if (item.available_quantity < line.quantity) {
      return `الكمية المتوفرة من «${item.name}» هي ${item.available_quantity} ${item.unit} فقط (المطلوب ${line.quantity})`;
    }
  }
  return null;
}

/** أستاذ ينشئ طلب وسائل/إعارة. */
export function create(req: Request, res: Response): void {
  const currentUser = (req as AuthedRequest).currentUser;
  if (!currentUser) throw new HttpError(401, 'يجب تسجيل الدخول');

  const body = req.body as {
    teacher_id?: number;
    session_date?: string;
    start_time?: string;
    end_time?: string;
    class_name?: string;
    subject?: string;
    notes?: string | null;
    items?: unknown;
  };

  const sessionDate = String(body.session_date ?? '');
  const startTime = String(body.start_time ?? '');
  const endTime = String(body.end_time ?? '');
  const className = String(body.class_name ?? '').trim();
  const subject = String(body.subject ?? '').trim();

  if (!DATE_RE.test(sessionDate)) throw new HttpError(400, 'تاريخ الحصة غير صالح');
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) throw new HttpError(400, 'وقت الحصة غير صالح');
  if (endTime <= startTime) throw new HttpError(400, 'وقت البداية يجب أن يسبق وقت النهاية');
  if (!className || !subject) throw new HttpError(400, 'القسم والمادة مطلوبان');

  const teacherId =
    currentUser.role === 'admin' && body.teacher_id ? Number(body.teacher_id) : currentUser.id;

  const lines = normalizeLines(body.items);
  const shortage = stockShortage(lines);
  if (shortage) throw new HttpError(409, shortage);

  const requestId = transaction(() => {
    const id = createRequest(
      {
        teacher_id: teacherId,
        session_date: sessionDate,
        start_time: startTime,
        end_time: endTime,
        class_name: className,
        subject,
        notes: body.notes ? String(body.notes).slice(0, 500) : null,
      },
      lines,
    );
    for (const line of lines) addRequestItem(id, line.inventory_id, line.quantity);
    return id;
  });

  logger.info('طلب وسائل جديد', { requestId, teacherId, lines: lines.length });
  res.status(201).json({ request: getRequest(requestId) });
}

/** الأستاذ يرى طلباته، والمدير يرى الكل (مع تصفية بالحالة). */
export function list(req: Request, res: Response): void {
  const currentUser = (req as AuthedRequest).currentUser;
  if (!currentUser) throw new HttpError(401, 'يجب تسجيل الدخول');
  const rawStatus = typeof req.query.status === 'string' ? req.query.status : '';
  const status = STATUSES.includes(rawStatus as RequestStatus) ? (rawStatus as RequestStatus) : undefined;

  const requests = listRequests({
    status,
    teacherId: currentUser.role === 'admin' ? undefined : currentUser.id,
  });
  res.json({ requests });
}

export function pending(req: Request, res: Response): void {
  const currentUser = (req as AuthedRequest).currentUser;
  if (!currentUser) throw new HttpError(401, 'يجب تسجيل الدخول');
  res.json({ pending: pendingCount(currentUser.role === 'admin' ? undefined : currentUser.id) });
}

export function getOne(req: Request, res: Response): void {
  const request = getRequest(parseId(req.params.id));
  if (!request) throw new HttpError(404, 'الطلب غير موجود');
  if (!canAccessTeacher(req, request.teacher_id)) throw new HttpError(403, 'لا يمكنك الوصول إلى طلب أستاذ آخر');
  res.json({ request });
}

/** موافقة المدير: تُنشئ جلسة إعارة وتخصم المتوفر. */
export function approve(req: Request, res: Response): void {
  const currentUser = (req as AuthedRequest).currentUser;
  if (!currentUser) throw new HttpError(401, 'يجب تسجيل الدخول');

  const id = parseId(req.params.id);
  const request = getRequest(id);
  if (!request) throw new HttpError(404, 'الطلب غير موجود');
  if (request.status !== 'pending') throw new HttpError(409, 'تمت معالجة هذا الطلب مسبقاً');

  const lines: { inventory_id: number; quantity: number }[] = request.items.map((item: RequestItemView) => ({
    inventory_id: item.inventory_id,
    quantity: item.quantity,
  }));
  const shortage = stockShortage(lines);
  if (shortage) throw new HttpError(409, shortage);

  const note = typeof req.body?.admin_note === 'string' ? req.body.admin_note.trim().slice(0, 300) : '';

  const sessionId = transaction(() => {
    const sid = createSession({
      teacher_id: request.teacher_id,
      room_id: null,
      level: levelOf(request.class_name),
      class_name: request.class_name,
      subject: request.subject,
      session_date: request.session_date,
      start_time: request.start_time,
      end_time: request.end_time,
      notes: `طلب معتمد رقم ${request.id}${note ? ` — ${note}` : ''}`,
    });
    let allConsumed = true;
    for (const item of request.items) {
      const chemical = item.category === 'chemical';
      if (!chemical) allConsumed = false;
      createItem({
        session_id: sid,
        inventory_id: item.inventory_id,
        quantity_out: item.quantity,
        condition_out: chemical ? 'consumed' : 'good',
        notes: null,
      });
      adjustAvailable(item.inventory_id, -item.quantity);
    }
    setStatus(sid, allConsumed ? 'returned' : 'open');
    decide(id, { status: 'approved', decidedBy: currentUser.id, adminNote: note || null, sessionId: sid });
    return sid;
  });

  logger.info('طلب معتمد', { requestId: id, sessionId, by: currentUser.id });
  res.json({ request: getRequest(id), session_id: sessionId });
}

/** رفض المدير مع سبب اختياري. */
export function reject(req: Request, res: Response): void {
  const currentUser = (req as AuthedRequest).currentUser;
  if (!currentUser) throw new HttpError(401, 'يجب تسجيل الدخول');

  const id = parseId(req.params.id);
  const request = getRequest(id);
  if (!request) throw new HttpError(404, 'الطلب غير موجود');
  if (request.status !== 'pending') throw new HttpError(409, 'تمت معالجة هذا الطلب مسبقاً');

  const note = typeof req.body?.admin_note === 'string' ? req.body.admin_note.trim().slice(0, 300) : '';
  decide(id, { status: 'rejected', decidedBy: currentUser.id, adminNote: note || null });
  logger.info('طلب مرفوض', { requestId: id, by: currentUser.id });
  res.json({ request: getRequest(id) });
}

/** الأستاذ يلغي طلبه ما دام معلّقاً. */
export function cancel(req: Request, res: Response): void {
  const currentUser = (req as AuthedRequest).currentUser;
  if (!currentUser) throw new HttpError(401, 'يجب تسجيل الدخول');

  const id = parseId(req.params.id);
  const request = getRequest(id);
  if (!request) throw new HttpError(404, 'الطلب غير موجود');
  if (request.teacher_id !== currentUser.id) throw new HttpError(403, 'لا يمكنك إلغاء طلب أستاذ آخر');
  if (request.status !== 'pending') throw new HttpError(409, 'لا يمكن إلغاء طلب تمت معالجته');

  decide(id, { status: 'cancelled', decidedBy: currentUser.id });
  res.json({ request: getRequest(id) });
}

/** يُستخدم للتوثيق فقط: أعداد الطلبات حسب الحالة. */
export function stats(_req: Request, res: Response): void {
  res.json({ pending: pendingCount(), items: requestItems(0).length });
}
