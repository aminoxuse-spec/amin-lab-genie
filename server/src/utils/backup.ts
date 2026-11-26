import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { BACKUP_DIR, BACKUP_RETENTION, DB_PATH } from '../config.ts';
import { db } from '../db.ts';
import { logger } from './logger.ts';

export type BackupInfo = { file: string; size: number; createdAt: string };

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/** نسخة احتياطية من قاعدة البيانات في data/backups */
export function createBackup(): BackupInfo {
  if (!existsSync(DB_PATH)) throw new Error(`قاعدة البيانات غير موجودة: ${DB_PATH}`);
  // تفريغ WAL إلى الملف الرئيسي قبل النسخ (وإلا تُفقد البيانات غير المُRSaved)
  try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* ignore */ }
  mkdirSync(BACKUP_DIR, { recursive: true });
  const target = join(BACKUP_DIR, `amin-lab-genie-${stamp()}.sqlite`);
  copyFileSync(DB_PATH, target);
  const info = { file: target, size: statSync(target).size, createdAt: new Date().toISOString() };
  pruneBackups();
  logger.info('تم إنشاء نسخة احتياطية', { file: target, size: info.size });
  return info;
}

export function listBackups(): BackupInfo[] {
  if (!existsSync(BACKUP_DIR)) return [];
  return readdirSync(BACKUP_DIR)
    .filter((name) => name.endsWith('.sqlite'))
    .map((name) => {
      const file = join(BACKUP_DIR, name);
      const stat = statSync(file);
      return { file, size: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** يحتفظ فقط بأحدث BACKUP_RETENTION نسخة */
export function pruneBackups(keep: number = BACKUP_RETENTION): number {
  const backups = listBackups();
  const stale = backups.slice(keep);
  for (const backup of stale) unlinkSync(backup.file);
  return stale.length;
}
