import { allRows, oneRow, run } from '../db.ts';

export type Schedule = {
  id: number;
  teacher_id: number;
  room_id: number | null;
  class_name: string;
  subject: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  status: 'scheduled' | 'done' | 'cancelled';
  created_at: string;
};

export type ScheduleRow = Schedule & { teacher_name: string; room_name: string | null };

export function listSchedule(filters: { day_of_week?: number; room_id?: number } = {}): ScheduleRow[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (typeof filters.day_of_week === 'number') {
    where.push('sc.day_of_week = ?');
    params.push(filters.day_of_week);
  }
  if (filters.room_id) {
    where.push('sc.room_id = ?');
    params.push(filters.room_id);
  }
  return allRows<ScheduleRow>(
    `SELECT sc.*, u.full_name AS teacher_name, r.name AS room_name
     FROM schedules sc JOIN users u ON u.id = sc.teacher_id
     LEFT JOIN lab_rooms r ON r.id = sc.room_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY sc.day_of_week, sc.start_time`,
    ...params,
  );
}

export function createSchedule(data: {
  teacher_id: number;
  room_id: number | null;
  class_name: string;
  subject: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  status?: 'scheduled' | 'done' | 'cancelled';
}): number {
  const { lastInsertRowid } = run(
    `INSERT INTO schedules (teacher_id, room_id, class_name, subject, day_of_week, start_time, end_time, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    data.teacher_id,
    data.room_id,
    data.class_name.trim(),
    data.subject.trim(),
    data.day_of_week,
    data.start_time,
    data.end_time,
    data.status ?? 'scheduled',
  );
  return lastInsertRowid;
}

export function findTeacherConflict(
  teacherId: number,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  excludeId?: number,
): Schedule | undefined {
  return oneRow<Schedule>(
    `SELECT * FROM schedules WHERE teacher_id = ? AND day_of_week = ?
     AND start_time < ? AND end_time > ? AND id != ?`,
    teacherId,
    dayOfWeek,
    endTime,
    startTime,
    excludeId ?? -1,
  );
}

export function findConflict(
  roomId: number | null,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  excludeId?: number,
): Schedule | undefined {
  if (!roomId) return undefined;
  return oneRow<Schedule>(
    `SELECT * FROM schedules WHERE room_id = ? AND day_of_week = ?
     AND start_time < ? AND end_time > ? AND id != ?`,
    roomId,
    dayOfWeek,
    endTime,
    startTime,
    excludeId ?? -1,
  );
}

export function getSchedule(id: number): Schedule | undefined {
  return oneRow<Schedule>('SELECT * FROM schedules WHERE id = ?', id);
}

export function updateSchedule(
  id: number,
  data: {
    room_id: number | null;
    class_name: string;
    subject: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    teacher_id?: number;
    status?: 'scheduled' | 'done' | 'cancelled';
  },
): boolean {
  return (
    run(
      `UPDATE schedules SET room_id = ?, class_name = ?, subject = ?, day_of_week = ?,
         start_time = ?, end_time = ?, teacher_id = COALESCE(?, teacher_id), status = COALESCE(?, status) WHERE id = ?`,
      data.room_id,
      data.class_name.trim(),
      data.subject.trim(),
      data.day_of_week,
      data.start_time,
      data.end_time,
      data.teacher_id ?? null,
      data.status ?? null,
      id,
    ).changes > 0
  );
}

export function deleteSchedule(id: number): boolean {
  return run('DELETE FROM schedules WHERE id = ?', id).changes > 0;
}

export function clearSchedule(): number {
  return run('DELETE FROM schedules').changes;
}

export function scheduleById(id: number): ScheduleRow | undefined {
  return listSchedule().find((row) => row.id === id);
}
