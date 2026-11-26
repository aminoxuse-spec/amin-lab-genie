import { allRows, db, oneRow, run } from '../db.ts';

export type InventoryCategory = 'apparatus' | 'glassware' | 'chemical';
export type DangerLevel = 'low' | 'medium' | 'high';

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
  formula: string | null;
  name_ar: string | null;
  danger_level: DangerLevel | null;
  supplier: string | null;
  invoice_no: string | null;
  owner_no: string | null;
  purchase_date: string | null;
  cost: number | null;
  deleted_at: string | null;
  created_at: string;
  /** مرادفات الوسيلة (أسماء التقارير) مفصولة بـ | */
  aliases_text: string | null;
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
  formula?: string | null;
  name_ar?: string | null;
  danger_level?: DangerLevel | null;
  supplier?: string | null;
  invoice_no?: string | null;
  owner_no?: string | null;
  purchase_date?: string | null;
  cost?: number | null;
};

/** رقم الجرد الخاص: يُنظّف من المسافات، والفراغ يُخزَّن NULL بدل نص فارغ. */
function cleanOwnerNo(value: string | null | undefined, fallback: string | null = null): string | null {
  const trimmed = String((value === undefined ? fallback : value) ?? '').trim();
  return trimmed ? trimmed : null;
}

const COLUMNS =
  'id, code, name, category, quantity, available_quantity, unit, location, min_quantity, expiry_date, ' +
  'formula, name_ar, danger_level, supplier, invoice_no, owner_no, purchase_date, cost, deleted_at, created_at, ' +
  '(SELECT GROUP_CONCAT(alias, \'|\') FROM item_aliases a WHERE a.inventory_id = inventory.id) AS aliases_text';

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
    where.push('(name LIKE ? OR code LIKE ? OR location LIKE ? OR owner_no LIKE ?)');
    const like = `%${filters.q.trim()}%`;
    params.push(like, like, like, like);
  }
  if (filters.category) {
    where.push('category = ?');
    params.push(filters.category);
  }
  if (filters.lowStock) where.push('min_quantity > 0 AND available_quantity <= min_quantity');

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

/** صنف نشط يحمل نفس رقم الجرد الخاص (لمنع التكرار). */
export function findByOwnerNo(ownerNo: string, excludeId = 0): InventoryItem | undefined {
  const clean = String(ownerNo ?? '').trim();
  if (!clean) return undefined;
  return oneRow<InventoryItem>(
    `SELECT ${COLUMNS} FROM inventory
     WHERE deleted_at IS NULL AND id != ? AND owner_no = ? COLLATE NOCASE
     LIMIT 1`,
    excludeId,
    clean,
  );
}

export function createInventory(input: InventoryInput): InventoryItem {
  const { lastInsertRowid } = run(
    `INSERT INTO inventory (code, name, category, quantity, available_quantity, unit, location, min_quantity, expiry_date,
       formula, name_ar, danger_level, supplier, invoice_no, owner_no, purchase_date, cost)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.code.trim(),
    input.name.trim(),
    input.category,
    input.quantity,
    input.quantity,
    input.unit ?? 'قطعة',
    input.location ?? null,
    input.min_quantity ?? (input.quantity > 1 ? 1 : 0),
    input.expiry_date ?? null,
    input.formula ?? null,
    input.name_ar ?? null,
    input.danger_level ?? null,
    input.supplier ?? null,
    input.invoice_no ?? null,
    cleanOwnerNo(input.owner_no),
    input.purchase_date ?? null,
    input.cost ?? null,
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
       unit = ?, location = ?, min_quantity = ?, expiry_date = ?,
       formula = ?, name_ar = ?, danger_level = ?, supplier = ?, invoice_no = ?, owner_no = ?, purchase_date = ?, cost = ? WHERE id = ?`,
    input.code ?? current.code,
    input.name ?? current.name,
    input.category ?? current.category,
    quantity,
    nextAvailable,
    input.unit ?? current.unit,
    input.location === undefined ? current.location : input.location,
    input.min_quantity ?? current.min_quantity,
    input.expiry_date === undefined ? current.expiry_date : input.expiry_date,
    input.formula === undefined ? current.formula : input.formula,
    input.name_ar === undefined ? current.name_ar : input.name_ar,
    input.danger_level === undefined ? current.danger_level : input.danger_level,
    input.supplier === undefined ? current.supplier : input.supplier,
    input.invoice_no === undefined ? current.invoice_no : input.invoice_no,
    cleanOwnerNo(input.owner_no, current.owner_no),
    input.purchase_date === undefined ? current.purchase_date : input.purchase_date,
    input.cost === undefined ? current.cost : input.cost,
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

/**
 * أصناف تحتاج إعادة طلب: حد أدنى مضبوط يدوياً (min_quantity > 0) ووصل المتوفر إليه.
 * الصنف الوحيد (min_quantity = 0) لا يُنبّه لأنه لا يُعاد شراؤه بالكمية.
 */
export function lowStockItems(): InventoryItem[] {
  return allRows<InventoryItem>(
    `SELECT ${COLUMNS} FROM inventory
     WHERE deleted_at IS NULL AND min_quantity > 0 AND available_quantity <= min_quantity
     ORDER BY available_quantity ASC`,
  );
}

/** مرادفات الصنف كما ترد في تقارير الإعارة. */
export function getAliases(inventoryId: number): string[] {
  return allRows<{ alias: string }>(
    'SELECT alias FROM item_aliases WHERE inventory_id = ? ORDER BY alias',
    inventoryId,
  ).map((row) => row.alias);
}

/** استبدال مرادفات الصنف بقائمة جديدة (ينظّف الفراغات ويكرّر الحذف). */
export function setAliases(inventoryId: number, aliases: string[]): string[] {
  const cleaned = [...new Set(aliases.map((alias) => alias.trim()).filter(Boolean))].slice(0, 40);
  db.exec('BEGIN');
  try {
    run('DELETE FROM item_aliases WHERE inventory_id = ?', inventoryId);
    for (const alias of cleaned) {
      run('INSERT OR IGNORE INTO item_aliases (inventory_id, alias) VALUES (?, ?)', inventoryId, alias.slice(0, 80));
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getAliases(inventoryId);
}

/** أصناف غير متوفرة حالياً (كل الكمية معارة أو تالفة أو غير مقتناة). */
export function outOfStockItems(): InventoryItem[] {
  return allRows<InventoryItem>(
    `SELECT ${COLUMNS} FROM inventory
     WHERE deleted_at IS NULL AND available_quantity <= 0
     ORDER BY quantity ASC, name ASC`,
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
  outOfStock: number;
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
    outOfStock: outOfStockItems().length,
    expiring: expiringItems().length,
    deleted: countDeleted(),
  };
}
