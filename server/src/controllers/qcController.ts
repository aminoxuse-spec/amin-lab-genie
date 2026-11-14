import type { Request, Response } from 'express';
import {
  createCheck,
  getCheck,
  listChecks,
  statusBreakdown,
  trend,
  updateCheck,
  type QCStatus,
} from '../models/QCCheck.ts';
import {
  expiringItems,
  getInventory,
  inventorySummary,
  lowStockItems,
  setAvailable,
} from '../models/Inventory.ts';
import { parseId } from '../middleware/validation.ts';
import { HttpError } from '../middleware/validation.ts';

export function list(req: Request, res: Response): void {
  const inventoryId = typeof req.query.inventory_id === 'string' ? Number(req.query.inventory_id) : undefined;
  res.json({
    checks: listChecks({
      inventory_id: Number.isInteger(inventoryId) ? inventoryId : undefined,
      from: typeof req.query.from === 'string' ? req.query.from : undefined,
      to: typeof req.query.to === 'string' ? req.query.to : undefined,
    }),
  });
}

export function create(req: Request, res: Response): void {
  const body = req.body as {
    inventory_id: number;
    check_date?: string;
    status: QCStatus;
    quantity_found: number;
    notes?: string | null;
  };
  const item = getInventory(Number(body.inventory_id));
  if (!item) throw new HttpError(404, 'الصنف غير موجود');

  const id = createCheck({
    inventory_id: item.id,
    check_date: body.check_date,
    status: body.status,
    quantity_found: Number(body.quantity_found),
    notes: body.notes ?? null,
  });

  // مزامنة الكمية المتاحة مع نتيجة الفحص
  if (body.status === 'ok') setAvailable(item.id, Math.min(item.quantity, Number(body.quantity_found)));
  else setAvailable(item.id, Math.min(item.available_quantity, Number(body.quantity_found)));

  res.status(201).json({ id, checks: listChecks({ inventory_id: item.id }) });
}

export function update(req: Request, res: Response): void {
  const id = parseId(req.params.id);
  if (!getCheck(id)) throw new HttpError(404, 'سجل الفحص غير موجود');

  const body = req.body as {
    status: QCStatus;
    quantity_found: number;
    check_date?: string;
    notes?: string | null;
  };
  const check = updateCheck(id, {
    status: body.status,
    quantity_found: Number(body.quantity_found),
    check_date: body.check_date,
    notes: body.notes ?? null,
  });
  res.json({ check });
}

export function remove(req: Request, res: Response): void {
  parseId(req.params.id);
  res.status(501).json({ error: 'حذف سجل الفحص غير مدعوم، أضف فحصاً جديداً بدلاً منه' });
}

export function analysis(_req: Request, res: Response): void {
  const breakdown = statusBreakdown();
  const totalChecks = breakdown.reduce((sum, row) => sum + row.total, 0);
  const issues = breakdown
    .filter((row) => row.status !== 'ok')
    .reduce((sum, row) => sum + row.total, 0);

  res.json({
    summary: {
      ...inventorySummary(),
      totalChecks,
      issues,
      qualityRate: totalChecks === 0 ? 100 : Math.round(((totalChecks - issues) / totalChecks) * 100),
    },
    breakdown,
    trend: trend(14),
    lowStock: lowStockItems(),
    expiring: expiringItems(60),
  });
}
