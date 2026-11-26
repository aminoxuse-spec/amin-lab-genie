import type { RequestHandler } from 'express';
import { licenseStatus } from '../utils/license.ts';

/**
 * يمنع الوصول إلى واجهات العمل بعد انتهاء الفترة التجريبية أو الترخيص.
 * تبقى مسارات الدخول والإعدادات (تفعيل الترخيص) مفتوحة دائماً.
 */
export const requireLicense: RequestHandler = (_req, res, next) => {
  const status = licenseStatus();

  // ترخيص مربوط بجهاز آخر = نسخة منسوخة من حاسوب مختلف.
  if (status.deviceMismatch) {
    res.status(403).json({
      error:
        'هذا الترخيص غير مُفعّل على هذا الجهاز (مربوط بجهاز آخر أو نسخة منقولة). ' +
        'النسخة المنسوخة لا تعمل — فعّل مفتاحاً جديداً لهذا الجهاز.',
      code: 'LICENSE_DEVICE_MISMATCH',
      deviceId: status.deviceId,
    });
    return;
  }

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
