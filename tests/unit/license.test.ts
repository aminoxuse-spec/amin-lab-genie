import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'amin-lab-license-test-'));
process.env.DATA_DIR = dataDir;
process.env.BACKUP_DIR = join(dataDir, 'backups');
process.env.DB_PATH = join(dataDir, 'test.sqlite');
process.env.APP_SECRET = 'test-secret';
delete process.env.TRIAL_DAYS;

const license = await import('../../server/src/utils/license.ts');
const { setSettings } = await import('../../server/src/models/Setting.ts');

test.after(() => {
  rmSync(dataDir, { recursive: true, force: true });
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
