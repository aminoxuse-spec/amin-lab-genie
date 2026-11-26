import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DB_PATH } from './config.ts';
import { logger } from './utils/logger.ts';

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','teacher')),
  phone TEXT,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lab_rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  capacity INTEGER NOT NULL DEFAULT 24,
  location TEXT
);

CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('apparatus','glassware','chemical')),
  quantity INTEGER NOT NULL DEFAULT 0,
  available_quantity INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'قطعة',
  location TEXT,
  min_quantity INTEGER NOT NULL DEFAULT 1,
  expiry_date TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS borrowing_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  room_id INTEGER REFERENCES lab_rooms(id),
  level TEXT,
  class_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  session_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','partial','returned')),
  notes TEXT,
  report_no TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS borrowing_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES borrowing_sessions(id) ON DELETE CASCADE,
  inventory_id INTEGER NOT NULL REFERENCES inventory(id),
  quantity_out INTEGER NOT NULL,
  quantity_returned INTEGER NOT NULL DEFAULT 0,
  condition_out TEXT NOT NULL DEFAULT 'good',
  condition_in TEXT,
  damaged INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS material_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  session_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  class_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  admin_note TEXT,
  session_id INTEGER REFERENCES borrowing_sessions(id) ON DELETE SET NULL,
  decided_by INTEGER REFERENCES users(id),
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS material_request_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES material_requests(id) ON DELETE CASCADE,
  inventory_id INTEGER NOT NULL REFERENCES inventory(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_material_requests_teacher ON material_requests(teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_material_request_items_request ON material_request_items(request_id);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  room_id INTEGER REFERENCES lab_rooms(id),
  class_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','done','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS qc_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  check_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok','low','expired','damaged')),
  quantity_found INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_date ON borrowing_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_items_session ON borrowing_items(session_id);
CREATE INDEX IF NOT EXISTS idx_qc_date ON qc_checks(check_date);

CREATE TABLE IF NOT EXISTS experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stage TEXT NOT NULL CHECK (stage IN ('middle','secondary')),
  level TEXT NOT NULL,
  subject TEXT,
  title TEXT NOT NULL,
  objective TEXT,
  materials TEXT,
  duration_minutes INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_experiments_stage ON experiments(stage);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('in','consume','damage','adjust')),
  quantity INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT,
  movement_date TEXT NOT NULL DEFAULT (date('now')),
  user_id INTEGER,
  username TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_movements_date ON stock_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_movements_item ON stock_movements(item_id);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
`;

db.exec(SCHEMA);

// ترقية قاعدة بيانات قائمة: إضافة عمود الحذف الناعم (سلة المحذوفات)
const inventoryColumns = allRows<{ name: string }>('PRAGMA table_info(inventory)');
if (!inventoryColumns.some((column) => column.name === 'deleted_at')) {
  db.exec('ALTER TABLE inventory ADD COLUMN deleted_at TEXT');
  logger.info('ترقية المخطط: إضافة inventory.deleted_at');
}

// ترقية: حقول الإعارة المتعددة العناصر (المستوى، الموعد، ملاحظات السطر)
function ensureColumn(table: string, column: string, definition: string): void {
  const columns = allRows<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!columns.some((row) => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    logger.info(`ترقية المخطط: إضافة ${table}.${column}`);
  }
}

// بنك مرادفات الوسائل: أسماء كما ترد في تقارير الإعارة → صنف الجرد
db.exec(`
  CREATE TABLE IF NOT EXISTS item_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inventory_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (inventory_id, alias)
  );
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_aliases_item ON item_aliases(inventory_id)');

// إعدادات التطبيق (مؤسسة، شعار، توقيعات)
db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

ensureColumn('borrowing_sessions', 'level', 'TEXT');
ensureColumn('borrowing_sessions', 'due_date', 'TEXT');
ensureColumn('borrowing_sessions', 'report_no', 'TEXT');
ensureColumn('borrowing_items', 'notes', 'TEXT');

// ترقية: الحقول الكيميائية وبيانات الشراء داخل بطاقة الصنف
ensureColumn('inventory', 'formula', 'TEXT');
ensureColumn('inventory', 'danger_level', 'TEXT');
ensureColumn('inventory', 'supplier', 'TEXT');
ensureColumn('inventory', 'invoice_no', 'TEXT');
ensureColumn('inventory', 'owner_no', 'TEXT');
ensureColumn('inventory', 'purchase_date', 'TEXT');
ensureColumn('inventory', 'cost', 'REAL');
ensureColumn('inventory', 'name_ar', 'TEXT');

// ترقية: هاتف الأستاذ/المستخدم
ensureColumn('users', 'phone', 'TEXT');

// ترقية: تخصص الأستاذ (علوم فيزيائية / علوم الطبيعة والحياة)
ensureColumn('users', 'specialty', 'TEXT');

// رصيد افتتاحي لسجل الحركات: يُسجّل مرة واحدة للأصناف الموجودة قبل إنشاء السجل.
try {
  db.exec(`
    INSERT INTO stock_movements (item_id, type, quantity, balance_after, reason, movement_date, username)
    SELECT id, 'in', quantity, quantity, 'رصيد افتتاحي', date(created_at), 'النظام'
    FROM inventory
    WHERE deleted_at IS NULL AND quantity > 0
      AND NOT EXISTS (SELECT 1 FROM stock_movements)
  `);
} catch {
  // لا تُفشل بدء التشغيل إن كانت قاعدة البيانات قديمة أو مقفلة
}

// ترقية: حالة الحصة (مبرمجة / منجزة / ملغاة)
ensureColumn('schedules', 'status', "TEXT NOT NULL DEFAULT 'scheduled'");

// فهارس الاستعلامات الساخنة: البحث بالرمز/الاسم، تصفية الفئة، الحصص، والإعارات
function ensureIndex(sql: string): void {
  try {
    db.exec(sql);
  } catch {
    // لا تُفشل بدء التشغيل إن كانت قاعدة البيانات قديمة أو مقفلة
  }
}
ensureIndex('CREATE INDEX IF NOT EXISTS idx_inventory_code ON inventory(code)');
ensureIndex('CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category, deleted_at)');
ensureIndex('CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name)');
ensureIndex('CREATE INDEX IF NOT EXISTS idx_schedules_slot ON schedules(day_of_week, start_time)');
ensureIndex('CREATE INDEX IF NOT EXISTS idx_borrowing_items_inventory ON borrowing_items(inventory_id)');
ensureIndex('CREATE INDEX IF NOT EXISTS idx_material_requests_status ON material_requests(status)');

logger.debug('قاعدة البيانات جاهزة', { path: DB_PATH });

export type SqlParam = string | number | null;

export function allRows<T>(sql: string, ...params: SqlParam[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}

export function oneRow<T>(sql: string, ...params: SqlParam[]): T | undefined {
  return db.prepare(sql).get(...params) as unknown as T | undefined;
}

export function run(sql: string, ...params: SqlParam[]): { changes: number; lastInsertRowid: number } {
  const result = db.prepare(sql).run(...params);
  return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
}

/** تنفيذ عملية داخل معاملة واحدة. */
export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
