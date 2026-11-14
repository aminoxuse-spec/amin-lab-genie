import type { Request, Response } from 'express';
import {
  createSession,
  deleteSession,
  getSession,
  listSessions,
  setStatus,
  updateSession,
  type SessionStatus,
} from '../models/BorrowingSession.ts';
import {
  createItem,
  isConsumed,
  itemsBySession,
  recordReturn,
  type BorrowingItemView,
  type ItemCondition,
} from '../models/BorrowingItem.ts';
import { adjustAvailable, getInventory } from '../models/Inventory.ts';
import { getRoom } from '../models/LabRoom.ts';
import { findById } from '../models/User.ts';
import { transaction } from '../db.ts';
import { canAccessTeacher, type AuthedRequest } from '../middleware/auth.ts';
import { HttpError, parseId } from '../middleware/validation.ts';
import { logger } from '../utils/logger.ts';

type NewItem = {
  inventory_id: number;
  quantity: number;
  condition_out?: ItemCondition;
  notes?: string | null;
};

type ReturnLine = { item_id: number; quantity: number; condition_in?: ItemCondition };

const STATUSES: SessionStatus[] = ['open', 'partial', 'returned'];

function details(id: number) {
  const session = getSession(id);
  if (!session) throw new HttpError(404, 'جلسة الإعارة غير موجودة');
  return { ...session, items: itemsBySession(id) };
}

/** الحالة تُحسب من السطور: المستهلك لا يُنتظر إرجاعه. */
function recomputeStatus(id: number): SessionStatus {
  const items = itemsBySession(id);
  const billable = items.filter((item) => !isConsumed(item));
  if (billable.length === 0) return 'returned';
  const allReturned = billable.every((item) => item.quantity_returned >= item.quantity_out);
  const anyReturned = billable.some((item) => item.quantity_returned > 0);
  return allReturned ? 'returned' : anyReturned ? 'partial' : 'open';
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function sumBy(items: BorrowingItemView[], predicate: (item: BorrowingItemView) => boolean): number {
  return items.filter(predicate).reduce((total, item) => total + item.quantity_out, 0);
}

export function list(req: Request, res: Response): void {
  const rawStatus = typeof req.query.status === 'string' ? req.query.status : undefined;
  const status = STATUSES.includes(rawStatus as SessionStatus) ? (rawStatus as SessionStatus) : undefined;
  const currentUser = (req as AuthedRequest).currentUser;
  const sessions = listSessions({
    status,
    date: typeof req.query.date === 'string' ? req.query.date : undefined,
    teacher_id: currentUser?.role === 'admin' ? undefined : currentUser?.id,
  });
  res.json({ sessions });
}

export function getOne(req: Request, res: Response): void {
  const session = getSession(parseId(req.params.id));
  if (!session) {
    res.status(404).json({ error: 'جلسة الإعارة غير موجودة' });
    return;
  }
  if (!canAccessTeacher(req, session.teacher_id)) {
    res.status(403).json({ error: 'لا يمكنك الوصول إلى جلسة أستاذ آخر' });
    return;
  }
  res.json({ session: { ...session, items: itemsBySession(session.id) } });
}

export function create(req: Request, res: Response): void {
  const body = req.body as {
    teacher_id?: number;
    room_id?: number | null;
    level?: string | null;
    class_name: string;
    subject: string;
    session_date: string;
    start_time: string;
    end_time?: string;
    due_date?: string | null;
    notes?: string | null;
    items: NewItem[];
  };
  const currentUser = (req as AuthedRequest).currentUser;
  if (!currentUser) throw new HttpError(401, 'يجب تسجيل الدخول');

  const teacherId = currentUser.role === 'admin' && body.teacher_id ? body.teacher_id : currentUser.id;
  if (!findById(teacherId)) throw new HttpError(400, 'الأستاذ غير موجود');
  if (body.room_id && !getRoom(Number(body.room_id))) throw new HttpError(400, 'القاعة غير موجودة');

  // إن لم تُحدَّد ساعة النهاية تُحسب ساعة واحدة بعد البداية
  const [startHour, startMinute] = body.start_time.split(':').map(Number);
  const endTime = body.end_time || minutesToTime(startHour * 60 + startMinute + 60);
  if (endTime <= body.start_time) throw new HttpError(400, 'وقت البداية يجب أن يسبق وقت النهاية');

  // دمج الأسطر المكرّرة لنفس الصنف ونفس الحالة
  type MergedLine = { inventory_id: number; quantity: number; condition_out: ItemCondition; notes: string[] };
  const merged = new Map<string, MergedLine>();
  for (const line of Array.isArray(body.items) ? body.items : []) {
    const inventoryId = Number(line.inventory_id);
    const quantity = Number(line.quantity);
    const condition: ItemCondition = line.condition_out ?? 'good';
    if (!Number.isInteger(inventoryId) || inventoryId <= 0) throw new HttpError(400, 'صنف غير صالح');
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new HttpError(400, 'الكمية يجب أن تكون عدداً صحيحاً أكبر من صفر');
    }
    if (!['good', 'consumed', 'damaged'].includes(condition)) {
      throw new HttpError(400, 'حالة العنصر غير مسموحة');
    }
    const key = `${inventoryId}:${condition}`;
    const previous = merged.get(key);
    if (previous) {
      previous.quantity += quantity;
      if (line.notes) previous.notes.push(String(line.notes).trim());
    } else {
      merged.set(key, {
        inventory_id: inventoryId,
        quantity,
        condition_out: condition,
        notes: line.notes ? [String(line.notes).trim()] : [],
      });
    }
  }

  const lines: MergedLine[] = [...merged.values()];
  if (lines.length === 0) throw new HttpError(400, 'أضف عنصراً واحداً على الأقل (عتاداً أو مادة كيميائية)');

  for (const line of lines) {
    const item = getInventory(line.inventory_id);
    if (!item) throw new HttpError(400, `العنصر رقم ${line.inventory_id} غير موجود`);
    if (item.deleted_at) throw new HttpError(409, `«${item.name}» محذوف من الجرد، استرجعه أولاً`);
    if (line.condition_out === 'consumed' && item.category !== 'chemical') {
      throw new HttpError(400, `حالة «مستهلك» تخص المواد الكيميائية فقط («${item.name}» ليس مادة كيميائية)`);
    }
    if (item.available_quantity < line.quantity) {
      throw new HttpError(
        409,
        `الكمية المتوفرة من «${item.name}» هي ${item.available_quantity} ${item.unit} فقط`,
      );
    }
  }

  const sessionId = transaction(() => {
    const id = createSession({
      teacher_id: teacherId,
      room_id: body.room_id ? Number(body.room_id) : null,
      level: body.level ?? null,
      class_name: body.class_name,
      subject: body.subject,
      session_date: body.session_date,
      start_time: body.start_time,
      end_time: endTime,
      due_date: body.due_date ?? null,
      notes: body.notes ?? null,
    });
    for (const line of lines) {
      createItem({
        session_id: id,
        inventory_id: line.inventory_id,
        quantity_out: line.quantity,
        condition_out: line.condition_out,
        notes: line.notes.length ? line.notes.join(' / ') : null,
      });
      adjustAvailable(line.inventory_id, -line.quantity);
    }
    setStatus(id, recomputeStatus(id));
    return id;
  });

  logger.info('جلسة إعارة جديدة', { sessionId, lines: lines.length });
  res.status(201).json({ session: details(sessionId) });
}

export function returnItems(req: Request, res: Response): void {
  const id = parseId(req.params.id);
  const session = getSession(id);
  if (!session) throw new HttpError(404, 'جلسة الإعارة غير موجودة');
  if (!canAccessTeacher(req, session.teacher_id)) {
    throw new HttpError(403, 'لا يمكنك تعديل جلسة أستاذ آخر');
  }

  const body = req.body as { items: ReturnLine[] };
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new HttpError(400, 'حدّد الكميات المرجعة');
  }

  const current = itemsBySession(id);
  if (current.length === 0) throw new HttpError(400, 'لا توجد عناصر في هذه الجلسة');

  transaction(() => {
    for (const line of body.items) {
      const item = current.find((row) => row.id === Number(line.item_id));
      if (!item) throw new HttpError(400, `سطر الإعارة ${line.item_id} لا ينتمي لهذه الجلسة`);
      if (isConsumed(item)) {
        throw new HttpError(400, `«${item.name}» مسجّل كمستهلك ولا يحتاج إرجاعاً`);
      }

      const quantity = Number(line.quantity);
      if (!Number.isInteger(quantity) || quantity < 0) {
        throw new HttpError(400, 'الكمية المرجعة غير صالحة');
      }

      const remaining = Math.max(0, item.quantity_out - item.quantity_returned);
      if (quantity > remaining) {
        throw new HttpError(400, `الكمية المرجعة من «${item.name}» تتجاوز المتبقي (${remaining})`);
      }

      const condition: ItemCondition = line.condition_in ?? 'good';
      const totalReturned = item.quantity_returned + quantity;
      recordReturn(item.id, totalReturned, condition, condition === 'damaged' || condition === 'missing');

      // التالف أو المفقود لا يعود إلى المخزون المتاح
      if (condition === 'good' && quantity > 0) adjustAvailable(item.inventory_id, quantity);
      item.quantity_returned = totalReturned;
    }
  });

  setStatus(id, recomputeStatus(id));
  logger.info('إرجاع عناصر', { sessionId: id, status: recomputeStatus(id) });
  res.json({ session: details(id) });
}

/** تعديل بيانات الإعارة (العناصر تُعدل عبر الإرجاع أو إعارة جديدة). */
export function update(req: Request, res: Response): void {
  const id = parseId(req.params.id);
  const session = getSession(id);
  if (!session) throw new HttpError(404, 'جلسة الإعارة غير موجودة');
  if (!canAccessTeacher(req, session.teacher_id)) {
    throw new HttpError(403, 'لا يمكنك تعديل جلسة أستاذ آخر');
  }

  const body = req.body as {
    level?: string | null;
    class_name: string;
    subject: string;
    session_date: string;
    start_time: string;
    end_time: string;
    due_date?: string | null;
    notes?: string | null;
    room_id?: number | null;
    teacher_id?: number;
  };
  if (body.start_time >= body.end_time) throw new HttpError(400, 'وقت البداية يجب أن يسبق وقت النهاية');
  if (body.room_id && !getRoom(Number(body.room_id))) throw new HttpError(400, 'القاعة غير موجودة');

  const currentUser = (req as AuthedRequest).currentUser;
  updateSession(id, {
    level: body.level ?? null,
    class_name: body.class_name,
    subject: body.subject,
    session_date: body.session_date,
    start_time: body.start_time,
    end_time: body.end_time,
    due_date: body.due_date ?? null,
    notes: body.notes ?? null,
    room_id: body.room_id ? Number(body.room_id) : null,
    teacher_id: currentUser?.role === 'admin' && body.teacher_id ? Number(body.teacher_id) : undefined,
  });
  res.json({ session: details(id) });
}

export function remove(req: Request, res: Response): void {
  const id = parseId(req.params.id);
  const session = getSession(id);
  if (!session) throw new HttpError(404, 'جلسة الإعارة غير موجودة');
  if (!canAccessTeacher(req, session.teacher_id)) {
    throw new HttpError(403, 'لا يمكنك حذف جلسة أستاذ آخر');
  }

  transaction(() => {
    for (const item of itemsBySession(id)) {
      const outstanding = isConsumed(item) ? 0 : item.quantity_out - item.quantity_returned;
      if (outstanding > 0) adjustAvailable(item.inventory_id, outstanding);
    }
    deleteSession(id);
  });

  res.json({ ok: true });
}

/** ملخّص جلسة للوصل المطبوع. */
export function receipt(req: Request, res: Response): void {
  const session = getSession(parseId(req.params.id));
  if (!session) throw new HttpError(404, 'جلسة الإعارة غير موجودة');
  if (!canAccessTeacher(req, session.teacher_id)) throw new HttpError(403, 'لا يمكنك الوصول إلى جلسة أستاذ آخر');

  const items = itemsBySession(session.id);
  res.json({
    session: { ...session, items },
    totals: {
      lines: items.length,
      units: items.reduce((sum, item) => sum + item.quantity_out, 0),
      returned: items.reduce((sum, item) => sum + item.quantity_returned, 0),
      consumed: sumBy(items, (item) => isConsumed(item)),
      outstanding: items.reduce(
        (sum, item) => sum + (isConsumed(item) ? 0 : item.quantity_out - item.quantity_returned),
        0,
      ),
    },
  });
}
