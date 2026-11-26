import { allRows, oneRow, run } from '../db.ts';

/**
 * حالة العنصر عند الإعارة:
 * - `good`: صالح ويُرجَع لاحقاً.
 * - `consumed`: مادة كيميائية مستهلكة داخل الحصة (لا تُرجَع).
 * - `damaged`: كان تالفاً قبل الإعارة (يبقى محسوباً ضمن المعلّق حتى يُرجع).
 */
export type ItemCondition = 'good' | 'consumed' | 'damaged' | 'missing';

export type BorrowingItem = {
  id: number;
  session_id: number;
  inventory_id: number;
  quantity_out: number;
  quantity_returned: number;
  condition_out: ItemCondition;
  condition_in: ItemCondition | null;
  damaged: number;
  notes: string | null;
};

export type BorrowingItemView = BorrowingItem & {
  name: string;
  code: string;
  owner_no: string | null;
  unit: string;
  category: string;
};

export function createItem(data: {
  session_id: number;
  inventory_id: number;
  quantity_out: number;
  condition_out?: ItemCondition;
  notes?: string | null;
}): number {
  const { lastInsertRowid } = run(
    `INSERT INTO borrowing_items (session_id, inventory_id, quantity_out, condition_out, notes)
     VALUES (?, ?, ?, ?, ?)`,
    data.session_id,
    data.inventory_id,
    data.quantity_out,
    data.condition_out ?? 'good',
    data.notes ?? null,
  );
  return lastInsertRowid;
}

export function itemsBySession(sessionId: number): BorrowingItemView[] {
  return allRows<BorrowingItemView>(
    `SELECT i.*, inv.name, inv.code, inv.owner_no, inv.unit, inv.category
     FROM borrowing_items i JOIN inventory inv ON inv.id = i.inventory_id
     WHERE i.session_id = ? ORDER BY i.id`,
    sessionId,
  );
}

export function getItem(id: number): BorrowingItem | undefined {
  return oneRow<BorrowingItem>('SELECT * FROM borrowing_items WHERE id = ?', id);
}

export function recordReturn(
  id: number,
  quantityReturned: number,
  conditionIn: ItemCondition,
  damaged: boolean,
): void {
  run(
    'UPDATE borrowing_items SET quantity_returned = ?, condition_in = ?, damaged = ? WHERE id = ?',
    Math.max(0, quantityReturned),
    conditionIn,
    damaged ? 1 : 0,
    id,
  );
}

/** سطر مستهلك لا يُنتظر إرجاعه. */
export function isConsumed(item: { condition_out: string }): boolean {
  return item.condition_out === 'consumed';
}

/** الكمية المتبقية للإرجاع (صفر للمستهلك). */
export function outstandingOf(item: { condition_out: string; quantity_out: number; quantity_returned: number }): number {
  if (isConsumed(item)) return 0;
  return Math.max(0, item.quantity_out - item.quantity_returned);
}

/** العناصر التي لم تُرجع بعد (لتقارير المتأخرات). */
export function outstandingItems(sinceDate: string): BorrowingItemView[] {
  return allRows<BorrowingItemView>(
    `SELECT i.*, inv.name, inv.code, inv.owner_no, inv.unit, inv.category
     FROM borrowing_items i
     JOIN borrowing_sessions s ON s.id = i.session_id
     JOIN inventory inv ON inv.id = i.inventory_id
     WHERE i.condition_out != 'consumed' AND i.quantity_returned < i.quantity_out
       AND s.session_date >= ?
     ORDER BY s.session_date DESC`,
    sinceDate,
  );
}
