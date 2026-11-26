#!/usr/bin/env node
/**
 * إضافة الجداريات (رسومات تخطيطي) إلى العتاد مع رقم الجرد الخاص بصاحب المخبر.
 * آمن عند إعادة التشغيل: يتخطى أي رقم جرد خاص موجود مسبقاً.
 *
 * الاستخدام: node scripts/add-wall-charts.mjs "<مسار قاعدة البيانات>" [--dry-run]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const DB_PATH = process.argv[2];
const DRY = process.argv.includes('--dry-run');
if (!DB_PATH || !existsSync(DB_PATH)) {
  console.error('الاستخدام: node scripts/add-wall-charts.mjs "<مسار قاعدة البيانات>" [--dry-run]');
  process.exit(1);
}

/** [رقم الجرد الخاص، العنوان الصحيح] */
const CHARTS = [
  ['pho*2030', 'رسومات تخطيطية تبين الزمرة الدموية'],
  ['pho*2031', 'رسم تخطيطي يبين المصدر وكيفية تشكل كل من التوأم الحقيقي والتوأم غير الحقيقي'],
  ['pho*2032', 'رسم تخطيطي يبين سلوك الصبغيات أثناء تشكل الأمشاج'],
  ['pho*2033', 'رسم تخطيطي يبين مصدر المواد الغذائية في الجهاز الهضمي'],
  ['pho*2034', 'رسم تخطيطي يبين القوس الانعكاسي'],
  ['pho*2035', 'رسم تخطيطي يبين مراحل الحساسية'],
  ['pho*2036', 'رسم تخطيطي يبين الطابع النووي للبويضة'],
  ['pho*2037', 'رسم تخطيطي يبين استعمال المغذيات من طرف الخلايا'],
  ['pho*2038', 'رسم تخطيطي يبين مقر المعلومات الوراثية'],
  ['pho*2039', 'رسم تخطيطي يبين جهاز المناعة عند الإنسان'],
  ['pho*2040', 'رسم تخطيطي يبين الأعضاء المسؤولة عن استقبال المنبهات الخارجية'],
  ['pho*2041', 'رسم تخطيطي يبين الاستجابة الخطية (دفاع الجسم الطبيعي)'],
  ['pho*2042', 'رسم تخطيطي يبين السحبة الدموية تحت المجهر'],
  ['pho*2043', 'رسم تخطيطي يبين طرق الامتصاص'],
  ['pho*2044', 'رسم تخطيطي يبين مقطعاً طولياً للجلد'],
  ['pho*2045', 'رسم تخطيطي يبين دور الدم كوسيط بين الخلايا والوسط الخارجي'],
  ['pho*2046', 'رسم تخطيطي يبين بنية الزغابة المعوية'],
  ['pho*2047', 'رسم تخطيطي يبين تجارب تشرح الاستجابة الخلطية'],
  ['pho*2048', 'رسم تخطيطي يبين المظهر الخارجي لمخ الإنسان'],
  ['pho*2049', 'رسم تخطيطي يبين النمط النووي لمتلازمة داون'],
  ['pho*2050', 'رسم تخطيطي يبين انتقال صفة لون العيون في شجرة النسب'],
  ['pho*2051', 'رسم تخطيطي يبين الأنماط النووية للخلية الجسمية'],
  ['pho*2052', 'رسم تخطيطي يبين أعراض التفاعل الالتهابي قبل وبعد اختراق الجلد'],
  ['pho*2053', 'رسم تخطيطي يبين مراحل البلعمة'],
  ['pho*2054', 'رسم تخطيطي لتجارب تشرح الاستجابة الخلوية'],
  ['pho*2055', 'رسم تخطيطي يبين مراحل تشكل البويضات'],
  ['pho*2056', 'رسم تخطيطي يبين مراحل تكون النطاف'],
];

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout = 8000;');

const columns = db.prepare('PRAGMA table_info(inventory)').all().map((col) => col.name);
if (!columns.includes('owner_no')) db.exec('ALTER TABLE inventory ADD COLUMN owner_no TEXT');

const ownerPrefix = CHARTS[0][0].split('*')[0] + '*';
const existing = new Set(
  db.prepare('SELECT owner_no FROM inventory WHERE owner_no LIKE ?').all(ownerPrefix).map((row) => row.owner_no),
);
const maxCode = db
  .prepare("SELECT COALESCE(MAX(CAST(code AS INTEGER)), 0) AS max FROM inventory WHERE code GLOB '[0-9]*'")
  .get().max;
const insert = db.prepare(
  `INSERT INTO inventory (code, name, category, quantity, available_quantity, unit, min_quantity, owner_no)
   VALUES (?, ?, 'apparatus', 1, 1, 'لوحة', 0, ?)`,
);

let nextCode = Number(maxCode) + 1;
let added = 0;
const skipped = [];
db.exec('BEGIN');
try {
  for (const [ownerNo, title] of CHARTS) {
    if (existing.has(ownerNo)) {
      skipped.push(ownerNo);
      continue;
    }
    if (!DRY) insert.run(String(nextCode), title, ownerNo);
    nextCode += 1;
    added += 1;
  }
  db.exec(DRY ? 'ROLLBACK' : 'COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

console.log(`قاعدة البيانات: ${DB_PATH}${DRY ? ' (تجريبي)' : ''}`);
console.log(`جداريات مضافة: ${added}`);
if (skipped.length) console.log(`موجودة مسبقاً (تُخطّيت): ${skipped.length}`);
console.log('إجمالي الجداريات:', existing.size + added);
db.close();
