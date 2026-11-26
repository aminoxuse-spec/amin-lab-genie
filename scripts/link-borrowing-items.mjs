#!/usr/bin/env node
/**
 * ربط وسائل جلسات الإعارة بأصناف الجرد يدوياً.
 * يُستدعى تلقائياً أيضاً في نهاية scripts/import-borrowing-reports.mjs.
 *
 * الاستخدام: node scripts/link-borrowing-items.mjs "<مسار قاعدة البيانات>"
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { linkBorrowingItems } from './lib/link-borrowing-items.mjs';

const DB_PATH = process.argv[2] ?? 'data/amin-lab-genie.sqlite';
if (!existsSync(DB_PATH)) {
  console.error('قاعدة البيانات غير موجودة:', DB_PATH);
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);
try {
  const result = linkBorrowingItems(db);
  if (result.unmatchedAliases.length) {
    console.log('وسائل بلا صنف مطابق في الجرد (تُترك في الملاحظات):', result.unmatchedAliases.join('، '));
  }
  console.log(`قاعدة البيانات: ${DB_PATH}`);
  console.log(`جلسات مرتبطة: ${result.linkedSessions} · سطور أصناف مضافة: ${result.addedLines}`);
  if (result.skipped.length) {
    console.log(`نصوص لم تُطابق (${result.skipped.length}):`, result.skipped.join('، '));
  }
  console.log('إجمالي سطور الأصناف:', db.prepare('SELECT COUNT(*) AS c FROM borrowing_items').get().c);
  console.log(
    'ملخص:',
    JSON.stringify(
      db
        .prepare(
          `SELECT COUNT(DISTINCT session_id) AS sessions,
                  SUM(quantity_out) AS units,
                  SUM(CASE WHEN condition_out = 'consumed' THEN quantity_out ELSE 0 END) AS consumed
           FROM borrowing_items`,
        )
        .get(),
    ),
  );
} finally {
  db.close();
}
