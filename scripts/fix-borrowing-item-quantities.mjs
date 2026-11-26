#!/usr/bin/env node
/**
 * تصحيح كميات سطور الإعارة التي يبدأ نصّها في التقرير برقم صريح
 * (مثل «05 انابيب اختبار» أو «20 ملل HCL») بعد أن استُوردت بالكمية الافتراضية 1.
 * لا يمسّ السطور التي لا تحمل رقماً صريحاً.
 *
 * الاستخدام: node scripts/fix-borrowing-item-quantities.mjs "<مسار قاعدة البيانات>"
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

const update = db.prepare('UPDATE borrowing_items SET quantity_out = ?, quantity_returned = ? WHERE id = ?');
const lines = db
  .prepare(
    `SELECT i.id, i.quantity_out, i.condition_out, i.notes, v.name AS item_name
     FROM borrowing_items i JOIN inventory v ON v.id = i.inventory_id`,
  )
  .all();

let updated = 0;
db.exec('BEGIN');
try {
  for (const line of lines) {
    const match = String(line.notes ?? '').match(/^0*(\d+)/);
    if (!match) continue;
    const quantity = Number(match[1]);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity === line.quantity_out) continue;
    const returned = line.condition_out === 'consumed' ? 0 : quantity;
    update.run(quantity, returned, line.id);
    updated += 1;
    console.log(` ~ ${line.item_name}: ${line.quantity_out} → ${quantity} (سطر ${line.id})`);
  }
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

console.log(`قاعدة البيانات: ${DB_PATH}`);
console.log(`سطور مصحّحة: ${updated}`);
console.log(
  'ملخص:',
  JSON.stringify(
    db
      .prepare(
        `SELECT SUM(quantity_out) AS units,
                SUM(CASE WHEN condition_out = 'consumed' THEN quantity_out ELSE 0 END) AS consumed
         FROM borrowing_items`,
      )
      .get(),
  ),
);
db.close();
