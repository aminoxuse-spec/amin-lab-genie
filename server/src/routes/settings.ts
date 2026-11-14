import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.ts';
import { validateBody } from '../middleware/validation.ts';
import {
  activate,
  deactivate,
  generateLicenseKey,
  info,
  institution,
  license,
  listLicenseKeys,
  revokeLicenseKey,
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
  }),
  updateInstitutionInfo,
);

export default router;
