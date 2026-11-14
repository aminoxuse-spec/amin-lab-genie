import { createHmac, randomBytes } from 'node:crypto';
import { DEFAULT_SECRET, SECRET, TRIAL_DAYS } from '../config.ts';
import { allSettings, setSettings } from '../models/Setting.ts';

export type LicenseRecord = {
  key: string;
  type: 'trial' | 'permanent' | 'annual';
  durationDays: number;
  createdAt: string;
  expiresAt: string;
  usedAt: string;
};

export type LicenseState = {
  active: boolean;
  trial: boolean;
  key: string;
  activatedAt: string;
  expiresAt: string;
  expired: boolean;
  trialStartedAt: string;
  trialEndsAt: string;
  trialDaysLeft: number;
  locked: boolean;
};

/**
 * ترخيص محلي دون اتصال: مفتاح مشتق من APP_SECRET عبر HMAC-SHA256.
 * يُولَّد بواسطة `npm run license` (scripts/make-license.mjs) ويُدخل من الإعدادات.
 * المفتاح المشتق لا يُقبل إلا إذا ضُبط APP_SECRET، حتى لا يُستخرج من الكود الافتراضي.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TRIAL_START_KEY = 'license.trial_started_at';
const REGISTRY_KEY = 'licenses.registry';

export function licenseKey(): string {
  const digest = createHmac('sha256', SECRET).update('amin-lab-license-v1').digest();
  let raw = '';
  for (let index = 0; index < 16; index += 1) {
    raw += ALPHABET[digest[index] % ALPHABET.length];
  }
  return raw.match(/.{4}/g)!.join('-');
}

function derivedKeyAllowed(): boolean {
  return SECRET !== DEFAULT_SECRET;
}

function normalize(key: string): string {
  return String(key || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** يبدأ عدّاد التجربة عند أول تشغيل ويُحفظ في قاعدة البيانات. */
function ensureTrialStart(): string {
  const settings = allSettings();
  const existing = settings[TRIAL_START_KEY];
  if (existing) return existing;
  const startedAt = new Date().toISOString();
  setSettings({ [TRIAL_START_KEY]: startedAt });
  return startedAt;
}

export function licenseStatus(): LicenseState {
  const settings = allSettings();
  const key = settings['license.key'] ?? '';
  const expiresAt = settings['license.expires_at'] ?? '';
  const validKey = isValidLicense(key);
  const expired = Boolean(expiresAt) && new Date(expiresAt).getTime() < Date.now();
  const active = validKey && !expired;

  const trialStartedAt = ensureTrialStart();
  const trialEndsAt = new Date(
    new Date(trialStartedAt).getTime() + TRIAL_DAYS * 86400000,
  ).toISOString();
  const trialDaysLeft = Math.max(
    0,
    Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000),
  );
  const trialOver = trialDaysLeft <= 0;

  return {
    active,
    trial: !active,
    key: active ? key : '',
    activatedAt: settings['license.activated_at'] ?? '',
    expiresAt,
    expired,
    trialStartedAt,
    trialEndsAt,
    trialDaysLeft,
    locked: !active && trialOver,
  };
}

export function deactivateLicense(): void {
  setSettings({ 'license.key': '', 'license.activated_at': '', 'license.expires_at': '' });
}

function readRegistry(): LicenseRecord[] {
  try {
    const raw = allSettings()[REGISTRY_KEY] ?? '[]';
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRegistry(records: LicenseRecord[]): void {
  setSettings({ [REGISTRY_KEY]: JSON.stringify(records) });
}

export function listLicenses(): LicenseRecord[] {
  return readRegistry();
}

export function generateLicense(type: LicenseRecord['type'], durationDays: number): LicenseRecord {
  const days = type === 'annual' ? (durationDays > 0 ? durationDays : 365) : 0;
  const record: LicenseRecord = {
    key: generateLicenseKey(),
    type,
    durationDays: days,
    createdAt: new Date().toISOString(),
    expiresAt: '',
    usedAt: '',
  };
  const records = readRegistry();
  records.unshift(record);
  writeRegistry(records);
  return record;
}

function generateLicenseKey(): string {
  const digest = randomBytes(16);
  let raw = '';
  for (let index = 0; index < 16; index += 1) {
    raw += ALPHABET[digest[index] % ALPHABET.length];
  }
  return raw.match(/.{4}/g)!.join('-');
}

export function findLicense(key: string): LicenseRecord | undefined {
  const normalized = normalize(key);
  return readRegistry().find((record) => normalize(record.key) === normalized);
}

export function revokeLicense(key: string): boolean {
  const normalized = normalize(key);
  const records = readRegistry();
  const next = records.filter((record) => normalize(record.key) !== normalized);
  if (next.length === records.length) return false;
  writeRegistry(next);
  return true;
}

export function isValidLicense(key: string): boolean {
  const normalized = normalize(key);
  if (!normalized) return false;
  if (derivedKeyAllowed() && normalized === normalize(licenseKey())) return true;
  const record = findLicense(key);
  if (!record) return false;
  if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) return false;
  return true;
}

export function activateLicense(input: string, expiresAt?: string): boolean {
  if (!isValidLicense(input)) return false;
  const record = findLicense(input);
  const computedExpires =
    expiresAt ??
    (record && record.type === 'annual'
      ? new Date(Date.now() + (record.durationDays || 365) * 86400000).toISOString()
      : record?.expiresAt ?? '');
  setSettings({
    'license.key': input,
    'license.activated_at': new Date().toISOString(),
    'license.expires_at': computedExpires,
  });
  if (record && !record.usedAt) {
    record.usedAt = new Date().toISOString();
    record.expiresAt = computedExpires;
    const records = readRegistry().map((item) =>
      normalize(item.key) === normalize(input) ? record : item,
    );
    writeRegistry(records);
  }
  return true;
}
