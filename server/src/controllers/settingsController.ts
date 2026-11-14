import type { Request, Response } from 'express';
import type { AuthedRequest } from '../middleware/auth.ts';
import { APP_NAME, APP_VERSION, DB_PATH, PORT } from '../config.ts';
import { listUsers, countUsers } from '../models/User.ts';
import { countRooms, listRooms } from '../models/LabRoom.ts';
import { inventorySummary } from '../models/Inventory.ts';
import { countOpenSessions, listSessions } from '../models/BorrowingSession.ts';
import { countChecksToday } from '../models/QCCheck.ts';
import { statusBreakdown } from '../models/QCCheck.ts';
import { getInstitution, updateInstitution } from '../models/Setting.ts';
import { activateLicense, deactivateLicense, generateLicense, isValidLicense, licenseStatus, listLicenses, revokeLicense } from '../utils/license.ts';
import { logger } from '../utils/logger.ts';

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
  activateLicense(key, expiresAt);
  logger.info('تفعيل الترخيص', { durationDays: days || 'permanent' });
  res.json({ active: true, trial: false, expiresAt: expiresAt ?? null });
}

/** إلغاء التفعيل (admin) — للاختبار أو إعادة النسخة التجريبية. */
export function deactivate(_req: Request, res: Response): void {
  deactivateLicense();
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
  };

  if (body.level !== undefined && body.level !== 'middle' && body.level !== 'secondary') {
    res.status(400).json({ error: 'مستوى المؤسسة يجب أن يكون متوسط أو ثانوي' });
    return;
  }

  if (typeof body.logo === 'string' && body.logo && !body.logo.startsWith('data:image/')) {
    res.status(400).json({ error: 'الشعار يجب أن يكون صورة (data:image/…)' });
    return;
  }

  const institution = updateInstitution({
    name: body.name,
    name_fr: body.name_fr,
    school_year: body.school_year,
    level: body.level,
    logo: body.logo,
    logo_in_print: body.logo_in_print,
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
  res.json({ institution });
}

/** قائمة التراخيص المولّدة (admin). */
export function listLicenseKeys(_req: Request, res: Response): void {
  res.json({ licenses: listLicenses() });
}

/** توليد ترخيص جديد (admin). */
export function generateLicenseKey(req: Request, res: Response): void {
  const body = req.body as { type?: string; duration_days?: number };
  const type = body.type === 'annual' ? 'annual' : body.type === 'permanent' ? 'permanent' : 'trial';
  const duration = Number(body.duration_days ?? 0);
  const record = generateLicense(type, duration);
  res.status(201).json({ license: record });
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
