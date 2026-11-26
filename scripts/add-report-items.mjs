#!/usr/bin/env node
/**
 * إضافة أصناف وردت في تقارير الإعارة ولم تكن في الجرد، مع حركة مخزون افتتاحية.
 * لا يكرّر الصنف إن كان موجوداً بنفس الاسم.
 * الاستخدام: node scripts/add-report-items.mjs "<مسار قاعدة البيانات>"
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const DB_PATH = process.argv[2] ?? 'data/amin-lab-genie.sqlite';
if (!existsSync(DB_PATH)) {
  console.error('قاعدة البيانات غير موجودة:', DB_PATH);
  process.exit(1);
}

const ITEMS = [
  { code: '189', name: 'مجسم هظمي للإنسان', source: 'مجسم هظمي للانسان' },
  { code: '190', name: 'مكبر الصورة', source: 'مكبر الصورة' },
  { code: '191', name: 'كاشف كهربائي', source: 'كاشف كهربائي' },
  { code: '192', name: 'نواس', source: 'نواس' },
  { code: '193', name: 'كرة أرضية', source: 'كرة أرضية' },
  { code: '194', name: 'جداريات 2042-2045', source: 'جداريات 2042-2045' },
];

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout = 8000;');

const byName = db.prepare('SELECT id FROM inventory WHERE name = ? AND deleted_at IS NULL');
const byCode = db.prepare('SELECT id FROM inventory WHERE code = ?');
const insertItem = db.prepare(
  `INSERT INTO inventory
     (code, name, category, quantity, available_quantity, unit, location, min_quantity)
   VALUES (?, ?, 'apparatus', 1, 1, 'قطعة', NULL, 1)`,
);
const insertMovement = db.prepare(
  `INSERT INTO stock_movements (item_id, type, quantity, balance_after, reason, movement_date, user_id, username)
   VALUES (?, 'in', 1, 1, ?, date('now'), NULL, 'النظام')`,
);

const added = [];
const existing = [];

db.exec('BEGIN');
try {
  for (const item of ITEMS) {
    const found = byName.get(item.name);
    if (found) {
      existing.push({ ...item, id: found.id });
      continue;
    }
    let code = item.code;
    if (byCode.get(code)) {
      // اختر أول رمز رقمي حر
      const used = new Set(db.prepare('SELECT code FROM inventory').all().map((row) => row.code));
      let next = 189;
      while (used.has(String(next))) next += 1;
      code = String(next);
    }
    const result = insertItem.run(code, item.name);
    const id = Number(result.lastInsertRowid);
    insertMovement.run(id, 'رصيد افتتاحي — صنف مضاف من تقارير الإعارة');
    added.push({ ...item, id, code });
  }
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

console.log(`قاعدة البيانات: ${DB_PATH}`);
for (const item of added) console.log(` + ${item.code} | ${item.name} (id ${item.id})`);
for (const item of existing) console.log(` = موجود مسبقاً: ${item.name} (id ${item.id})`);
console.log('أصناف الجرد:', db.prepare('SELECT COUNT(*) AS c FROM inventory WHERE deleted_at IS NULL').get().c);
console.log('حركات المخزون:', db.prepare('SELECT COUNT(*) AS c FROM stock_movements').get().c);
db.close();
