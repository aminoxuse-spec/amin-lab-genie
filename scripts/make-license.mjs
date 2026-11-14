#!/usr/bin/env node
/**
 * توليد مفتاح ترخيص لـ Amin-Lab -Pro🔬.
 * الاستعمال: npm run license
 * المفتاح مشتق من APP_SECRET (نفس السر المستعمل في الخادم).
 */
import { licenseKey } from '../server/src/utils/license.ts';

console.log('=== Amin-Lab -Pro🔬 — مفتاح الترخيص ===');
console.log(
  'السر المستعمل:',
  process.env.APP_SECRET ? 'مخصص (APP_SECRET)' : 'الافتراضي — يُنصح بضبط APP_SECRET في الإنتاج',
);
console.log('المفتاح:', licenseKey());
console.log('أدخله في: الإعدادات ← الترخيص ثم اضغط «تفعيل».');
