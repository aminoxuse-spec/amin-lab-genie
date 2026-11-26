import type { Request, Response } from 'express';
import {
  createInventory,
  deleteInventory,
  expiringItems,
  findByCode,
  findByOwnerNo,
  getAliases,
  getInventory,
  inventorySummary,
  listInventory,
  lowStockItems,
  purgeInventory,
  restoreInventory,
  setAliases,
  updateInventory,
  type InventoryCategory,
  type InventoryInput,
} from '../models/Inventory.ts';
import { parseId } from '../middleware/validation.ts';
import type { AuthedRequest } from '../middleware/auth.ts';
import { createStockMovement, listStockMovements, logStockMovement, type StockMovementType } from '../models/StockMovement.ts';

const CATEGORIES: InventoryCategory[] = ['apparatus', 'glassware', 'chemical'];

export function list(req: Request, res: Response): void {
  const rawCategory = typeof req.query.category === 'string' ? req.query.category : undefined;
  const category = CATEGORIES.includes(rawCategory as InventoryCategory)
    ? (rawCategory as InventoryCategory)
    : undefined;

  const items = listInventory({
    q: typeof req.query.q === 'string' ? req.query.q : undefined,
    category,
    lowStock: req.query.lowStock === 'true',
  });

  res.json({ items, summary: inventorySummary() });
}

export function summary(_req: Request, res: Response): void {
  res.json({ summary: inventorySummary(), lowStock: lowStockItems(), expiring: expiringItems() });
}

/**
 * بحث سريع عن وسيلة من رمز QR أو رقم الجرد (للماسح).
 * يُرجع كل المطابقات حتى يُختار منها عند التشابه/التكرار.
 */
export function lookup(req: Request, res: Response): void {
  const raw = String(req.query.code ?? req.query.q ?? '').trim();
  if (!raw) {
    res.status(400).json({ error: 'أدخل رمز QR أو رقم الجرد' });
    return;
  }

  const code = raw.replace(/^AMIN:/i, '').replace(/^INVENTORY:/i, '').trim().toLowerCase();
  const items = listInventory();
  const ownerOf = (item: { owner_no?: string | null }) => String(item.owner_no ?? '').toLowerCase();
  // البحث يشمل رمز التطبيق ورقم الجرد الخاص بصاحب المخبر.
  const exact = items.filter((item) => item.code.toLowerCase() === code || ownerOf(item) === code);
  const matches = exact.length
    ? exact
    : items.filter(
        (item) =>
          item.code.toLowerCase().includes(code) ||
          item.name.toLowerCase().includes(code) ||
          ownerOf(item).includes(code),
      );

  res.json({ query: code, exact: exact.length > 0, items: matches.slice(0, 30) });
}

/** سلة المحذوفات: الأصناف القابلة للاسترجاع. */
export function trash(_req: Request, res: Response): void {
  res.json({ items: listInventory({ trash: true }), count: inventorySummary().deleted });
}

export function restore(req: Request, res: Response): void {
  const id = parseId(req.params.id);
  const item = restoreInventory(id);
  if (!item) {
    res.status(404).json({ error: 'الصنف غير موجود في سلة المحذوفات' });
    return;
  }
  res.json({ item, restored: true });
}

export function purge(req: Request, res: Response): void {
  const id = parseId(req.params.id);
  const item = getInventory(id);
  if (!item || !item.deleted_at) {
    res.status(404).json({ error: 'الصنف غير موجود في سلة المحذوفات' });
    return;
  }
  try {
    purgeInventory(id);
  } catch (error) {
    res.status(409).json({
      error: 'لا يمكن الحذف النهائي: الصنف مرتبط بسجلات إعارة. استرجعه واحتفظ به بدلاً من ذلك.',
    });
    return;
  }
  res.json({ ok: true, purged: true });
}

/** استبدال مرادفات صنف (أسماء الوسيلة كما ترد في تقارير الإعارة). */
export function replaceAliases(req: Request, res: Response): void {
  const id = parseId(req.params.id);
  const item = getInventory(id);
  if (!item) {
    res.status(404).json({ error: 'الصنف غير موجود' });
    return;
  }
  const raw = (req.body as { aliases?: unknown }).aliases;
  if (!Array.isArray(raw) || raw.some((entry) => typeof entry !== 'string')) {
    res.status(400).json({ error: 'aliases: يجب أن تكون لائحة نصوص' });
    return;
  }
  const aliases = setAliases(id, raw as string[]);
  res.json({ aliases });
}

export function aliases(req: Request, res: Response): void {
  res.json({ aliases: getAliases(parseId(req.params.id)) });
}

export function getOne(req: Request, res: Response): void {
  const item = getInventory(parseId(req.params.id));
  if (!item) {
    res.status(404).json({ error: 'الصنف غير موجود' });
    return;
  }
  res.json({ item });
}

export function create(req: Request, res: Response): void {
  const body = req.body as InventoryInput;
  if (findByCode(body.code)) {
    res.status(409).json({ error: 'رمز الصنف مستعمل مسبقاً' });
    return;
  }
  if (body.owner_no) {
    const clash = findByOwnerNo(String(body.owner_no));
    if (clash) {
      res.status(409).json({
        error: `رقم الجرد الخاص «${clash.owner_no}» مستعمل في الصنف «${clash.name}» (${clash.code})`,
        conflict: { id: clash.id, code: clash.code, name: clash.name, owner_no: clash.owner_no },
      });
      return;
    }
  }
  const item = createInventory(body);
  logStockMovement({
    item,
    type: 'in',
    delta: item.quantity,
    reason: 'اقتناء جديد',
    user: (req as AuthedRequest).currentUser,
  });
  res.status(201).json({ item });
}

export function update(req: Request, res: Response): void {
  const id = parseId(req.params.id);
  const body = req.body as Partial<InventoryInput>;
  if (body.code) {
    const existing = findByCode(body.code);
    if (existing && existing.id !== id) {
      res.status(409).json({ error: 'رمز الصنف مستعمل مسبقاً' });
      return;
    }
  }
  if (body.owner_no) {
    const clash = findByOwnerNo(String(body.owner_no), id);
    if (clash) {
      res.status(409).json({
        error: `رقم الجرد الخاص «${clash.owner_no}» مستعمل في الصنف «${clash.name}» (${clash.code})`,
        conflict: { id: clash.id, code: clash.code, name: clash.name, owner_no: clash.owner_no },
      });
      return;
    }
  }
  const before = getInventory(id);
  const item = updateInventory(id, body);
  if (!item) {
    res.status(404).json({ error: 'الصنف غير موجود' });
    return;
  }
  if (before && item.quantity !== before.quantity) {
    logStockMovement({
      item,
      type: 'adjust',
      delta: item.quantity - before.quantity,
      reason: 'تعديل كمية من بطاقة الصنف',
      user: (req as AuthedRequest).currentUser,
    });
  }
  res.json({ item });
}

const MOVEMENT_TYPES: StockMovementType[] = ['in', 'consume', 'damage', 'adjust'];

/** سجل حركات المخزون مع تصفية اختيارية. */
export function movements(req: Request, res: Response): void {
  const rawType = typeof req.query.type === 'string' ? req.query.type : '';
  const type = MOVEMENT_TYPES.includes(rawType as StockMovementType) ? (rawType as StockMovementType) : undefined;
  res.json({
    movements: listStockMovements({
      type,
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
    }),
  });
}

/** إضافة حركة مخزون جديدة (إدخال / استهلاك / كسر / تسوية جرد). */
export function createMovement(req: Request, res: Response): void {
  const body = req.body as {
    item_id: number;
    type: StockMovementType;
    quantity: number;
    reason?: string;
    movement_date?: string;
  };
  if (!MOVEMENT_TYPES.includes(body.type)) {
    res.status(400).json({ error: 'نوع الحركة غير صالح' });
    return;
  }
  try {
    const result = createStockMovement({
      item_id: Number(body.item_id),
      type: body.type,
      quantity: Number(body.quantity),
      reason: body.reason ?? null,
      movement_date: body.movement_date ?? null,
      user: (req as AuthedRequest).currentUser,
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'تعذّر تسجيل الحركة' });
  }
}

export function remove(req: Request, res: Response): void {
  const id = parseId(req.params.id);
  const item = getInventory(id);
  if (!item) {
    res.status(404).json({ error: 'الصنف غير موجود' });
    return;
  }
  if (item.deleted_at) {
    res.status(409).json({ error: 'الصنف موجود مسبقاً في سلة المحذوفات' });
    return;
  }
  if (item.available_quantity < item.quantity) {
    res.status(409).json({ error: 'لا يمكن حذف صنف ما زال معاراً. يرجى إرجاع الكميات أولاً.' });
    return;
  }
  deleteInventory(id);
  res.json({ ok: true, deleted: true, restorable: true });
}
