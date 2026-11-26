import { createApp } from './app.ts';
import { APP_NAME, APP_VERSION, BACKUP_HOUR, DEFAULT_SECRET, HOST, PORT, SECRET } from './config.ts';
import { seed } from './seed.ts';
import { createBackup } from './utils/backup.ts';
import { licenseStatus } from './utils/license.ts';
import { vaultLocation } from './utils/deviceVault.ts';
import { logger } from './utils/logger.ts';

seed();

// يثبّت ربط هذا الجهاز في خزنة الجهاز (خارج مجلد التطبيق) عند أول تشغيل.
licenseStatus();
logger.info(`خزنة ربط الجهاز: ${vaultLocation()}`);

if (SECRET === DEFAULT_SECRET) {
  const message = 'APP_SECRET غير مضبوط — لا تستخدم هذا السر في الإنتاج (يُوقّع به الجلسات والترخيص).';
  if (process.env.NODE_ENV === 'production') {
    logger.error(message);
    process.exit(1);
  }
  logger.warn(message);
}
if (SECRET.length < 32) {
  logger.warn('APP_SECRET قصير (أقل من 32 حرفاً) — يُنصح بسر أطول (48+ بايت).');
}

const app = createApp();
const server = app.listen(PORT, HOST, () => {
  logger.info(`${APP_NAME} v${APP_VERSION} يعمل على http://localhost:${PORT}`);
});

function msUntilNextBackup(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(BACKUP_HOUR, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

// نسخة احتياطية تلقائية يومياً في الساعة BACKUP_HOUR (بدون منع إغلاق العملية)
let backupTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleBackup(): void {
  const delay = msUntilNextBackup();
  backupTimer = setTimeout(() => {
    try {
      createBackup();
    } catch (error) {
      logger.error('فشل النسخ الاحتياطي التلقائي', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    scheduleBackup();
  }, delay);
  backupTimer.unref?.();
  logger.info(`النسخ الاحتياطي التلقائي مجدول (الساعة ${BACKUP_HOUR}:00، بعد ${Math.round(delay / 60000)} دقيقة)`);
}
scheduleBackup();

function shutdown(signal: string): void {
  logger.info(`إيقاف الخادم (${signal})`);
  if (backupTimer) clearTimeout(backupTimer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
