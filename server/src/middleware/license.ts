import type { RequestHandler } from 'express';
import { licenseStatus } from '../utils/license.ts';

/**
 * يمنع الوصول إلى واجهات العمل بعد انتهاء الفترة التجريبية أو الترخيص.
 * تبقى مسارات الدخول والإعدادات (تفعيل الترخيص) مفتوحة دائماً.
 */
export const requireLicense: RequestHandler = (_req, res, next) => {
  const status = licenseStatus();
  if (!status.locked) {
    next();
    return;
  }

  res.status(403).json({
    error: status.expired
      ? 'انتهت صلاحية الترخيص. أدخل مفتاحاً جديداً من الإعدادات ← الترخيص.'
      : 'انتهت الفترة التجريبية. فعّل الترخيص من الإعدادات للمتابعة.',
    code: status.expired ? 'LICENSE_EXPIRED' : 'TRIAL_EXPIRED',
    trialEndsAt: status.trialEndsAt,
    expiresAt: status.expiresAt,
  });
};
