import { createApp } from './app.ts';
import { APP_NAME, APP_VERSION, DEFAULT_SECRET, HOST, PORT, SECRET } from './config.ts';
import { seed } from './seed.ts';
import { createBackup } from './utils/backup.ts';
import { logger } from './utils/logger.ts';

seed();

if (SECRET === DEFAULT_SECRET) {
  logger.warn('يُستحسن ضبط APP_SECRET في بيئة الإنتاج لتوقيع جلسات الدخول.');
}

const app = createApp();
const server = app.listen(PORT, HOST, () => {
  logger.info(`${APP_NAME} v${APP_VERSION} يعمل على http://localhost:${PORT}`);
});

// نسخة احتياطية تلقائية كل 24 ساعة (بدون منع إغلاق العملية)
const backupTimer = setInterval(
  () => {
    try {
      createBackup();
    } catch (error) {
      logger.error('فشل النسخ الاحتياطي التلقائي', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  },
  24 * 60 * 60 * 1000,
);
backupTimer.unref?.();

function shutdown(signal: string): void {
  logger.info(`إيقاف الخادم (${signal})`);
  clearInterval(backupTimer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
