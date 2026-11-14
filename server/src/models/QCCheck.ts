import { allRows, oneRow, run } from '../db.ts';

export type QCStatus = 'ok' | 'low' | 'expired' | 'damaged';

export type QCCheck = {
  id: number;
  inventory_id: number;
  check_date: string;
  status: QCStatus;
  quantity_found: number;
  notes: string | null;
  created_at: string;
};

export type QCCheckView = QCCheck & { name: string; code: string; category: string };

export function createCheck(data: {
  inventory_id: number;
  check_date?: string;
  status: QCStatus;
  quantity_found: number;
  notes?: string | null;
}): number {
  const { lastInsertRowid } = run(
    `INSERT INTO qc_checks (inventory_id, check_date, status, quantity_found, notes)
     VALUES (?, ?, ?, ?, ?)`,
    data.inventory_id,
    data.check_date ?? new Date().toISOString().slice(0, 10),
    data.status,
    data.quantity_found,
    data.notes ?? null,
  );
  return lastInsertRowid;
}

export function getCheck(id: number): QCCheck | undefined {
  return oneRow<QCCheck>('SELECT * FROM qc_checks WHERE id = ?', id);
}

/** تعديل سجل فحص قائم (النتيجة/الكمية/التاريخ/الملاحظات). */
export function updateCheck(
  id: number,
  data: { status: QCStatus; quantity_found: number; check_date?: string; notes?: string | null },
): QCCheckView | undefined {
  run(
    `UPDATE qc_checks SET status = ?, quantity_found = ?, notes = ?,
       check_date = COALESCE(?, check_date) WHERE id = ?`,
    data.status,
    data.quantity_found,
    data.notes ?? null,
    data.check_date ?? null,
    id,
  );
  return listChecks({}).find((row) => row.id === id);
}

export function listChecks(filters: { inventory_id?: number; from?: string; to?: string } = {}): QCCheckView[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filters.inventory_id) {
    where.push('q.inventory_id = ?');
    params.push(filters.inventory_id);
  }
  if (filters.from) {
    where.push('q.check_date >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    where.push('q.check_date <= ?');
    params.push(filters.to);
  }
  return allRows<QCCheckView>(
    `SELECT q.*, inv.name, inv.code, inv.category
     FROM qc_checks q JOIN inventory inv ON inv.id = q.inventory_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY q.check_date DESC, q.id DESC LIMIT 200`,
    ...params,
  );
}

export function statusBreakdown(): { status: QCStatus; total: number }[] {
  return allRows<{ status: QCStatus; total: number }>(
    'SELECT status, COUNT(*) AS total FROM qc_checks GROUP BY status',
  );
}

/** اتجاه الفحوصات خلال آخر 14 يوماً. */
export function trend(days = 14): { check_date: string; ok: number; issues: number }[] {
  return allRows<{ check_date: string; ok: number; issues: number }>(
    `SELECT check_date,
       SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS ok,
       SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) AS issues
     FROM qc_checks
     WHERE check_date >= date('now', ?)
     GROUP BY check_date ORDER BY check_date`,
    `-${days} days`,
  );
}

export function countChecksToday(): number {
  const row = oneRow<{ total: number }>(
    "SELECT COUNT(*) AS total FROM qc_checks WHERE check_date = date('now')",
  );
  return row?.total ?? 0;
}
