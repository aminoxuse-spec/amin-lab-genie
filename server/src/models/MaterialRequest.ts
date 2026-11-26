import { allRows, oneRow, run } from '../db.ts';

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type RequestItemView = {
  id: number;
  inventory_id: number;
  quantity: number;
  name: string;
  owner_no: string | null;
  unit: string;
  category: string;
  available_quantity: number;
};

export type MaterialRequestView = {
  id: number;
  teacher_id: number;
  teacher_name: string;
  session_date: string;
  start_time: string;
  end_time: string;
  class_name: string;
  subject: string;
  notes: string | null;
  status: RequestStatus;
  admin_note: string | null;
  session_id: number | null;
  decided_at: string | null;
  created_at: string;
  items: RequestItemView[];
};

const SELECT = `
  SELECT r.*, u.full_name AS teacher_name
  FROM material_requests r JOIN users u ON u.id = r.teacher_id`;

export function createRequest(
  data: {
    teacher_id: number;
    session_date: string;
    start_time: string;
    end_time: string;
    class_name: string;
    subject: string;
    notes?: string | null;
  },
  items: { inventory_id: number; quantity: number }[],
): number {
  return run(
    `INSERT INTO material_requests
       (teacher_id, session_date, start_time, end_time, class_name, subject, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    data.teacher_id,
    data.session_date,
    data.start_time,
    data.end_time,
    data.class_name.trim(),
    data.subject.trim(),
    data.notes ?? null,
  ).lastInsertRowid;
}

export function addRequestItem(requestId: number, inventoryId: number, quantity: number): void {
  run(
    'INSERT INTO material_request_items (request_id, inventory_id, quantity) VALUES (?, ?, ?)',
    requestId,
    inventoryId,
    quantity,
  );
}

export function requestItems(requestId: number): RequestItemView[] {
  return allRows<RequestItemView>(
    `SELECT i.id, i.inventory_id, i.quantity, inv.name, inv.name_ar, inv.owner_no, inv.unit, inv.category, inv.available_quantity
     FROM material_request_items i JOIN inventory inv ON inv.id = i.inventory_id
     WHERE i.request_id = ? ORDER BY i.id`,
    requestId,
  );
}

export function getRequest(id: number): MaterialRequestView | undefined {
  const row = oneRow<Omit<MaterialRequestView, 'items'>>(`${SELECT} WHERE r.id = ?`, id);
  return row ? { ...row, items: requestItems(id) } : undefined;
}

export function listRequests(filters: { teacherId?: number; status?: RequestStatus; limit?: number } = {}): MaterialRequestView[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filters.teacherId) {
    where.push('r.teacher_id = ?');
    params.push(filters.teacherId);
  }
  if (filters.status) {
    where.push('r.status = ?');
    params.push(filters.status);
  }
  const sql = `${SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
    ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC
    LIMIT ?`;
  const rows = allRows<Omit<MaterialRequestView, 'items'>>(sql, ...params, filters.limit ?? 200);
  return rows.map((row) => ({ ...row, items: requestItems(row.id) }));
}

export function pendingCount(teacherId?: number): number {
  const row = teacherId
    ? oneRow<{ c: number }>("SELECT COUNT(*) AS c FROM material_requests WHERE status = 'pending' AND teacher_id = ?", teacherId)
    : oneRow<{ c: number }>("SELECT COUNT(*) AS c FROM material_requests WHERE status = 'pending'");
  return row?.c ?? 0;
}

export function decide(
  id: number,
  data: { status: RequestStatus; decidedBy: number; adminNote?: string | null; sessionId?: number | null },
): void {
  run(
    `UPDATE material_requests
     SET status = ?, admin_note = ?, session_id = ?, decided_by = ?, decided_at = datetime('now')
     WHERE id = ?`,
    data.status,
    data.adminNote ?? null,
    data.sessionId ?? null,
    data.decidedBy,
    id,
  );
}
