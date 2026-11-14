/**
 * associations.ts — وصف العلاقات بين الجداول.
 *
 * يستخدم المشروع SQLite عبر `node:sqlite`، لذا تُنفَّذ العلاقات على مستوى قاعدة
 * البيانات (FOREIGN KEY + ON DELETE CASCADE) ويُوثَّق هنا شكلها المنطقي حتى
 * تبقى نقطة مرجعية واحدة لبقية الطبقات.
 *
 *   users 1 ──< borrowing_sessions   (teacher_id)
 *   users 1 ──< schedules            (teacher_id)
 *   lab_rooms 1 ──< borrowing_sessions (room_id)
 *   lab_rooms 1 ──< schedules          (room_id)
 *   borrowing_sessions 1 ──< borrowing_items (session_id, CASCADE)
 *   inventory 1 ──< borrowing_items   (inventory_id)
 *   inventory 1 ──< qc_checks         (inventory_id, CASCADE)
 */

export const ASSOCIATIONS = [
  { from: 'borrowing_sessions', field: 'teacher_id', to: 'users', onDelete: 'restrict' },
  { from: 'borrowing_sessions', field: 'room_id', to: 'lab_rooms', onDelete: 'set null' },
  { from: 'borrowing_items', field: 'session_id', to: 'borrowing_sessions', onDelete: 'cascade' },
  { from: 'borrowing_items', field: 'inventory_id', to: 'inventory', onDelete: 'restrict' },
  { from: 'schedules', field: 'teacher_id', to: 'users', onDelete: 'restrict' },
  { from: 'schedules', field: 'room_id', to: 'lab_rooms', onDelete: 'set null' },
  { from: 'qc_checks', field: 'inventory_id', to: 'inventory', onDelete: 'cascade' },
] as const;
