import { allRows, oneRow, run, transaction } from '../db.ts';

export type LabRoom = {
  id: number;
  name: string;
  capacity: number;
  location: string | null;
};

export function listRooms(): LabRoom[] {
  return allRows<LabRoom>('SELECT * FROM lab_rooms ORDER BY name');
}

export function getRoom(id: number): LabRoom | undefined {
  return oneRow<LabRoom>('SELECT * FROM lab_rooms WHERE id = ?', id);
}

export function createRoom(data: { name: string; capacity?: number; location?: string | null }): LabRoom {
  const { lastInsertRowid } = run(
    'INSERT INTO lab_rooms (name, capacity, location) VALUES (?, ?, ?)',
    data.name.trim(),
    data.capacity ?? 24,
    data.location ?? null,
  );
  return getRoom(lastInsertRowid) as LabRoom;
}

export function updateRoom(
  id: number,
  data: { name: string; capacity?: number; location?: string | null },
): LabRoom | undefined {
  const { changes } = run(
    'UPDATE lab_rooms SET name = ?, capacity = ?, location = ? WHERE id = ?',
    data.name.trim(),
    data.capacity ?? 24,
    data.location ?? null,
    id,
  );
  return changes > 0 ? getRoom(id) : undefined;
}

export function deleteRoom(id: number): boolean {
  return transaction(() => {
    // القاعة قد تكون مستعملة في حصص أو إعارات: نفصل المراجع ثم نحذف القاعة.
    run('UPDATE schedules SET room_id = NULL WHERE room_id = ?', id);
    run('UPDATE borrowing_sessions SET room_id = NULL WHERE room_id = ?', id);
    return run('DELETE FROM lab_rooms WHERE id = ?', id).changes > 0;
  });
}

export function countRooms(): number {
  const row = oneRow<{ total: number }>('SELECT COUNT(*) AS total FROM lab_rooms');
  return row?.total ?? 0;
}
