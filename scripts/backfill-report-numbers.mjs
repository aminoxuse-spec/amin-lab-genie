#!/usr/bin/env node
/**
 * تعبئة رقم التقرير الأسبوعي (report_no) للجلسات المستوردة.
 * الترقيم يبدأ من 02 (أول تقرير مستورد) ويتقدّم مع كل أسبوع (الأحد → السبت).
 *
 * الاستخدام: node scripts/backfill-report-numbers.mjs "<مسار قاعدة البيانات>"
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const DB_PATH = process.argv[2];
if (!DB_PATH || !existsSync(DB_PATH)) {
  console.error('الاستخدام: node scripts/backfill-report-numbers.mjs "<مسار قاعدة البيانات>"');
  process.exit(1);
}

const FIRST_REPORT_NO = 2;
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout = 8000;');

const columns = db.prepare('PRAGMA table_info(borrowing_sessions)').all().map((col) => col.name);
if (!columns.includes('report_no')) db.exec('ALTER TABLE borrowing_sessions ADD COLUMN report_no TEXT');

const sessions = db
  .prepare("SELECT id, session_date FROM borrowing_sessions WHERE report_no IS NULL OR report_no = '' ORDER BY session_date")
  .all();
const earliest = db.prepare('SELECT MIN(session_date) AS first FROM borrowing_sessions').get()?.first;
if (!earliest) {
  console.log('لا توجد جلسات لترقيمها.');
  process.exit(0);
}

const anchor = new Date(`${earliest}T00:00:00Z`);
anchor.setUTCDate(anchor.getUTCDate() - anchor.getUTCDay()); // الأحد الأول
const WEEK_MS = 7 * 24 * 3600 * 1000;

const update = db.prepare('UPDATE borrowing_sessions SET report_no = ? WHERE id = ?');
let updated = 0;
const distribution = new Map();

db.exec('BEGIN');
try {
  for (const session of sessions) {
    const date = new Date(`${session.session_date}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - date.getUTCDay());
    const weekIndex = Math.round((date.getTime() - anchor.getTime()) / WEEK_MS);
    const reportNo = String(FIRST_REPORT_NO + weekIndex).padStart(2, '0');
    update.run(reportNo, session.id);
    updated += 1;
    distribution.set(reportNo, (distribution.get(reportNo) ?? 0) + 1);
  }
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

console.log(`قاعدة البيانات: ${DB_PATH}`);
console.log(`أول أسبوع: ${anchor.toISOString().slice(0, 10)}`);
console.log(`جلسات مرقّمة: ${updated}`);
for (const [reportNo, count] of [...distribution.entries()].sort()) console.log(`  تقرير ${reportNo}: ${count} جلسة`);
db.close();
