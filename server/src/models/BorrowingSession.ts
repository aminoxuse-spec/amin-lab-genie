import { allRows, oneRow, run } from '../db.ts';

export type SessionStatus = 'open' | 'partial' | 'returned';

export type BorrowingSession = {
  id: number;
  teacher_id: number;
  room_id: number | null;
  level: string | null;
  class_name: string;
  subject: string;
  session_date: string;
  start_time: string;
  end_time: string;
  due_date: string | null;
  status: SessionStatus;
  notes: string | null;
  created_at: string;
};

export type BorrowingSessionRow = BorrowingSession & {
  teacher_name: string;
  room_name: string | null;
  item_count: number;
  units_out: number;
  units_returned: number;
};

const SELECT_WITH_JOINS = `
  SELECT s.id, s.teacher_id, s.room_id, s.level, s.class_name, s.subject, s.session_date, s.start_time,
         s.end_time, s.due_date, s.status, s.notes, s.created_at,
         u.full_name AS teacher_name, r.name AS room_name,
         (SELECT COUNT(*) FROM borrowing_items i WHERE i.session_id = s.id) AS item_count,
         (SELECT COALESCE(SUM(quantity_out), 0) FROM borrowing_items i WHERE i.session_id = s.id) AS units_out,
         (SELECT COALESCE(SUM(quantity_returned), 0) FROM borrowing_items i WHERE i.session_id = s.id) AS units_returned
  FROM borrowing_sessions s
  JOIN users u ON u.id = s.teacher_id
  LEFT JOIN lab_rooms r ON r.id = s.room_id`;

export function createSession(data: {
  teacher_id: number;
  room_id: number | null;
  level?: string | null;
  class_name: string;
  subject: string;
  session_date: string;
  start_time: string;
  end_time: string;
  due_date?: string | null;
  notes?: string | null;
}): number {
  const { lastInsertRowid } = run(
    `INSERT INTO borrowing_sessions (teacher_id, room_id, level, class_name, subject, session_date, start_time, end_time, due_date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    data.teacher_id,
    data.room_id,
    data.level ?? null,
    data.class_name.trim(),
    data.subject.trim(),
    data.session_date,
    data.start_time,
    data.end_time,
    data.due_date ?? null,
    data.notes ?? null,
  );
  return lastInsertRowid;
}

export function getSession(id: number): BorrowingSessionRow | undefined {
  return oneRow<BorrowingSessionRow>(`${SELECT_WITH_JOINS} WHERE s.id = ?`, id);
}

export function listSessions(filters: {
  status?: SessionStatus;
  teacher_id?: number;
  date?: string;
} = {}): BorrowingSessionRow[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filters.status) {
    where.push('s.status = ?');
    params.push(filters.status);
  }
  if (filters.teacher_id) {
    where.push('s.teacher_id = ?');
    params.push(filters.teacher_id);
  }
  if (filters.date) {
    where.push('s.session_date = ?');
    params.push(filters.date);
  }
  const sql = `${SELECT_WITH_JOINS}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
    ORDER BY s.session_date DESC, s.start_time DESC LIMIT 200`;
  return allRows<BorrowingSessionRow>(sql, ...params);
}

export function sessionsBetween(start: string, end: string): BorrowingSessionRow[] {
  return allRows<BorrowingSessionRow>(
    `${SELECT_WITH_JOINS} WHERE s.session_date BETWEEN ? AND ? ORDER BY s.session_date, s.start_time`,
    start,
    end,
  );
}

export function setStatus(id: number, status: SessionStatus): void {
  run('UPDATE borrowing_sessions SET status = ? WHERE id = ?', status, id);
}

export function deleteSession(id: number): boolean {
  return run('DELETE FROM borrowing_sessions WHERE id = ?', id).changes > 0;
}

/** إعارات لم تُرجع في موعدها: لم تُغلق وبقي متبقٍّ بعد تاريخ/ساعة الحصة. */
/** تعديل بيانات الإعارة (العناصر تُدار عبر الإرجاع فقط). */
export function updateSession(
  id: number,
  data: {
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
  },
): boolean {
  return (
    run(
      `UPDATE borrowing_sessions SET level = ?, class_name = ?, subject = ?, session_date = ?,
         start_time = ?, end_time = ?, due_date = ?, notes = ?, room_id = ?,
         teacher_id = COALESCE(?, teacher_id) WHERE id = ?`,
      data.level ?? null,
      data.class_name.trim(),
      data.subject.trim(),
      data.session_date,
      data.start_time,
      data.end_time,
      data.due_date ?? null,
      data.notes ?? null,
      data.room_id ?? null,
      data.teacher_id ?? null,
      id,
    ).changes > 0
  );
}

export function lateSessions(limit = 200): BorrowingSessionRow[] {
  return allRows<BorrowingSessionRow>(
    `${SELECT_WITH_JOINS}
     WHERE s.status != 'returned'
       AND EXISTS (
         SELECT 1 FROM borrowing_items i
         WHERE i.session_id = s.id AND i.condition_out != 'consumed' AND i.quantity_returned < i.quantity_out
       )
       AND datetime(COALESCE(s.due_date, s.session_date) || ' ' || s.end_time) < datetime('now', 'localtime')
     ORDER BY s.session_date ASC, s.start_time ASC LIMIT ?`,
    limit,
  );
}

export function countOpenSessions(): number {
  const row = oneRow<{ total: number }>(
    "SELECT COUNT(*) AS total FROM borrowing_sessions WHERE status != 'returned'",
  );
  return row?.total ?? 0;
}
