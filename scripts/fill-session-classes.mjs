#!/usr/bin/env node
/**
 * تعبئة القسم والمستوى في جلسات الإعارة من استعمال الزمن.
 * يطابق (الأستاذ + يوم الأسبوع + ساعة البداية)، ويفضّل القاعة نفسها عند التعدد.
 * آمن عند إعادة التشغيل: لا يغيّر جلسة لها قسم فعلي.
 *
 * الاستخدام: node scripts/fill-session-classes.mjs "<مسار قاعدة البيانات>" [--dry-run]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { levelOf } from '../server/src/services/itemMatcher.ts';

const DB_PATH = process.argv[2];
const DRY = process.argv.includes('--dry-run');
if (!DB_PATH || !existsSync(DB_PATH)) {
  console.error('الاستخدام: node scripts/fill-session-classes.mjs "<مسار قاعدة البيانات>" [--dry-run]');
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout = 8000;');

const scheduleColumns = db.prepare('PRAGMA table_info(schedules)').all().map((col) => col.name);
if (!scheduleColumns.includes('class_name')) {
  console.log('لا يوجد جدول استعمال زمن به عمود القسم في:', DB_PATH);
  process.exit(0);
}

const sessions = db
  .prepare(
    `SELECT id, teacher_id, room_id, session_date, start_time, end_time, class_name, level
     FROM borrowing_sessions
     WHERE teacher_id IS NOT NULL AND (class_name IS NULL OR class_name IN ('', 'حصة') OR level IS NULL)
     ORDER BY session_date, start_time`,
  )
  .all();

const candidates = db.prepare(
  `SELECT class_name, room_id, start_time, end_time FROM schedules
   WHERE teacher_id = ? AND day_of_week = ? AND start_time = ?
   ORDER BY class_name`,
);
// محاولة ثانية: الجلسة تقع داخل حصة مجدولة (ساعة البداية المكتوبة في التقرير قد تختلف قليلاً).
const containing = db.prepare(
  `SELECT class_name, room_id, start_time, end_time FROM schedules
   WHERE teacher_id = ? AND day_of_week = ? AND start_time <= ? AND end_time > ?
   ORDER BY start_time DESC`,
);
const update = db.prepare('UPDATE borrowing_sessions SET class_name = ?, level = ? WHERE id = ?');

/** يوم الأسبوع بصيغة استعمال الزمن: 0 = الأحد (نفس getUTCDay). */
function dayOfWeek(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

let filled = 0;
let insideSlot = 0;
const unresolved = [];
const distribution = new Map();

db.exec('BEGIN');
try {
  for (const session of sessions) {
    const dow = dayOfWeek(session.session_date);
    let rows = candidates.all(session.teacher_id, dow, session.start_time);
    if (!rows.length) {
      rows = containing.all(session.teacher_id, dow, session.start_time, session.start_time);
      if (rows.length) insideSlot += 1;
    }
    if (!rows.length) {
      unresolved.push(session);
      continue;
    }
    if (rows.length > 1) {
      const sameRoom = rows.filter((row) => row.room_id === session.room_id);
      const sameEnd = (sameRoom.length ? sameRoom : rows).filter((row) => row.end_time === session.end_time);
      rows = sameEnd.length ? sameEnd : sameRoom.length ? sameRoom : rows;
    }
    const chosen = rows[0];
    const level = levelOf(chosen.class_name);
    if (!DRY) update.run(chosen.class_name, level, session.id);
    filled += 1;
    distribution.set(level ?? '—', (distribution.get(level ?? '—') ?? 0) + 1);
  }
  db.exec(DRY ? 'ROLLBACK' : 'COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

console.log(`قاعدة البيانات: ${DB_PATH}${DRY ? ' (تجريبي)' : ''}`);
console.log(`جلسات محدّثة: ${filled} / ${sessions.length} (منها ${insideSlot} بمطابقة وقت داخلي)`);
for (const [level, count] of [...distribution.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${level}: ${count}`);
}
if (unresolved.length) {
  console.log(`بلا مطابقة في استعمال الزمن: ${unresolved.length}`);
  for (const session of unresolved.slice(0, 10)) {
    console.log(`  #${session.id} ${session.session_date} ${session.start_time} أستاذ ${session.teacher_id}`);
  }
}
console.log(
  'إجمالي الأقسام المعبأة:',
  db.prepare("SELECT COUNT(*) c FROM borrowing_sessions WHERE class_name NOT IN ('', 'حصة')").get().c,
);
db.close();
