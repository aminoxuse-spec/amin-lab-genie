import { resolve } from 'node:path';

/** اسم التطبيق النهائي */
export const APP_NAME = 'Amin-Lab -Pro🔬';
export const APP_VERSION = '1.5.1';

export const PORT = Number(process.env.PORT ?? 3000);
export const HOST = process.env.HOST ?? '0.0.0.0';

export const DATA_DIR = resolve(process.env.DATA_DIR ?? 'data');
export const DB_PATH = resolve(process.env.DB_PATH ?? `${DATA_DIR}/amin-lab-genie.sqlite`);
export const BACKUP_DIR = resolve(process.env.BACKUP_DIR ?? `${DATA_DIR}/backups`);
export const CLIENT_DIR = resolve(process.env.CLIENT_DIR ?? 'client/src');

/** مدة صلاحية جلسة الدخول (ثوانٍ) */
export const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL ?? 8 * 60 * 60);

export const DEFAULT_SECRET = 'amin-lab-genie-dev-secret-change-me';
export const SECRET = process.env.APP_SECRET ?? DEFAULT_SECRET;

export const BACKUP_RETENTION = Number(process.env.BACKUP_RETENTION ?? 14);

/** مدة الفترة التجريبية بالأيام (تبدأ عند أول تشغيل). */
export const TRIAL_DAYS = Number(process.env.TRIAL_DAYS ?? 30);
