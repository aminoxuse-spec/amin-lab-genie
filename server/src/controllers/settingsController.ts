import type { Request, Response } from 'express';
import type { AuthedRequest } from '../middleware/auth.ts';
import { APP_NAME, APP_VERSION, DB_PATH, PORT } from '../config.ts';
import { listUsers, countUsers } from '../models/User.ts';
import { countRooms, listRooms } from '../models/LabRoom.ts';
import { inventorySummary } from '../models/Inventory.ts';
import { countOpenSessions, listSessions } from '../models/BorrowingSession.ts';
import { countChecksToday } from '../models/QCCheck.ts';
import { statusBreakdown } from '../models/QCCheck.ts';
import { ensureInstallId, getInstitution, updateInstitution } from '../models/Setting.ts';
import { clearActivity, listActivity, logActivity } from '../models/Activity.ts';
import { seed } from '../seed.ts';
import { run, transaction } from '../db.ts';
import { activateLicense, deactivateLicense, generateLicense, importLicense, isValidLicense, licenseStatus, listLicenses, revokeLicense } from '../utils/license.ts';
import { logger } from '../utils/logger.ts';
import { createBackup, listBackups } from '../utils/backup.ts';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { BACKUP_DIR } from '../config.ts';

/** معلومات النظام والإحصاءات العامة لصفحة الإعدادات. */
export function info(req: Request, res: Response): void {
  const currentUser = (req as AuthedRequest).currentUser;
  const admin = currentUser?.role === 'admin';
  res.json({
    app: APP_NAME,
    version: APP_VERSION,
    port: PORT,
    database: admin ? DB_PATH : '—',
    serverTime: new Date().toISOString(),
    counts: {
      users: countUsers(),
      rooms: countRooms(),
      inventory: inventorySummary(),
      sessions: listSessions().length,
      openSessions: countOpenSessions(),
      checksToday: countChecksToday(),
    },
    users: admin ? listUsers() : [],
    rooms: admin ? listRooms() : [],
    qc: statusBreakdown(),
    institution: getInstitution(),
  });
}

/** معلومات المؤسسة العامة (متاحة قبل تسجيل الدخول لعرض الشعار). */
export function institution(_req: Request, res: Response): void {
  res.setHeader('Cache-Control', 'no-cache');
  res.json({ institution: getInstitution() });
}

/** حالة الترخيص (يخفي عبارة «نسخة تجريبية» عن الملصقات بعد التفعيل). */
export function license(_req: Request, res: Response): void {
  const status = licenseStatus();
  res.json({
    active: status.active,
    trial: status.trial,
    key: status.key,
    activatedAt: status.activatedAt,
    expiresAt: status.expiresAt,
    expired: status.expired,
    trialStartedAt: status.trialStartedAt,
    trialEndsAt: status.trialEndsAt,
    trialDaysLeft: status.trialDaysLeft,
    locked: status.locked,
    bound: status.bound,
    deviceId: status.deviceId,
    deviceBound: status.deviceBound,
    deviceMismatch: status.deviceMismatch,
    installId: ensureInstallId(),
  });
}

/** تفعيل الترخيص بمفتاح مشتق من APP_SECRET (admin). */
export function activate(req: Request, res: Response): void {
  const body = req.body as { key?: string; duration_days?: number };
  const key = String(body.key ?? '').trim();
  if (!key) {
    res.status(400).json({ error: 'أدخل مفتاح الترخيص' });
    return;
  }
  if (!isValidLicense(key)) {
    res.status(400).json({ error: 'مفتاح ترخيص غير صالح لهذا التثبيت' });
    return;
  }
  const days = Number(body.duration_days);
  const expiresAt = days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : undefined;
  if (!activateLicense(key, expiresAt)) {
    // مثلاً: نسخة منقولة تُظهر تفعيلاً سابقاً بينما لا خزنة ربط لهذا الجهاز.
    res.status(409).json({
      error: 'تعذّر التفعيل: هذا المفتاح مُستعمل على جهاز آخر. فعّل مفتاحاً جديداً لهذا الجهاز.',
      code: 'LICENSE_DEVICE_MISMATCH',
    });
    return;
  }
  logActivity((req as AuthedRequest).currentUser, 'تفعيل الترخيص', days > 0 ? `مدة ${days} يوماً` : 'ترخيص دائم');
  logger.info('تفعيل الترخيص', { durationDays: days || 'permanent' });
  res.json({ active: true, trial: false, expiresAt: expiresAt ?? null });
}

/** إلغاء التفعيل (admin) — للاختبار أو إعادة النسخة التجريبية. */
export function deactivate(req: Request, res: Response): void {
  deactivateLicense();
  logActivity((req as AuthedRequest).currentUser, 'إلغاء تفعيل الترخيص');
  logger.info('إلغاء تفعيل الترخيص');
  res.json({ active: false, trial: true });
}

/** تعديل معلومات المؤسسة والشعار والتوقيعات (admin). */
export function updateInstitutionInfo(req: Request, res: Response): void {
  const body = req.body as {
    name?: string;
    name_fr?: string;
    school_year?: string;
    level?: 'middle' | 'secondary';
    logo?: string;
    logo_in_print?: boolean;
    signature_lab?: string;
    signature_lab_fr?: string;
    signature_counselor?: string;
    signature_counselor_fr?: string;
    signature_director?: string;
    signature_director_fr?: string;
    app_name?: string;
    language?: string;
    primary_color?: string;
  };

  if (body.level !== undefined && body.level !== 'middle' && body.level !== 'secondary') {
    res.status(400).json({ error: 'مستوى المؤسسة يجب أن يكون متوسط أو ثانوي' });
    return;
  }

  if (typeof body.logo === 'string' && body.logo && !body.logo.startsWith('data:image/')) {
    res.status(400).json({ error: 'الشعار يجب أن يكون صورة (data:image/…)' });
    return;
  }

  if (body.language !== undefined && !['ar', 'fr', 'en'].includes(body.language)) {
    res.status(400).json({ error: 'اللغة يجب أن تكون ar أو fr أو en' });
    return;
  }
  if (body.primary_color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(body.primary_color)) {
    res.status(400).json({ error: 'اللون الرئيسي يجب أن يكون بصيغة #RRGGBB' });
    return;
  }

  const institution = updateInstitution({
    name: body.name,
    name_fr: body.name_fr,
    school_year: body.school_year,
    level: body.level,
    logo: body.logo,
    logo_in_print: body.logo_in_print,
    app_name: body.app_name,
    language: body.language,
    primary_color: body.primary_color,
    signature: {
      lab: body.signature_lab,
      lab_fr: body.signature_lab_fr,
      counselor: body.signature_counselor,
      counselor_fr: body.signature_counselor_fr,
      director: body.signature_director,
      director_fr: body.signature_director_fr,
    },
  });

  logger.info('تحديث معلومات المؤسسة', { hasLogo: Boolean(institution.logo) });
  logActivity((req as AuthedRequest).currentUser, 'تعديل الإعدادات', body.app_name ? `اسم البرنامج: ${body.app_name}` : 'معلومات المؤسسة والهوية');
  res.json({ institution });
}

/** سجل النشاط (admin). */
export function activity(_req: Request, res: Response): void {
  res.json({
    activity: listActivity(200).map((row) => ({
      id: row.id,
      user: row.username || '—',
      action: row.action,
      details: row.details || '',
      createdAt: row.created_at,
    })),
  });
}

/** مسح سجل النشاط (admin). */
export function clearLog(req: Request, res: Response): void {
  clearActivity();
  logActivity((req as AuthedRequest).currentUser, 'مسح سجل النشاط');
  res.json({ ok: true });
}

/** إعادة بيانات العرض التجريبية: حذف بيانات العمل وإعادة زرع البيانات الأولية. */
export function resetDemo(req: Request, res: Response): void {
  transaction(() => {
    run('DELETE FROM borrowing_items');
    run('DELETE FROM borrowing_sessions');
    run('DELETE FROM qc_checks');
    run('DELETE FROM schedules');
    run('DELETE FROM inventory');
    run('DELETE FROM experiments');
    run('DELETE FROM lab_rooms');
  });
  seed();
  logActivity((req as AuthedRequest).currentUser, 'إعادة تهيئة البيانات', 'استعادة بيانات العرض التجريبية');
  logger.warn('إعادة تهيئة البيانات التجريبية', { by: (req as AuthedRequest).currentUser?.username });
  res.json({ ok: true });
}

/** مسح كل بيانات العمل (بداية جديدة) — تبقی الحسابات والترخيص والهوية. */
export function wipeData(req: Request, res: Response): void {
  transaction(() => {
    run('DELETE FROM borrowing_items');
    run('DELETE FROM borrowing_sessions');
    run('DELETE FROM qc_checks');
    run('DELETE FROM schedules');
    run('DELETE FROM inventory');
    run('DELETE FROM experiments');
    run('DELETE FROM lab_rooms');
  });
  clearActivity();
  logActivity((req as AuthedRequest).currentUser, 'مسح كل البيانات', 'بداية جديدة');
  logger.warn('مسح كل بيانات العمل', { by: (req as AuthedRequest).currentUser?.username });
  res.json({ ok: true });
}

/** قائمة النسخ الاحتياطية (admin). */
export function backups(_req: Request, res: Response): void {
  res.json({
    backups: listBackups().map((backup) => ({
      file: basename(backup.file),
      size: backup.size,
      createdAt: backup.createdAt,
    })),
  });
}

/** إنشاء نسخة احتياطية جديدة (admin). */
export function makeBackup(_req: Request, res: Response): void {
  const info = createBackup();
  res.status(201).json({
    backup: { file: basename(info.file), size: info.size, createdAt: info.createdAt },
  });
}

/** تنزيل نسخة احتياطية (admin) — اسم الملف فقط، دون مسارات. */
export function downloadBackup(req: Request, res: Response): void {
  const name = basename(String(req.params.file || ''));
  if (!name.endsWith('.sqlite')) {
    res.status(400).json({ error: 'ملف نسخة احتياطية غير صالح' });
    return;
  }
  const path = join(BACKUP_DIR, name);
  if (!existsSync(path)) {
    res.status(404).json({ error: 'النسخة الاحتياطية غير موجودة' });
    return;
  }
  res.download(path, name);
}

/** قائمة التراخيص المولّدة (admin). */
export function listLicenseKeys(_req: Request, res: Response): void {
  res.json({ licenses: listLicenses() });
}

/** توليد ترخيص جديد (admin). */
export function generateLicenseKey(req: Request, res: Response): void {
  const body = req.body as { type?: string; duration_days?: number; install_id?: string };
  const type = body.type === 'annual' ? 'annual' : body.type === 'permanent' ? 'permanent' : 'trial';
  const duration = Number(body.duration_days ?? 0);
  // رقم التثبيت يجعل المفتاح صالحاً على ذلك التثبيت فقط (حماية من النسخ).
  const installId = String(body.install_id ?? '').trim();
  if (installId && !/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/i.test(installId)) {
    res.status(400).json({ error: 'رقم التثبيت يجب أن يكون بصيغة XXXX-XXXX-XXXX-XXXX' });
    return;
  }
  const record = generateLicense(type, duration, installId || undefined);
  logActivity(
    (req as AuthedRequest).currentUser,
    'توليد ترخيص',
    installId ? `مرتبط بالتثبيت ${installId.toUpperCase()}` : 'غير مرتبط بجهاز',
  );
  res.status(201).json({ license: record });
}

/** تصدير ترخيص (license file) كـ JSON (admin) — للتسليم إلى زبون. */
export function exportLicenseKey(req: Request, res: Response): void {
  const key = String(req.params.key || '').trim();
  if (!key) {
    res.status(400).json({ error: 'أدخل مفتاح الترخيص' });
    return;
  }
  const record = (listLicenses() as any[]).find((r) => String(r.key).toUpperCase() === key.toUpperCase());
  if (!record) {
    res.status(404).json({ error: 'الترخيص غير موجود' });
    return;
  }
  res.setHeader('Content-Disposition', `attachment; filename="license-${key.replace(/[^A-Z0-9]/gi, '')}.json"`);
  res.json({ license: record });
}

/** استيراد ترخيص موقّع (license file) إلى سجل هذا التثبيت (admin). */
export function importLicenseKey(req: Request, res: Response): void {
  const body = req.body as { license?: Record<string, unknown> };
  const license = body.license as any;
  if (!license || typeof license !== 'object') {
    res.status(400).json({ error: 'بيانات ترخيص غير صالحة' });
    return;
  }
  const result = importLicense(license);
  if (!result.ok) {
    res.status(400).json({ error: result.reason || 'فشل استيراد الترخيص' });
    return;
  }
  logActivity((req as AuthedRequest).currentUser, 'استيراد ترخيص', String(license.key ?? '').slice(0, 12));
  res.json({ ok: true });
}

/** إلغاء ترخيص مولّد (admin). */
export function revokeLicenseKey(req: Request, res: Response): void {
  const body = req.body as { key?: string };
  const key = String(body.key ?? '').trim();
  if (!key) {
    res.status(400).json({ error: 'أدخل مفتاح الترخيص' });
    return;
  }
  const ok = revokeLicense(key);
  if (!ok) {
    res.status(404).json({ error: 'الترخيص غير موجود' });
    return;
  }
  res.json({ ok: true });
}
