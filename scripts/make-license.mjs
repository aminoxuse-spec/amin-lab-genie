#!/usr/bin/env node
/**
 * توليد مفتاح ترخيص لـ Amin-Lab -Pro🔬.
 *
 *   npm run license                              # مفتاح عام (غير مرتبط بجهاز)
 *   npm run license -- --install-id XXXX-XXXX-XXXX-XXXX
 *
 * المفتاح المرتبط برقم تثبيت لا يعمل إلا على التثبيت الذي يحمل ذلك الرقم،
 * لأن الخادم يعيد اشتقاقه من رقم التثبيت المحلي. اطلب من الزبون إرسال
 * «رقم التثبيت» الظاهر في: الإعدادات ← الترخيص.
 */
import { installKeyFor, licenseKey } from '../server/src/utils/license.ts';

const args = process.argv.slice(2);
const idIndex = args.indexOf('--install-id');
const installId = idIndex >= 0 ? String(args[idIndex + 1] ?? '').trim() : '';

if (idIndex >= 0 && !/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/i.test(installId)) {
  console.error('✗ رقم التثبيت يجب أن يكون بصيغة XXXX-XXXX-XXXX-XXXX (مثال: 7607-BB57-A39A-420C)');
  process.exit(1);
}

console.log('=== Amin-Lab -Pro🔬 — مفتاح الترخيص ===');
console.log(
  'السر المستعمل:',
  process.env.APP_SECRET ? 'مخصص (APP_SECRET)' : 'الافتراضي — يُنصح بضبط APP_SECRET في الإنتاج',
);

if (installId) {
  console.log('مرتبط برقم التثبيت:', installId.toUpperCase());
  console.log('المفتاح:', installKeyFor(installId));
  console.log('لن يعمل هذا المفتاح على أي تثبيت آخر.');
} else {
  console.log('غير مرتبط بجهاز — يعمل على أي تثبيت بنفس APP_SECRET.');
  console.log('المفتاح:', licenseKey());
}

console.log('أدخله في: الإعدادات ← الترخيص ثم اضغط «تفعيل».');
