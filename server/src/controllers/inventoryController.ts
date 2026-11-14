import type { Request, Response } from 'express';
import {
  createInventory,
  deleteInventory,
  expiringItems,
  findByCode,
  getInventory,
  inventorySummary,
  listInventory,
  lowStockItems,
  purgeInventory,
  restoreInventory,
  updateInventory,
  type InventoryCategory,
  type InventoryInput,
} from '../models/Inventory.ts';
import { parseId } from '../middleware/validation.ts';

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
  const exact = items.filter((item) => item.code.toLowerCase() === code);
  const matches = exact.length
    ? exact
    : items.filter(
        (item) => item.code.toLowerCase().includes(code) || item.name.toLowerCase().includes(code),
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
  const item = createInventory(body);
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
  const item = updateInventory(id, body);
  if (!item) {
    res.status(404).json({ error: 'الصنف غير موجود' });
    return;
  }
  res.json({ item });
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
