import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'amin-lab-license-test-'));
// خزنة ربط الجهاز في مجلد مؤقت: الملف الحقيقي خارج مجلد التطبيق في ProgramData
const vaultDir = mkdtempSync(join(tmpdir(), 'amin-lab-vault-test-'));
process.env.DATA_DIR = dataDir;
process.env.BACKUP_DIR = join(dataDir, 'backups');
process.env.DB_PATH = join(dataDir, 'test.sqlite');
process.env.APP_SECRET = 'test-secret';
process.env.AMIN_LAB_VAULT_DIR = vaultDir;
delete process.env.TRIAL_DAYS;

const license = await import('../../server/src/utils/license.ts');
const { setSettings, allSettings } = await import('../../server/src/models/Setting.ts');
const { db } = await import('../../server/src/db.ts');
const vaultFile = join(vaultDir, 'license-bindings.json');
const privKeyPath = join(process.cwd(), 'keys', 'license-private.key');
const HAS_PRIV_KEY = (await import('node:fs')).existsSync(privKeyPath);

test.after(() => {
  // Close SQLite first: on Windows an open handle blocks removing the folder.
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(vaultDir, { recursive: true, force: true });
});

test('الفترة التجريبية تبدأ عند أول تشغيل وتكون 30 يوماً', () => {
  const status = license.licenseStatus();
  assert.equal(status.trial, true);
  assert.equal(status.locked, false);
  assert.equal(status.trialDaysLeft, 30);
  assert.ok(status.trialEndsAt);
});

test('الفترة التجريبية المنتهية تقفل التطبيق', () => {
  setSettings({
    'license.trial_started_at': new Date(Date.now() - 40 * 86400000).toISOString(),
    'license.key': '',
    'license.expires_at': '',
  });
  const status = license.licenseStatus();
  assert.equal(status.locked, true);
  assert.equal(status.trialDaysLeft, 0);
  assert.equal(status.trial, true);
});

test('مفتاح مولّد دائم يُفعّل الترخيص ويرفع القفل', () => {
  const record = license.generateLicense('permanent', 0);
  assert.match(record.key, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
  assert.equal(license.isValidLicense(record.key), true);
  assert.equal(license.activateLicense(record.key), true);

  const status = license.licenseStatus();
  assert.equal(status.active, true);
  assert.equal(status.trial, false);
  assert.equal(status.locked, false);
});

test('إبطال المفتاح يجعله غير صالح', () => {
  const record = license.generateLicense('annual', 30);
  assert.equal(license.isValidLicense(record.key), true);
  assert.equal(license.revokeLicense(record.key), true);
  assert.equal(license.isValidLicense(record.key), false);
  assert.equal(license.revokeLicense(record.key), false);
});

test('الترخيص السنوي ينتهي بعد المدة المحددة', () => {
  const record = license.generateLicense('annual', 7);
  const past = new Date(Date.now() - 86400000).toISOString();
  assert.equal(license.activateLicense(record.key, past), true);

  const status = license.licenseStatus();
  assert.equal(status.active, false);
  assert.equal(status.expired, true);
});

test('مفتاح عشوائي أو مفتاح فارغ غير صالح', () => {
  assert.equal(license.isValidLicense(''), false);
  assert.equal(license.isValidLicense('ZZZZ-ZZZZ-ZZZZ-ZZZZ'), false);
  assert.equal(license.isValidLicense('not-a-key'), false);
});

test('إلغاء التفعيل يعيد الحالة إلى تجريبية', () => {
  const record = license.generateLicense('permanent', 0);
  license.activateLicense(record.key);
  license.deactivateLicense();
  const status = license.licenseStatus();
  assert.equal(status.active, false);
  assert.equal(status.key, '');
});

test('تفعيل الترخيص يربطه ببصمة الجهاز الحالي', () => {
  const record = license.generateLicense('permanent', 0);
  assert.equal(license.activateLicense(record.key), true);

  const status = license.licenseStatus();
  assert.equal(status.active, true);
  assert.equal(status.deviceMismatch, false);
  assert.equal(status.deviceBound, true);
  assert.match(status.deviceId, /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
});

test('نسخ قاعدة البيانات إلى جهاز آخر يُبطل الترخيص', () => {
  const record = license.generateLicense('permanent', 0);
  license.activateLicense(record.key);

  // محاكاة جهاز مختلف: بصمة محفوظة لا تطابق بصمة هذا الجهاز
  setSettings({ 'license.device_id': 'FFFF-FFFF-FFFF-FFFF', 'license.device_sig': '' });

  const status = license.licenseStatus();
  assert.equal(status.deviceMismatch, true);
  assert.equal(status.active, false);
  assert.equal(status.locked, true);
  assert.equal(license.isValidLicense(record.key), false);
  assert.equal(license.activateLicense(record.key), false);
});

test('العبث ببصمة الجهاز دون توقيع صحيح يُبطل الترخيص', () => {
  license.deactivateLicense();
  const record = license.generateLicense('permanent', 0);
  assert.equal(license.activateLicense(record.key), true);
  const current = license.licenseStatus().deviceId;

  // بصمة الجهاز صحيحة لكن التوقيع مُحرَّر يدوياً
  setSettings({ 'license.device_sig': 'not-a-valid-signature' });

  const status = license.licenseStatus();
  assert.equal(status.deviceId, current);
  assert.equal(status.deviceMismatch, true);
  assert.equal(status.active, false);

  license.deactivateLicense();
  assert.equal(license.licenseStatus().deviceMismatch, false);
});

test('حذف صف الربط من قاعدة بيانات هذا الجهاز يُستعاد من خزنة الجهاز', () => {
  license.deactivateLicense();
  const record = license.generateLicense('permanent', 0);
  assert.equal(license.activateLicense(record.key), true);

  // حذف صفوف الربط من قاعدة البيانات فقط (كما يفعل من يفتح SQLite ويحذف الصف)
  setSettings({ 'license.device_id': '', 'license.device_sig': '' });
  const status = license.licenseStatus();

  // الخزنة خارج مجلد التطبيق تشهد أن المفتاح لهذا الجهاز ⇒ يُستعاد الربط
  assert.equal(status.deviceMismatch, false);
  assert.equal(status.deviceBound, true);
  assert.equal(status.active, true);
  assert.equal(status.locked, false);
  assert.equal(allSettings()['license.device_id'], status.deviceId);
});

// آخر اختبار في الملف: يزيل الخزنة ويحاكي نسخة منقولة إلى حاسوب آخر.
test('نسخة منسوخة بلا خزنة لا تُربط تلقائياً ولا تُعاد إلى العمل', () => {
  license.deactivateLicense();
  const record = license.generateLicense('permanent', 0);
  assert.equal(license.activateLicense(record.key), true);
  assert.equal(license.licenseStatus().active, true);

  // النسخة المنسوخة لا تحمل خزنة الجهاز، وصاحبها حذف صفوف الربط من القاعدة
  rmSync(vaultFile, { force: true });
  setSettings({ 'license.device_id': '', 'license.device_sig': '' });

  const status = license.licenseStatus();
  assert.equal(status.deviceMismatch, true);
  assert.equal(status.active, false);
  assert.equal(status.locked, true);
  assert.equal(status.deviceBound, false);
  // ولا تنفع إعادة إدخال المفتاح نفسه: التفعيل السابق مذكور والخزنة غائبة
  assert.equal(license.activateLicense(record.key), false);
  assert.equal(license.licenseStatus().active, false);
});

test('ترخيص جديد يُفعّل على نسخة أُعيد تثبيتها بلا خزنة', () => {
  license.deactivateLicense();
  rmSync(vaultFile, { force: true });
  const oldRecord = license.generateLicense('permanent', 0);
  assert.equal(license.activateLicense(oldRecord.key), true);

  // إعادة تثبيت/نسخة: لا خزنة ولا صفوف ربط، لكن التفعيل السابق ما زال في القاعدة
  rmSync(vaultFile, { force: true });
  setSettings({ 'license.device_id': '', 'license.device_sig': '' });
  assert.equal(license.licenseStatus().deviceMismatch, true);

  // الزبون يشتري ترخيصاً جديداً لهذا الجهاز: يُقبل رغم غياب الخزنة
  const replacement = license.generateLicense('permanent', 0);
  assert.equal(license.isValidLicense(replacement.key), true);
  assert.equal(license.activateLicense(replacement.key), true);
  const status = license.licenseStatus();
  assert.equal(status.active, true);
  assert.equal(status.deviceMismatch, false);
  assert.equal(status.deviceBound, true);
});

test('إعادة تفعيل الترخيص السنوي لا تمدّد تاريخ انتهائه', () => {
  license.deactivateLicense();
  const record = license.generateLicense('annual', 30);
  assert.equal(license.activateLicense(record.key), true);
  const firstExpiry = license.licenseStatus().expiresAt;
  assert.ok(firstExpiry);

  // إلغاء التفعيل ثم إعادة التفعيل بالمفتاح نفسه لا يمنح مدة جديدة
  license.deactivateLicense();
  assert.equal(license.activateLicense(record.key), true);
  assert.equal(license.licenseStatus().expiresAt, firstExpiry);
});

const maybeTest = HAS_PRIV_KEY ? test : test.skip;
maybeTest('توليد ترخيص يوقّعه بـ Ed25519 عندما يتوفر المفتاح الخاص', () => {
  license.deactivateLicense();
  const record = license.generateLicense('permanent', 0);
  // المفتاح الخاص موجود في بيئة الاختبار ⇒ sig موجود
  assert.ok(record.sig, 'expected sig on generated license');
  assert.equal(typeof record.sig, 'string');
  assert.ok(record.sig.length > 0);
});

maybeTest('importLicense يقبل ترخيصاً موقّعاً (sig صحيح)', () => {
  license.deactivateLicense();
  const record = license.generateLicense('permanent', 0);
  // simulate a fresh install: remove from registry by revoking, then import
  license.revokeLicense(record.key);
  const result = license.importLicense(record);
  assert.equal(result.ok, true);
  assert.equal(license.isValidLicense(record.key), true);
});

test('importLicense يرفض ترخيصاً unsigned (الافتراضي production-safe)', () => {
  delete process.env.LICENSE_ALLOW_UNSIGNED;
  const unsigned = {
    key: 'AAAA-BBBB-CCCC-DDDD',
    type: 'permanent' as const,
    durationDays: 0,
    createdAt: new Date().toISOString(),
    expiresAt: '',
    usedAt: '',
  };
  const result = license.importLicense(unsigned);
  assert.equal(result.ok, false);
  assert.match(result.reason || '', /unsigned/i);
});

maybeTest('importLicense يرفض توقيعاً Ed25519 مُحرَّفاً', () => {
  license.deactivateLicense();
  const record = license.generateLicense('permanent', 0);
  license.revokeLicense(record.key);
  const tampered = { ...record, sig: Buffer.from('a'.repeat(64), 'hex').toString('base64') };
  // ensure length-ish valid base64; use a clearly wrong sig
  tampered.sig = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
  const result = license.importLicense(tampered);
  assert.equal(result.ok, false);
  assert.match(result.reason || '', /توقيع/i);
});

test('importLicense يرفض ترخيصاً مرتبطاً بجهاز آخر', () => {
  license.deactivateLicense();
  const record = license.generateLicense('permanent', 0, '1111-2222-3333-4444');
  license.revokeLicense(record.key);
  const result = license.importLicense(record);
  assert.equal(result.ok, false);
  assert.match(result.reason || '', /جهاز/i);
});
