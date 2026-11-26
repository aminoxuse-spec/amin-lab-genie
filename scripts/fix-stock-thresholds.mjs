#!/usr/bin/env node
/**
 * ضبط الحد الأدنى للمخزون بشكل واقعي:
 *  - الصنف الوحيد (الكمية ≤ 1) → min_quantity = 0 (لا تنبيه إعادة طلب؛ يُنبَّه فقط عند نفاد المتوفر).
 *  - الأصناف المتعددة التي حدّها الافتراضي 1 تبقى 1.
 * لا يغيّر أي حد ضبطه المستخدم على غير القيمة الافتراضية.
 *
 * الاستخدام: node scripts/fix-stock-thresholds.mjs "<مسار قاعدة البيانات>"
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const DB_PATH = process.argv[2] ?? 'data/amin-lab-genie.sqlite';
if (!existsSync(DB_PATH)) {
  console.error('قاعدة البيانات غير موجودة:', DB_PATH);
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout = 8000;');

const single = db
  .prepare('UPDATE inventory SET min_quantity = 0 WHERE deleted_at IS NULL AND quantity <= 1 AND min_quantity = 1')
  .run();
const multi = db
  .prepare('UPDATE inventory SET min_quantity = 1 WHERE deleted_at IS NULL AND quantity > 1 AND min_quantity = 0')
  .run();

const summary = db
  .prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN min_quantity > 0 AND available_quantity <= min_quantity THEN 1 ELSE 0 END) AS low,
            SUM(CASE WHEN available_quantity <= 0 THEN 1 ELSE 0 END) AS out
     FROM inventory WHERE deleted_at IS NULL`,
  )
  .get();

console.log(`قاعدة البيانات: ${DB_PATH}`);
console.log(`حدود مصفّرة (صنف وحيد): ${single.changes} · حدود مفعّلة (متعدد): ${multi.changes}`);
console.log(`الإجمالي: ${summary.total} · تحت الحد الأدنى: ${summary.low} · غير متوفر: ${summary.out}`);
db.close();
