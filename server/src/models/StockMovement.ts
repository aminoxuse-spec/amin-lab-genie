import { allRows, oneRow, run, transaction } from '../db.ts';
import { getInventory, type InventoryItem } from './Inventory.ts';

export type StockMovementType = 'in' | 'consume' | 'damage' | 'adjust';

export type StockMovement = {
  id: number;
  item_id: number;
  type: StockMovementType;
  quantity: number;
  balance_after: number;
  reason: string | null;
  movement_date: string;
  user_id: number | null;
  username: string | null;
  created_at: string;
};

export type StockMovementRow = StockMovement & {
  item_name: string;
  item_code: string;
  unit: string;
  category: string;
};

export type MovementUser = { id?: number; username?: string } | undefined;

export function listStockMovements(filters: { type?: StockMovementType; q?: string; limit?: number } = {}): StockMovementRow[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filters.type) {
    where.push('m.type = ?');
    params.push(filters.type);
  }
  if (filters.q?.trim()) {
    where.push('(i.name LIKE ? OR i.code LIKE ? OR m.reason LIKE ?)');
    const like = `%${filters.q.trim()}%`;
    params.push(like, like, like);
  }
  const limit = Math.min(Math.max(Number(filters.limit) || 200, 1), 1000);
  return allRows<StockMovementRow>(
    `SELECT m.*, i.name AS item_name, i.code AS item_code, i.unit AS unit, i.category AS category
     FROM stock_movements m JOIN inventory i ON i.id = m.item_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY date(m.movement_date) DESC, m.id DESC
     LIMIT ${limit}`,
    ...params,
  );
}

function insertMovement(input: {
  itemId: number;
  type: StockMovementType;
  delta: number;
  balanceAfter: number;
  reason?: string | null;
  movementDate?: string | null;
  user?: MovementUser;
}): number {
  const date = (input.movementDate || '').trim() || new Date().toISOString().slice(0, 10);
  const { lastInsertRowid } = run(
    `INSERT INTO stock_movements (item_id, type, quantity, balance_after, reason, movement_date, user_id, username)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    input.itemId,
    input.type,
    input.delta,
    input.balanceAfter,
    input.reason ?? null,
    date,
    input.user?.id ?? null,
    input.user?.username ?? null,
  );
  return lastInsertRowid;
}

/** تسجيل حركة دون تغيير الرصيد (تُستعمل بعد عمليات الجرد التي عدّلت الكمية مسبقاً). */
export function logStockMovement(input: {
  item: InventoryItem;
  type: StockMovementType;
  delta: number;
  balanceAfter?: number;
  reason?: string | null;
  movementDate?: string | null;
  user?: MovementUser;
}): void {
  if (!input.delta) return;
  insertMovement({
    itemId: input.item.id,
    type: input.type,
    delta: input.delta,
    balanceAfter: input.balanceAfter ?? input.item.quantity,
    reason: input.reason,
    movementDate: input.movementDate,
    user: input.user,
  });
}

/**
 * حركة مخزون جديدة: تُعدّل كمية الصنف والرصيد المتاح ثم تُسجّل الحركة.
 * - in / consume / damage: الكمية المدخلة مقدار موجب.
 * - adjust: الكمية المدخلة هي الرصيد الجديد المطلق.
 */
export function createStockMovement(input: {
  item_id: number;
  type: StockMovementType;
  quantity: number;
  reason?: string | null;
  movement_date?: string | null;
  user?: MovementUser;
}): { movement: StockMovementRow; item: InventoryItem } {
  const item = getInventory(input.item_id);
  if (!item) throw new Error('الصنف غير موجود');
  if (item.deleted_at) throw new Error('الصنف محذوف من الجرد، استرجعه أولاً');
  if (!Number.isInteger(input.quantity) || input.quantity < 0) {
    throw new Error('الكمية غير صالحة');
  }
  if (input.type !== 'adjust' && input.quantity < 1) {
    throw new Error('الكمية يجب أن تكون أكبر من صفر');
  }

  const borrowed = Math.max(0, item.quantity - item.available_quantity);
  let nextQuantity = item.quantity;
  if (input.type === 'adjust') nextQuantity = input.quantity;
  else if (input.type === 'in') nextQuantity = item.quantity + input.quantity;
  else nextQuantity = item.quantity - input.quantity;

  if (nextQuantity < 0) throw new Error('الكمية المطلوبة أكبر من الرصيد الحالي');
  const nextAvailable = Math.max(0, nextQuantity - borrowed);
  const delta = nextQuantity - item.quantity;

  let movementId = 0;
  transaction(() => {
    run('UPDATE inventory SET quantity = ?, available_quantity = ? WHERE id = ?', nextQuantity, nextAvailable, item.id);
    movementId = insertMovement({
      itemId: item.id,
      type: input.type,
      delta,
      balanceAfter: nextQuantity,
      reason: input.reason,
      movementDate: input.movement_date,
      user: input.user,
    });
  });

  const movement = oneRow<StockMovementRow>(
    `SELECT m.*, i.name AS item_name, i.code AS item_code, i.unit AS unit, i.category AS category
     FROM stock_movements m JOIN inventory i ON i.id = m.item_id WHERE m.id = ?`,
    movementId,
  ) as StockMovementRow;
  return { movement, item: getInventory(item.id) as InventoryItem };
}
