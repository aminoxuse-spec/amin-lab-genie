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

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  room_id INTEGER REFERENCES lab_rooms(id),
  class_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
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
ensureColumn('borrowing_items', 'notes', 'TEXT');

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
