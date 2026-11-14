import { allRows, oneRow, run } from '../db.ts';

export type InventoryCategory = 'apparatus' | 'glassware' | 'chemical';

export type InventoryItem = {
  id: number;
  code: string;
  name: string;
  category: InventoryCategory;
  quantity: number;
  available_quantity: number;
  unit: string;
  location: string | null;
  min_quantity: number;
  expiry_date: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type InventoryInput = {
  code: string;
  name: string;
  category: InventoryCategory;
  quantity: number;
  unit?: string;
  location?: string | null;
  min_quantity?: number;
  expiry_date?: string | null;
};

const COLUMNS =
  'id, code, name, category, quantity, available_quantity, unit, location, min_quantity, expiry_date, deleted_at, created_at';

export function listInventory(filters: {
  q?: string;
  category?: InventoryCategory;
  lowStock?: boolean;
  trash?: boolean;
} = {}): InventoryItem[] {
  const where: string[] = [];
  const params: (string | number)[] = [];

  // الافتراضي: الأصناف النشطة فقط (غير المحذوفة)
  where.push(filters.trash ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL');

  if (filters.q?.trim()) {
    where.push('(name LIKE ? OR code LIKE ? OR location LIKE ?)');
    const like = `%${filters.q.trim()}%`;
    params.push(like, like, like);
  }
  if (filters.category) {
    where.push('category = ?');
    params.push(filters.category);
  }
  if (filters.lowStock) where.push('available_quantity <= min_quantity');

  const order = filters.trash ? 'deleted_at DESC' : 'category, name';
  const sql = `SELECT ${COLUMNS} FROM inventory WHERE ${where.join(' AND ')} ORDER BY ${order}`;

  return allRows<InventoryItem>(sql, ...params);
}

export function getInventory(id: number): InventoryItem | undefined {
  return oneRow<InventoryItem>(`SELECT ${COLUMNS} FROM inventory WHERE id = ?`, id);
}

export function findByCode(code: string): InventoryItem | undefined {
  return oneRow<InventoryItem>(`SELECT ${COLUMNS} FROM inventory WHERE code = ?`, code.trim());
}

export function createInventory(input: InventoryInput): InventoryItem {
  const { lastInsertRowid } = run(
    `INSERT INTO inventory (code, name, category, quantity, available_quantity, unit, location, min_quantity, expiry_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.code.trim(),
    input.name.trim(),
    input.category,
    input.quantity,
    input.quantity,
    input.unit ?? 'قطعة',
    input.location ?? null,
    input.min_quantity ?? 1,
    input.expiry_date ?? null,
  );
  return getInventory(lastInsertRowid) as InventoryItem;
}

export function updateInventory(id: number, input: Partial<InventoryInput>): InventoryItem | undefined {
  const current = getInventory(id);
  if (!current) return undefined;

  const quantity = input.quantity ?? current.quantity;
  const borrowed = current.quantity - current.available_quantity;
  const nextAvailable = Math.max(0, quantity - borrowed);

  run(
    `UPDATE inventory SET code = ?, name = ?, category = ?, quantity = ?, available_quantity = ?,
       unit = ?, location = ?, min_quantity = ?, expiry_date = ? WHERE id = ?`,
    input.code ?? current.code,
    input.name ?? current.name,
    input.category ?? current.category,
    quantity,
    nextAvailable,
    input.unit ?? current.unit,
    input.location === undefined ? current.location : input.location,
    input.min_quantity ?? current.min_quantity,
    input.expiry_date === undefined ? current.expiry_date : input.expiry_date,
    id,
  );
  return getInventory(id);
}

/** حذف ناعم: ينقل الصنف إلى سلة المحذوفات ويبقى قابلاً للاسترجاع. */
export function deleteInventory(id: number): boolean {
  return run(
    "UPDATE inventory SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL",
    id,
  ).changes > 0;
}

/** استرجاع صنف من سلة المحذوفات. */
export function restoreInventory(id: number): InventoryItem | undefined {
  const { changes } = run('UPDATE inventory SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL', id);
  return changes > 0 ? getInventory(id) : undefined;
}

/** حذف نهائي (لا يمكن التراجع). */
export function purgeInventory(id: number): boolean {
  return run('DELETE FROM inventory WHERE id = ?', id).changes > 0;
}

export function countDeleted(): number {
  const row = oneRow<{ total: number }>('SELECT COUNT(*) AS total FROM inventory WHERE deleted_at IS NOT NULL');
  return row?.total ?? 0;
}

/** تعديل المتوفر بعد الإعارة (delta سالب) أو الإرجاع (delta موجب). */
export function adjustAvailable(id: number, delta: number): void {
  run(
    'UPDATE inventory SET available_quantity = MAX(0, MIN(quantity, available_quantity + ?)) WHERE id = ?',
    delta,
    id,
  );
}

export function setAvailable(id: number, available: number): void {
  run(
    'UPDATE inventory SET available_quantity = MAX(0, MIN(quantity, ?)) WHERE id = ?',
    available,
    id,
  );
}

export function lowStockItems(): InventoryItem[] {
  return allRows<InventoryItem>(
    `SELECT ${COLUMNS} FROM inventory WHERE deleted_at IS NULL AND available_quantity <= min_quantity ORDER BY available_quantity ASC`,
  );
}

export function expiringItems(withinDays = 30): InventoryItem[] {
  return allRows<InventoryItem>(
    `SELECT ${COLUMNS} FROM inventory
     WHERE deleted_at IS NULL AND expiry_date IS NOT NULL AND date(expiry_date) <= date('now', ?)
     ORDER BY expiry_date ASC`,
    `+${withinDays} days`,
  );
}

export function inventorySummary(): {
  total: number;
  units: number;
  lowStock: number;
  expiring: number;
  deleted: number;
} {
  const row = oneRow<{ total: number; units: number }>(
    'SELECT COUNT(*) AS total, COALESCE(SUM(quantity), 0) AS units FROM inventory WHERE deleted_at IS NULL',
  );
  return {
    total: row?.total ?? 0,
    units: row?.units ?? 0,
    lowStock: lowStockItems().length,
    expiring: expiringItems().length,
    deleted: countDeleted(),
  };
}
