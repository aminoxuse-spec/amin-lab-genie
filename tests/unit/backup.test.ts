import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dataDir = mkdtempSync(join(tmpdir(), 'amin-lab-backup-test-'));
process.env.DATA_DIR = dataDir;
process.env.BACKUP_DIR = join(dataDir, 'backups');
process.env.DB_PATH = join(dataDir, 'test.sqlite');
process.env.APP_SECRET = 'test-secret';

// seed a minimal sqlite db by importing Setting (creates schema)
const { setSettings, allSettings } = await import('../../server/src/models/Setting.ts');
const { db } = await import('../../server/src/db.ts');
setSettings({ 'test.key': 'hello' });

const backup = await import('../../server/src/utils/backup.ts');

test.after(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test('createBackup creates a non-empty file with SQLite header', () => {
  const info = backup.createBackup();
  assert.ok(existsSync(info.file));
  assert.ok(info.size > 0);
  const buf = readFileSync(info.file);
  // SQLite magic header
  assert.equal(buf.subarray(0, 16).toString('ascii'), 'SQLite format 3\0');
});

test('listBackups returns the created backup', () => {
  const list = backup.listBackups();
  assert.ok(list.length >= 1);
  assert.ok(list.some((b) => existsSync(b.file)));
});

test('backup file is a byte-identical copy of the DB at creation time', () => {
  const info = backup.createBackup();
  const dbBytes = readFileSync(process.env.DB_PATH!);
  const backupBytes = readFileSync(info.file);
  assert.equal(dbBytes.length, backupBytes.length);
  assert.deepEqual(dbBytes, backupBytes);
});

test('backup can be opened as a SQLite database and contains original data (restore readiness)', async () => {
  const info = backup.createBackup();
  // simulate restore: open the backup as an independent DB and read the seeded row
  const restored = new DatabaseSync(info.file, { open: true, readOnly: true });
  try {
    const rows = restored.prepare("SELECT value FROM app_settings WHERE key = 'test.key'").all() as { value: string }[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].value, 'hello');
    // schema present
    const tables = restored.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'").all();
    assert.equal(tables.length, 1);
  } finally {
    restored.close();
  }
});

test('pruneBackups keeps only BACKUP_RETENTION copies', () => {
  process.env.BACKUP_RETENTION = '2';
  // create 4 backups
  for (let i = 0; i < 4; i++) backup.createBackup();
  const before = backup.listBackups().length;
  assert.ok(before >= 4);
  const pruned = backup.pruneBackups(2);
  assert.ok(pruned >= 2);
  assert.equal(backup.listBackups().length, 2);
});
