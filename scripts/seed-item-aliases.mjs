#!/usr/bin/env node
/**
 * تعبئة بنك المرادفات (item_aliases) من القائمة الافتراضية.
 * يربط كل مرادف بالصنف المطابق في الجرد، ويتجاهل الموجود مسبقاً.
 *
 * الاستخدام: node scripts/seed-item-aliases.mjs "<مسار قاعدة البيانات>"
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { DEFAULT_ALIASES } from '../server/src/services/itemMatcher.ts';

const DB_PATH = process.argv[2] ?? 'data/amin-lab-genie.sqlite';
if (!existsSync(DB_PATH)) {
  console.error('قاعدة البيانات غير موجودة:', DB_PATH);
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout = 8000;');
db.exec(`
  CREATE TABLE IF NOT EXISTS item_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inventory_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (inventory_id, alias)
  );
`);

const lookup = db.prepare(
  `SELECT id, category FROM inventory
   WHERE deleted_at IS NULL AND name LIKE ?
   ORDER BY LENGTH(name) ASC LIMIT 1`,
);
const insert = db.prepare('INSERT OR IGNORE INTO item_aliases (inventory_id, alias) VALUES (?, ?)');

let added = 0;
const missing = [];
db.exec('BEGIN');
try {
  for (const entry of DEFAULT_ALIASES) {
    let item = null;
    for (const candidate of [entry.match, entry.fallback].filter(Boolean)) {
      item = lookup.get(`%${candidate}%`) ?? null;
      if (item) break;
    }
    if (!item) {
      missing.push(entry.tokens[0]);
      continue;
    }
    for (const token of entry.tokens) {
      added += insert.run(item.id, token).changes;
    }
  }
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

console.log(`قاعدة البيانات: ${DB_PATH}`);
console.log(`مرادفات مضافة: ${added}`);
if (missing.length) console.log('بلا صنف في الجرد:', missing.join('، '));
console.log('إجمالي المرادفات:', db.prepare('SELECT COUNT(*) AS c FROM item_aliases').get().c);
db.close();
