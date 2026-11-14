import type { Request, Response } from 'express';
import {
  createSchedule,
  deleteSchedule,
  findConflict,
  getSchedule,
  listSchedule,
  scheduleById,
  updateSchedule,
} from '../models/Schedule.ts';
import { createRoom, listRooms } from '../models/LabRoom.ts';
import type { AuthedRequest } from '../middleware/auth.ts';
import { HttpError, parseId } from '../middleware/validation.ts';

export function list(req: Request, res: Response): void {
  const day = typeof req.query.day === 'string' ? Number(req.query.day) : undefined;
  const roomId = typeof req.query.room_id === 'string' ? Number(req.query.room_id) : undefined;
  res.json({
    schedule: listSchedule({
      day_of_week: Number.isInteger(day) ? day : undefined,
      room_id: Number.isInteger(roomId) ? roomId : undefined,
    }),
  });
}

export function create(req: Request, res: Response): void {
  const body = req.body as {
    teacher_id?: number;
    room_id?: number | null;
    class_name: string;
    subject: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
  };
  const currentUser = (req as AuthedRequest).currentUser;
  if (!currentUser) throw new HttpError(401, 'يجب تسجيل الدخول');

  if (body.start_time >= body.end_time) {
    throw new HttpError(400, 'وقت البداية يجب أن يسبق وقت النهاية');
  }
  const roomId = body.room_id ? Number(body.room_id) : null;
  if (findConflict(roomId, Number(body.day_of_week), body.start_time, body.end_time)) {
    throw new HttpError(409, 'توجد حصة أخرى في نفس القاعة خلال هذه الفترة');
  }

  const id = createSchedule({
    teacher_id: currentUser.role === 'admin' && body.teacher_id ? body.teacher_id : currentUser.id,
    room_id: roomId,
    class_name: body.class_name,
    subject: body.subject,
    day_of_week: Number(body.day_of_week),
    start_time: body.start_time,
    end_time: body.end_time,
  });
  res.status(201).json({ id, schedule: listSchedule().find((row) => row.id === id) });
}

export function update(req: Request, res: Response): void {
  const id = parseId(req.params.id);
  const existing = getSchedule(id);
  if (!existing) throw new HttpError(404, 'الحصة غير موجودة');

  const body = req.body as {
    teacher_id?: number;
    room_id?: number | null;
    class_name: string;
    subject: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
  };
  const currentUser = (req as AuthedRequest).currentUser;
  if (!currentUser) throw new HttpError(401, 'يجب تسجيل الدخول');
  if (currentUser.role !== 'admin' && existing.teacher_id !== currentUser.id) {
    throw new HttpError(403, 'لا يمكنك تعديل حصة أستاذ آخر');
  }
  if (body.start_time >= body.end_time) {
    throw new HttpError(400, 'وقت البداية يجب أن يسبق وقت النهاية');
  }
  const roomId = body.room_id ? Number(body.room_id) : null;
  if (findConflict(roomId, Number(body.day_of_week), body.start_time, body.end_time, id)) {
    throw new HttpError(409, 'توجد حصة أخرى في نفس القاعة خلال هذه الفترة');
  }

  updateSchedule(id, {
    room_id: roomId,
    class_name: body.class_name,
    subject: body.subject,
    day_of_week: Number(body.day_of_week),
    start_time: body.start_time,
    end_time: body.end_time,
    teacher_id: currentUser.role === 'admin' && body.teacher_id ? Number(body.teacher_id) : undefined,
  });
  res.json({ schedule: scheduleById(id) });
}

export function remove(req: Request, res: Response): void {
  const id = parseId(req.params.id);
  if (!deleteSchedule(id)) {
    res.status(404).json({ error: 'الحصة غير موجودة' });
    return;
  }
  res.json({ ok: true });
}

export function rooms(_req: Request, res: Response): void {
  res.json({ rooms: listRooms() });
}

export function addRoom(req: Request, res: Response): void {
  const body = req.body as { name: string; capacity?: number; location?: string | null };
  const room = createRoom(body);
  res.status(201).json({ room });
}
