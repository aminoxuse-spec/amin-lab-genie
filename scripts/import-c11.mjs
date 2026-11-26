#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/amin-lab-genie.sqlite');

// 6 rows from Inventaire-C11-Modele-Import.csv (category "equipment" -> apparatus)
const rows = [
  { code: '150', name: 'DLP progecteur (1)', quantity: 1, location: 'قاعة C11 سمعي بصري', state: 'جيد', notes: '' },
  { code: '151', name: 'DLP progecteur (2)', quantity: 1, location: 'قاعة C11 سمعي بصري', state: 'جيد', notes: '' },
  { code: '152', name: 'PC portable ACER (1)', quantity: 1, location: 'قاعة C11 سمعي بصري', state: 'جيد', notes: '' },
  { code: '153', name: 'PC portable lenovo noir (2)', quantity: 1, location: 'قاعة C11 سمعي بصري', state: 'جيد', notes: 'تم تحويله إلى المدير' },
  { code: '154', name: 'PC portable lenovo (3)', quantity: 1, location: 'قاعة C11 سمعي بصري', state: 'جيد', notes: 'تم تحويله إلى المدير' },
  { code: '155', name: 'مكبر الصوت', quantity: 1, location: 'قاعة C11 سمعي بصري', state: 'جيد', notes: 'تم تحويله إلى ساحة العلم' },
];

const insertItem = db.prepare(`
  INSERT INTO inventory (code, name, category, quantity, available_quantity, unit, location, min_quantity, danger_level)
  VALUES (?, ?, 'apparatus', ?, ?, 'قطعة', ?, 1, 'low')
`);
const insertMove = db.prepare(`
  INSERT INTO stock_movements (item_id, type, quantity, balance_after, reason, username)
  VALUES (?, 'in', ?, ?, 'استيراد Inventaire-C11', 'admin')
`);

db.exec('BEGIN');
let ok = 0;
for (const r of rows) {
  const exists = db.prepare('SELECT id FROM inventory WHERE code = ?').get(r.code);
  if (exists) { console.log('skip existing code', r.code); continue; }
  const loc = r.notes ? `${r.location} — ${r.notes}` : r.location;
  const res = insertItem.run(r.code, r.name, r.quantity, r.quantity, loc);
  insertMove.run(res.lastInsertRowid, r.quantity, r.quantity);
  ok += 1;
  console.log('inserted', r.code, r.name);
}
db.exec('COMMIT');
console.log('done inserted', ok, 'of', rows.length);
console.log(JSON.stringify(db.prepare("SELECT category, COUNT(*) c FROM inventory WHERE deleted_at IS NULL GROUP BY category").all()));
db.close();
