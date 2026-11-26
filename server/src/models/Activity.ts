import { allRows, run } from '../db.ts';

export type ActivityRow = {
  id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  details: string | null;
  created_at: string;
};

export function logActivity(user: { id?: number; username?: string } | undefined, action: string, details?: string): void {
  try {
    run(
      'INSERT INTO activity_log (user_id, username, action, details) VALUES (?, ?, ?, ?)',
      user?.id ?? null,
      user?.username ?? null,
      action,
      details ?? null,
    );
  } catch {
    // سجل النشاط لا يجب أن يفشل العملية الأصلية
  }
}

export function listActivity(limit = 100): ActivityRow[] {
  return allRows<ActivityRow>(
    'SELECT id, user_id, username, action, details, created_at FROM activity_log ORDER BY id DESC LIMIT ?',
    limit,
  );
}

export function clearActivity(): void {
  run('DELETE FROM activity_log');
}
