/**
 * ربط وسائل جلسات الإعارة بأصناف الجرد.
 * المطابقة نفسها تأتي من وحدة مشتركة واحدة: server/src/services/itemMatcher.ts
 * (بنك المرادفات `item_aliases` أولاً، ثم أسماء الجرد عند فراغ البنك).
 * `resolveEquipment` تُرجع `source` (نص البند الأصلي) لحفظه في ملاحظات السطر.
 */
import {
  DEFAULT_ALIASES,
  fallbackAliases,
  loadAliases,
  resolveEquipment,
} from '../../server/src/services/itemMatcher.ts';

export { DEFAULT_ALIASES };

/**
 * ينشئ سطور الأصناف للجلسات التي لا تحتوي عليها (آمن عند إعادة التشغيل).
 * لا يعدّل كميات المخزون (الجلسات تاريخية ومُرجعة عادةً).
 *
 * @returns {{ linkedSessions: number, addedLines: number, skipped: string[], unmatchedAliases: string[] }}
 */
export function linkBorrowingItems(db) {
  db.exec('PRAGMA busy_timeout = 8000;');

  const stored = loadAliases(db);
  const fallback = stored.length ? { aliases: stored, missing: [] } : fallbackAliases(db);

  // الجلسات التي لا تحتوي على أي سطر صنف فقط.
  const sessions = db
    .prepare(
      `SELECT s.id, s.notes FROM borrowing_sessions s
       WHERE NOT EXISTS (SELECT 1 FROM borrowing_items i WHERE i.session_id = s.id)
       ORDER BY s.id`,
    )
    .all();
  const insert = db.prepare(
    `INSERT INTO borrowing_items
       (session_id, inventory_id, quantity_out, quantity_returned, condition_out, condition_in, damaged, notes)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
  );

  const skipped = [];
  let linkedSessions = 0;
  let addedLines = 0;

  db.exec('BEGIN');
  try {
    for (const session of sessions) {
      const { lines, unresolved } = resolveEquipment(session.notes ?? '', fallback.aliases, db);
      skipped.push(...unresolved);
      if (!lines.length) continue;

      for (const line of lines) {
        insert.run(
          session.id,
          line.inventoryId,
          line.quantity,
          line.consumed ? 0 : line.quantity,
          line.consumed ? 'consumed' : 'good',
          line.consumed ? null : 'good',
          line.source,
        );
        addedLines += 1;
      }
      linkedSessions += 1;
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return {
    linkedSessions,
    addedLines,
    skipped: [...new Set(skipped.map((token) => token.replace(/\s+/g, ' ').trim()))],
    unmatchedAliases: fallback.missing,
  };
}
