#!/usr/bin/env node
/**
 * تجهيز مجلد `deliveries/` بحزمتين جاهزتين:
 *
 *   deliveries/sale/    نسخة قابلة للبيع (بدون مفتاح ترخيص)
 *   deliveries/office/  نسخة عمل خاصة بك (مع مفتاح ترخيص عام)
 *   deliveries/mobile/  أحدث تطبيق أندرويد + تعليمات الربط
 *
 * كل حزمة تحتوي كل ما تحتاجه للتشغيل على Windows دون إنترنت ودون تثبيت Node.js.
 * التشغيل:  node scripts/make-deliveries.mjs
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { writeZipArchive, zipDirectory } from './lib/zip.mjs';

const ROOT = process.cwd();
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const VERSION = PKG.version;
const STAMP = new Date().toISOString().slice(0, 10);
const DELIVERIES = join(ROOT, 'deliveries');
const SALE_NAME = `Amin-Lab-Genie-${VERSION}-${STAMP}`;
const OFFICE_NAME = `Amin-Lab-Genie-Office-${VERSION}-${STAMP}`;

const log = (message) => console.log(message);
const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

/* ------------------------------------------------------------------ */
/* نسخ الملفات                                                         */
/* ------------------------------------------------------------------ */

function copy(source, target) {
  if (!existsSync(source)) {
    log(`  - تخطّي (غير موجود): ${relative(ROOT, source)}`);
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true, force: true });
}

function requirePath(path) {
  if (!existsSync(join(ROOT, path))) fail(`ملف مطلوب غير موجود: ${path}`);
}

/** يبني هيكل الحزمة القابلة للتشغيل داخل مجلد الهدف. */
function assemble(target) {
  for (const path of [
    'installer/runtime',
    'installer/vendor/node_modules',
    'server/dist',
    'client/src',
  ]) {
    requirePath(path);
  }

  copy(join(ROOT, 'installer/runtime'), join(target, 'runtime'));
  copy(join(ROOT, 'installer/vendor/node_modules'), join(target, 'node_modules'));
  copy(join(ROOT, 'server/dist'), join(target, 'server/dist'));
  copy(join(ROOT, 'server/package.json'), join(target, 'server/package.json'));
  copy(join(ROOT, 'client/src'), join(target, 'client/src'));
  copy(join(ROOT, 'package.json'), join(target, 'package.json'));
  copy(join(ROOT, 'package-lock.json'), join(target, 'package-lock.json'));
  copy(join(ROOT, 'installer/.env.production'), join(target, '.env'));
  copy(join(ROOT, 'installer/launch.cmd'), join(target, 'Amin-Lab -Pro.cmd'));
  copy(join(ROOT, 'installer/app.ico'), join(target, 'app.ico'));
  copy(join(ROOT, 'installer/verify-install.cmd'), join(target, 'installer/verify-install.cmd'));
  copy(join(ROOT, 'README-FIRST.txt'), join(target, 'README-FIRST.txt'));
  copy(join(ROOT, 'README.md'), join(target, 'README.md'));
  copy(join(ROOT, 'LICENSE.txt'), join(target, 'LICENSE.txt'));
  copy(join(ROOT, 'docs'), join(target, 'docs'));
  copy(
    join(ROOT, 'SETUP-GUIDE-AR-FR-EN.pdf'),
    join(target, 'SETUP-GUIDE-AR-FR-EN.pdf'),
  );

  mkdirSync(join(target, 'data', 'backups'), { recursive: true });
  writeFileSync(join(target, 'data', '.keep'), '');
}

/* ------------------------------------------------------------------ */
/* مفتاح ترخيص نسخة العمل                                              */
/* ------------------------------------------------------------------ */

function readSecret(envPath) {
  const text = readFileSync(envPath, 'utf8');
  const match = text.match(/^\s*APP_SECRET\s*=\s*(.*)$/m);
  return match ? match[1].trim() : '';
}

function generateOfficeKey() {
  const secret = readSecret(join(ROOT, 'installer/.env.production'));
  if (!secret) fail('APP_SECRET غير مضبوط في installer/.env.production');

  const output = execFileSync(process.execPath, [join(ROOT, 'scripts/make-license.mjs')], {
    cwd: ROOT,
    env: { ...process.env, APP_SECRET: secret },
    encoding: 'utf8',
  });
  const match = output.match(/[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}/);
  if (!match) fail('تعذّر توليد مفتاح الترخيص');
  return match[0];
}

/* ------------------------------------------------------------------ */
/* ZIP قياسي (UTF-8) — الكاتب المشترك في scripts/lib/zip.mjs           */
/* ------------------------------------------------------------------ */

function writeZip(directory, outputPath) {
  const name = outputPath.replace(/\.zip$/i, '').split(/[\\/]/).pop();
  const archive = zipDirectory(directory, name);
  const { size } = writeZipArchive(outputPath, archive);
  log(`  → ${relative(ROOT, outputPath)} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

/* ------------------------------------------------------------------ */
/* تشغيل                                                               */
/* ------------------------------------------------------------------ */

rmSync(DELIVERIES, { recursive: true, force: true });
mkdirSync(DELIVERIES, { recursive: true });

/* 1) نسخة البيع */
const saleDir = join(DELIVERIES, 'sale', SALE_NAME);
log('• نسخة البيع');
assemble(saleDir);
writeFileSync(
  join(saleDir, 'SALE-GUIDE-AR.txt'),
  [
    'Amin-Lab -Pro🔬 — نسخة البيع',
    '============================',
    '',
    'هذه الحزمة جاهزة للتسليم إلى زبون جديد. تعمل لمدة 30 يوماً تجريبياً،',
    'ثم تتوقف حتى يُدخل مفتاح الترخيص من: الإعدادات ← الترخيص.',
    '',
    'خطوات التسليم للزبون:',
    '1) انسخ المجلد كاملاً إلى حاسوب الزبون (أو أرسل ملف ZIP).',
    '2) شغّل «Amin-Lab -Pro.cmd» ثم افتح http://localhost:3000',
    '3) أول دخول: كلمة مرور admin في data/first-run-credentials.txt',
    '4) يرسل لك الزبون «رقم التثبيت» من الإعدادات ← الترخيص.',
    '5) ولّد مفتاحاً مرتبطاً بهذا الرقم على حاسوبك:',
    '   npm run license -- --install-id XXXX-XXXX-XXXX-XXXX',
    '   ثم أرسل المفتاح للزبون ليدخله في نفس الصفحة.',
    '',
    'تنبيهات:',
    '- لا ترسل قيمة APP_SECRET في محادثة ولا ترفعها إلى GitHub؛ كل حزمة تحتوي .env الخاص بها.',
    '- الترخيص مرتبط ببصمة الجهاز؛ نسخ مجلد التطبيق إلى حاسوب آخر لا ينقل الترخيص.',
    '- قاعدة بيانات كل زبون تُنشأ في مجلد data/ عند أول تشغيل.',
    '',
  ].join('\r\n'),
);
writeZip(saleDir, join(DELIVERIES, 'sale', `${SALE_NAME}.zip`));

/* 2) نسخة العمل */
const officeDir = join(DELIVERIES, 'office', OFFICE_NAME);
log('• نسخة العمل');
assemble(officeDir);
const officeKey = generateOfficeKey();
writeFileSync(
  join(officeDir, 'LICENSE-KEY-AR.txt'),
  [
    'Amin-Lab -Pro🔬 — مفتاح ترخيص نسخة العمل',
    '==========================================',
    '',
    `المفتاح: ${officeKey}`,
    '',
    'طريقة التفعيل:',
    '1) شغّل «Amin-Lab -Pro.cmd» على حاسوب المكتب.',
    '2) ادخل بحساب المدير ← الإعدادات ← الترخيص.',
    '3) الصق المفتاح واضغط «تفعيل».',
    '',
    'هذا المفتاح خاص بك — لا توزّعه مع نسخة البيع ولا ترفعه إلى GitHub.',
    'بعد التفعيل يُربط المفتاح ببصمة حاسوب المكتب، ويعمل دائماً على ذلك الجهاز.',
    '',
  ].join('\r\n'),
);
writeFileSync(
  join(officeDir, 'README-OFFICE-AR.txt'),
  [
    'نسخة المكتب — Amin-Lab -Pro🔬',
    '==============================',
    '',
    'نسخة كاملة تعمل دون إنترنت ودون تثبيت Node.js.',
    '',
    'التشغيل:',
    '1) انسخ هذا المجلد إلى حاسوب المكتب (مثلاً C:\\Amin-Lab).',
    '2) شغّل «Amin-Lab -Pro.cmd».',
    '3) افتح http://localhost:3000 في المتصفح.',
    '',
    'مهم:',
    '- لا تشغّل هذه النسخة على نفس الحاسوب الذي يعمل عليه التطبيق المثبّت',
    '  في الوقت نفسه: كلاهما يستخدم المنفذ 3000 وقاعدتي بيانات منفصلتين.',
    '- مفتاح الترخيص في LICENSE-KEY-AR.txt (فعّله من الإعدادات ← الترخيص).',
    '- لهاتف الأساتذة: شغّل الخادم واترك المنفذ 3000 مفتوحاً على الشبكة المحلية،',
    '  ثم افتح على الهاتف: http://<IP-حاسوب-المكتب>:3000/mobile/index.html',
    '',
  ].join('\r\n'),
);
writeZip(officeDir, join(DELIVERIES, 'office', `${OFFICE_NAME}.zip`));

/* 3) الهاتف */
const mobileDir = join(DELIVERIES, 'mobile');
mkdirSync(mobileDir, { recursive: true });
const apks = existsSync(join(ROOT, 'dist'))
  ? readdirSync(join(ROOT, 'dist'))
      .filter((name) => name.endsWith('.apk') && name.includes('release'))
      .map((name) => ({ name, mtime: statSync(join(ROOT, 'dist', name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
  : [];
const apk = apks[0]?.name;
if (apk) {
  copy(join(ROOT, 'dist', apk), join(mobileDir, apk));
  const checksum = createHash('sha256')
    .update(readFileSync(join(mobileDir, apk)))
    .digest('hex');
  writeFileSync(join(mobileDir, `${apk}.sha256`), `${checksum}  ${apk}\n`);
  log(`• الهاتف: ${apk}`);
}
writeFileSync(
  join(mobileDir, 'README-AR.txt'),
  [
    'تطبيق الأساتذة على الهاتف — Amin-Lab -Pro🔬',
    '============================================',
    '',
    'التطبيق غلاف يفتح واجهة الهاتف من خادم المكتب، لذلك:',
    '- قائمة العتاد والمواد في «طلب جديد» تُحمَّل مباشرة من الخادم (آخر تحديث للجرد).',
    '- أي تعديل يجريه المدير على الجرد يظهر على الهاتف فور تحديث الصفحة،',
    '  دون إعادة بناء التطبيق أو تحديثه.',
    '',
    'التثبيت:',
    '1) انقل ملف APK إلى الهاتف وثبّته (اسمح بتثبيت التطبيقات غير المعروفة).',
    '2) شغّل الخادم على حاسوب المكتب (المنفذ 3000 مفتوح على الشبكة).',
    '3) في التطبيق أدخل عنوان الخادم:',
    '   http://10.234.91.7:3000/mobile/index.html',
    '   (استبدل العنوان بـ IP حاسوب المكتب إن تغيّر: ipconfig).',
    '4) لتغيير العنوان لاحقاً: قائمة ⋮ ← تغيير الخادم.',
    '',
    'ملاحظة: واجهة الأساتذة تتيح طلب الوسائل ومتابعة الطلبات.',
    'وبحساب المدير تظهر تبويبة «الجرد» لتعديل كميات العتاد مباشرة من الهاتف.',
    '',
  ].join('\r\n'),
);
log('• الهاتف: README-AR.txt');

writeFileSync(
  join(DELIVERIES, 'README.md'),
  [
    '# مجلد التسليمات',
    '',
    '| المجلد | لمن | الترخيص |',
    '|---|---|---|',
    '| `sale/` | الزبائن | تجريبي 30 يوماً ثم مفتاح مرتبط برقم التثبيت |',
    '| `office/` | حاسوب المكتب | مفتاح دائم جاهز في `LICENSE-KEY-AR.txt` |',
    '| `mobile/` | هواتف الأساتذة | APK موقّع + تعليمات الربط |',
    '',
    `تاريخ التوليد: ${STAMP} — الإصدار ${VERSION}`,
    '',
    'كل حزمة ZIP بجانبها ملف `.sha256` للتحقق من السلامة.',
    'أعد التوليد بـ: `node scripts/make-deliveries.mjs` (يمسح هذا المجلد ويعيد بناءه).',
    '',
  ].join('\n'),
);

log('');
log('✅ تم تجهيز مجلد deliveries/');
