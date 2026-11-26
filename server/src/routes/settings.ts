import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.ts';
import { validateBody } from '../middleware/validation.ts';
import {
  activate,
  activity,
  backups,
  clearLog,
  deactivate,
  downloadBackup,
  makeBackup,
  resetDemo,
  wipeData,
  generateLicenseKey,
  info,
  institution,
  license,
  listLicenseKeys,
  revokeLicenseKey,
  importLicenseKey,
  exportLicenseKey,
  updateInstitutionInfo,
} from '../controllers/settingsController.ts';

const router = Router();

router.get('/', requireAuth, info);

router.get('/license', requireAuth, license);
router.put(
  '/license',
  requireAuth,
  requireAdmin,
  validateBody({
    key: { type: 'string', required: true, minLength: 4, maxLength: 40 },
    duration_days: { type: 'number', min: 0, max: 36500 },
  }),
  activate,
);
router.delete('/license', requireAuth, requireAdmin, deactivate);

router.get('/activity', requireAuth, requireAdmin, activity);
router.delete('/activity', requireAuth, requireAdmin, clearLog);
router.post('/reset-demo', requireAuth, requireAdmin, resetDemo);
router.post('/wipe', requireAuth, requireAdmin, wipeData);

router.get('/backups', requireAuth, requireAdmin, backups);
router.post('/backups', requireAuth, requireAdmin, makeBackup);
router.get('/backups/:file', requireAuth, requireAdmin, downloadBackup);

router.get('/licenses', requireAuth, requireAdmin, listLicenseKeys);
router.post(
  '/licenses',
  requireAuth,
  requireAdmin,
  validateBody({ type: { type: 'string', required: true, minLength: 3, maxLength: 20 } }),
  generateLicenseKey,
);
router.post(
  '/licenses/revoke',
  requireAuth,
  requireAdmin,
  validateBody({ key: { type: 'string', required: true, minLength: 4, maxLength: 40 } }),
  revokeLicenseKey,
);
router.post('/licenses/import', requireAuth, requireAdmin, importLicenseKey);
router.get('/licenses/:key/export', requireAuth, requireAdmin, exportLicenseKey);

// متاح قبل تسجيل الدخول: تحتاجه صفحة الدخول لعرض شعار المؤسسة
router.get('/institution', institution);

router.put(
  '/institution',
  requireAuth,
  requireAdmin,
  validateBody({
    name: { type: 'string', maxLength: 160, allowEmpty: true },
    name_fr: { type: 'string', maxLength: 160, allowEmpty: true },
    logo: { type: 'string', maxLength: 400_000, allowEmpty: true },
    logo_in_print: { type: 'boolean' },
    signature_lab: { type: 'string', maxLength: 120, allowEmpty: true },
    signature_lab_fr: { type: 'string', maxLength: 120, allowEmpty: true },
    signature_counselor: { type: 'string', maxLength: 120, allowEmpty: true },
    signature_counselor_fr: { type: 'string', maxLength: 120, allowEmpty: true },
    signature_director: { type: 'string', maxLength: 120, allowEmpty: true },
    signature_director_fr: { type: 'string', maxLength: 120, allowEmpty: true },
    app_name: { type: 'string', maxLength: 60, allowEmpty: true },
    language: { type: 'string', maxLength: 5 },
    primary_color: { type: 'string', maxLength: 9 },
  }),
  updateInstitutionInfo,
);

export default router;
