#!/usr/bin/env node
/**
 * تحديث قاعدة بيانات تطبيق المكتب المثبّت دون المساس ببياناته:
 *  - إضافة عمود users.specialty وضبط تخصصات الأساتذة.
 *  - نسخ جلسات الإعارة (تقريرا الأسبوع 02 و03) من قاعدة بيانات المشروع.
 * يُنشئ نسخة احتياطية قبل أي تعديل.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { linkBorrowingItems } from './lib/link-borrowing-items.mjs';

const INSTALL_DATA = process.argv[2] ?? 'C:/Program Files/Amin-Lab Genie/data';
const PROD_DB = join(INSTALL_DATA, 'amin-lab-genie.sqlite');
const DEV_DB = 'data/amin-lab-genie.sqlite';

if (!existsSync(PROD_DB)) {
  console.error('قاعدة بيانات التطبيق غير موجودة:', PROD_DB);
  process.exit(1);
}

mkdirSync(join(INSTALL_DATA, 'backups'), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = join(INSTALL_DATA, 'backups', `pre-update-${stamp}.sqlite`);

const prod = new DatabaseSync(PROD_DB);
prod.exec(`PRAGMA busy_timeout = 8000;`);
prod.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
console.log('نسخة احتياطية:', backupPath);

// 1) عمود التخصص
const userColumns = prod.prepare('PRAGMA table_info(users)').all().map((row) => row.name);
if (!userColumns.includes('specialty')) {
  prod.exec('ALTER TABLE users ADD COLUMN specialty TEXT');
  console.log('إضافة users.specialty');
}

const PHYSICS = ['إزيان سهام', 'منصوري فتيحة', 'عمارة أسماء', 'مجاهدي فضيلة'];
const NATURAL = ['سلاف فاطمة', 'عنان ليلى', 'علي ثاني أسماء', 'عراب نزيهة'];

const prodUsers = prod.prepare('SELECT id, full_name FROM users').all();
const setSpecialty = prod.prepare('UPDATE users SET specialty = ? WHERE id = ?');
for (const user of prodUsers) {
  if (PHYSICS.includes(user.full_name)) setSpecialty.run('physics', user.id);
  else if (NATURAL.includes(user.full_name)) setSpecialty.run('natural', user.id);
}
console.log('تخصصات الأساتذة:', prod.prepare('SELECT full_name, specialty FROM users WHERE role = \'teacher\' ORDER BY id').all());

// 2) جلسات الإعارة من قاعدة بيانات المشروع
const dev = new DatabaseSync(DEV_DB, { readOnly: true });
const devRooms = new Map(dev.prepare('SELECT id, name FROM lab_rooms').all().map((row) => [row.id, row.name]));
const prodRooms = new Map(prod.prepare('SELECT id, name FROM lab_rooms').all().map((row) => [row.name, row.id]));
const prodByName = new Map(prodUsers.map((row) => [row.full_name, row.id]));

const sessions = dev
  .prepare(
    `SELECT s.*, u.full_name AS teacher_name
     FROM borrowing_sessions s JOIN users u ON u.id = s.teacher_id
     ORDER BY s.id`,
  )
  .all();

const exists = prod.prepare(
  'SELECT 1 FROM borrowing_sessions WHERE teacher_id = ? AND session_date = ? AND start_time = ?',
);
const insert = prod.prepare(
  `INSERT INTO borrowing_sessions
     (teacher_id, room_id, level, class_name, subject, session_date, start_time, end_time, due_date, status, notes)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

let inserted = 0;
let skipped = 0;
prod.exec('BEGIN');
try {
  for (const row of sessions) {
    const teacherId = prodByName.get(row.teacher_name);
    if (!teacherId) {
      console.log('أستاذ غير موجود في التطبيق:', row.teacher_name);
      skipped += 1;
      continue;
    }
    if (exists.get(teacherId, row.session_date, row.start_time)) {
      skipped += 1;
      continue;
    }
    const roomName = devRooms.get(row.room_id);
    const roomId = roomName ? prodRooms.get(roomName) ?? null : null;
    insert.run(
      teacherId,
      roomId,
      row.level ?? null,
      row.class_name,
      row.subject,
      row.session_date,
      row.start_time,
      row.end_time,
      row.due_date ?? null,
      row.status,
      row.notes ?? null,
    );
    inserted += 1;
  }
  prod.exec('COMMIT');
} catch (error) {
  prod.exec('ROLLBACK');
  throw error;
}

console.log(`جلسات مُضافة: ${inserted} · متجاهلة/مكررة: ${skipped}`);
console.log('إجمالي جلسات الإعارة:', prod.prepare('SELECT COUNT(*) AS c FROM borrowing_sessions').get().c);

// ربط وسائل الجلسات بأصناف الجرد تلقائياً حتى لا تظهر جلسات بوحدات صفر في التقارير.
const link = linkBorrowingItems(prod);
console.log(
  `ربط الوسائل: ${link.linkedSessions} جلسة · ${link.addedLines} سطر` +
    (link.skipped.length ? ` · بلا صنف: ${link.skipped.join('، ')}` : ''),
);
console.log(
  'جلسات بلا أصناف:',
  prod
    .prepare(
      'SELECT COUNT(*) AS c FROM borrowing_sessions s WHERE NOT EXISTS (SELECT 1 FROM borrowing_items i WHERE i.session_id = s.id)',
    )
    .get().c,
);
console.log('توزيع الإعارات:');
for (const row of prod
  .prepare(
    `SELECT u.full_name, COUNT(*) AS total FROM borrowing_sessions s
     JOIN users u ON u.id = s.teacher_id GROUP BY u.full_name ORDER BY total DESC`,
  )
  .all()) {
  console.log(` - ${row.full_name}: ${row.total}`);
}

dev.close();
prod.close();
