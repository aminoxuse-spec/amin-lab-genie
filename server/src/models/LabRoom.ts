import { allRows, oneRow, run } from '../db.ts';

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

export function countRooms(): number {
  const row = oneRow<{ total: number }>('SELECT COUNT(*) AS total FROM lab_rooms');
  return row?.total ?? 0;
}
