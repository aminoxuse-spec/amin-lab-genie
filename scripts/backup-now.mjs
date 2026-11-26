#!/usr/bin/env node
/**
 * نسخة احتياطية فورية من قاعدة البيانات — لاستخدامها في Task Scheduler (Windows)
 * أو cron (Linux/macOS).
 *
 *   node scripts/backup-now.mjs
 *
 * متغيرات البيئة (اختيارية):
 *   APP_DATA_DIR  — مجلد البيانات (افتراضي: ./data أو %LOCALAPPDATA%/Amin-Lab Genie/data)
 *   BACKUP_DIR    — مجلد النسخ (افتراضي: <data>/backups)
 *   BACKUP_RETENTION — عدد النسخ المحتفظ بها (افتراضي 14)
 *
 * Task Scheduler (Windows) مثال:
 *   Program:  node
 *   Args:     C:\path\to\scripts\backup-now.mjs
 *   Start in: C:\path\to\project
 *   Trigger:  daily 02:00
 */
import { existsSync } from 'node:fs';

// Node 22+ يدعم استيراد .ts مباشرة (type stripping).
const { createBackup } = await import('../server/src/utils/backup.ts');

try {
  const info = createBackup();
  console.log(JSON.stringify({ ok: true, file: info.file, size: info.size, createdAt: info.createdAt }));
  process.exit(0);
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
}
