import { createHmac, randomBytes, createPublicKey, createPrivateKey, sign, verify } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SECRET, LICENSE_ALLOW_UNSIGNED, SECRET, TRIAL_DAYS } from '../config.ts';
import { allSettings, ensureInstallId, setSettings } from '../models/Setting.ts';
import { deviceId } from './device.ts';
import { vaultAllowsAutoBind, vaultRecordBinding, vaultTrialStart, vaultRecordTrialStart } from './deviceVault.ts';

export type LicenseRecord = {
  key: string;
  type: 'trial' | 'permanent' | 'annual';
  durationDays: number;
  createdAt: string;
  expiresAt: string;
  usedAt: string;
  /** عند وجوده، لا يُقبل المفتاح إلا على التثبيت المطابق لهذا المعرّف. */
  installId?: string;
  /** توقيع Ed25519 (base64) على حمولة المفتاح — يمنع التزوير بدون المفتاح الخاص. */
  sig?: string;
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
  /** true إذا كان المفتاح المُفعّل مرتبطاً برقم هذا التثبيت أو ببصمة هذا الجهاز. */
  bound: boolean;
  /** بصمة الجهاز الحالي المشتقة من النظام (ليست من قاعدة البيانات). */
  deviceId: string;
  /** الترخيص مُسجّل ومُوقَّع لهذا الجهاز. */
  deviceBound: boolean;
  /** الترخيص محفوظ لجهاز آخر: نسخة منسوخة إلى حاسوب مختلف. */
  deviceMismatch: boolean;
};

/**
 * ترخيص محلي دون اتصال: مفتاح مشتق من APP_SECRET عبر HMAC-SHA256.
 * يُولَّد بواسطة `npm run license` (scripts/make-license.mjs) ويُدخل من الإعدادات.
 * المفتاح المشتق لا يُقبل إلا إذا ضُبط APP_SECRET، حتى لا يُستخرج من الكود الافتراضي.
 *
 * حماية النسخ: عند التفعيل يُربط الترخيص ببصمة الجهاز المشتقة من نظام التشغيل
 * (MachineGuid في ويندوز). البصمة تُحسب وقت التشغيل ولا تُنسخ مع قاعدة البيانات،
 * لذا نسخ مجلد التطبيق إلى حاسوب آخر يُبطل الترخيص هناك.
 *
 * ويُحفظ الربط أيضاً في خزنة على مستوى الجهاز خارج مجلد التطبيق (utils/deviceVault):
 * الربط التلقائي (استعادة ترخيص قائم) لا يحدث إلا إذا شهدت الخزنة أن هذا المفتاح
 * رُبط على هذا الجهاز، فلا يفيد حذف صفوف الربط من قاعدة بيانات منسوخة.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TRIAL_START_KEY = 'license.trial_started_at';
const REGISTRY_KEY = 'licenses.registry';
const DEVICE_ID_KEY = 'license.device_id';
const DEVICE_SIG_KEY = 'license.device_sig';
const TRIAL_DEVICE_KEY = 'license.trial_device_id';

// --- المفتاح العام Ed25519 للتحقق من التراخيص الموقّعة ---
const __dirname = dirname(fileURLToPath(import.meta.url));
let cachedPublicKey: ReturnType<typeof createPublicKey> | null = null;
function getPublicKey(): ReturnType<typeof createPublicKey> | null {
  if (cachedPublicKey) return cachedPublicKey;
  // 1) ملف بجانب المصدر (التطوير)
  const candidates = [
    resolve(__dirname, 'license-public.key'),
    resolve(process.cwd(), 'server', 'src', 'license-public.key'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      try {
        cachedPublicKey = createPublicKey(readFileSync(path, 'utf8'));
        return cachedPublicKey;
      } catch {
        // try next
      }
    }
  }
  return null;
}

function signLicensePayload(payload: string): string | undefined {
  const privPath = (process.env.LICENSE_PRIVATE_KEY_FILE ?? '').trim() || resolve(process.cwd(), 'keys', 'license-private.key');
  if (!existsSync(privPath)) return undefined;
  try {
    const privateKey = createPrivateKey(readFileSync(privPath, 'utf8'));
    return sign(null, Buffer.from(payload, 'utf8'), privateKey).toString('base64');
  } catch {
    return undefined;
  }
}

function verifyLicenseSignature(payload: string, signatureBase64: string): boolean {
  const pk = getPublicKey();
  if (!pk) return false;
  try {
    return verify(null, Buffer.from(payload, 'utf8'), pk, Buffer.from(signatureBase64, 'base64'));
  } catch {
    return false;
  }
}

function keyFromDigest(digest: Buffer): string {
  let raw = '';
  for (let index = 0; index < 16; index += 1) {
    raw += ALPHABET[digest[index] % ALPHABET.length];
  }
  return raw.match(/.{4}/g)!.join('-');
}

/** مفتاح عام لا يرتبط بجهاز (التوافق مع الإصدارات السابقة). */
export function licenseKey(): string {
  return keyFromDigest(createHmac('sha256', SECRET).update('amin-lab-license-v1').digest());
}

/**
 * مفتاح مرتبط برقم تثبيت محدد: يُسلَّم للزبون بعد إرساله رقم تثبيته،
 * ولا يعمل على أي تثبيت آخر لأن الخادم يعيد اشتقاقه من رقم التثبيت المحلي.
 */
export function installKeyFor(installId: string): string {
  const id = String(installId || '').trim().toUpperCase();
  return keyFromDigest(
    createHmac('sha256', SECRET).update(`amin-lab-license-v2:${id}`).digest(),
  );
}

function derivedKeyAllowed(): boolean {
  return SECRET !== DEFAULT_SECRET;
}

function normalize(key: string): string {
  return String(key || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function deviceSignature(key: string, device: string): string {
  return createHmac('sha256', SECRET)
    .update(`amin-lab-bind-v1:${normalize(key)}:${device.toUpperCase()}`)
    .digest('hex');
}

/**
 * حالة ارتباط الترخيص المحفوظ بالجهاز الحالي:
 * unbound = لم يُربط بعد، ok = مربوط بهذا الجهاز، mismatch = مربوط بجهاز آخر.
 */
export function deviceBinding(key: string): 'unbound' | 'ok' | 'mismatch' {
  if (!normalize(key)) return 'unbound';
  const settings = allSettings();
  // الارتباط يخصّ الترخيص المُفعّل حالياً؛ أي مفتاح آخر لم يُفعّل بعد لا يُقيَّد بجهاز.
  if (normalize(key) !== normalize(settings['license.key'] ?? '')) return 'unbound';
  const bound = (settings[DEVICE_ID_KEY] ?? '').trim().toUpperCase();
  if (!bound) return 'unbound';
  if (bound !== deviceId().toUpperCase()) return 'mismatch';
  const signature = settings[DEVICE_SIG_KEY] ?? '';
  if (signature && signature !== deviceSignature(key, bound)) return 'mismatch';
  return 'ok';
}

function bindToCurrentDevice(key: string): void {
  const device = deviceId();
  setSettings({
    [DEVICE_ID_KEY]: device,
    [DEVICE_SIG_KEY]: deviceSignature(key, device),
  });
  // الخزنة خارج مجلد التطبيق هي الشاهد الذي يمنع إعادة الربط على جهاز منسوخ.
  vaultRecordBinding(key);
}

/** يبدأ عدّاد التجربة عند أول تشغيل ويُحفظ في قاعدة البيانات، مربوطاً بأول جهاز. */
function ensureTrialStart(): string {
  const settings = allSettings();
  const current = deviceId();
  const existing = settings[TRIAL_START_KEY];
  const vaultStart = vaultTrialStart();
  // حماية من إعادة تعيين Trial: إن وُجد تاريخ أقدم في خزنة الجهاز، استخدمه.
  let chosen = existing;
  if (vaultStart && (!chosen || new Date(vaultStart).getTime() < new Date(chosen).getTime())) {
    chosen = vaultStart;
  }
  if (!chosen) {
    chosen = new Date().toISOString();
  }
  if (existing !== chosen) {
    setSettings({ [TRIAL_START_KEY]: chosen });
  }
  if (!settings[TRIAL_DEVICE_KEY]) setSettings({ [TRIAL_DEVICE_KEY]: current });
  vaultRecordTrialStart(chosen);
  return chosen;
}

export function licenseStatus(): LicenseState {
  const settings = allSettings();
  const key = (settings['license.key'] ?? '').trim();
  const expiresAt = settings['license.expires_at'] ?? '';
  const currentDevice = deviceId();

  // ربط تلقائي لمرة واحدة: الترخيص المُفعّل قبل هذا التحديث يبقى فعالاً على هذا الجهاز.
  // والربط التلقائي مشروط بخزنة الجهاز: جهاز لا يشهد له سجلُّه في الخزنة (نسخة
  // منسوخة حُذفت منها صفوف الربط) لا يُعاد ربطه، فيبقى مقفلاً.
  let binding: 'unbound' | 'ok' | 'mismatch' | 'blocked' = key ? deviceBinding(key) : 'unbound';
  if (key && binding === 'ok') {
    // تثبيت الربط القائم في خزنة الجهاز (ترحيل ترخيصات ما قبل الخزنة).
    vaultRecordBinding(key);
  } else if (key && binding === 'unbound' && keyIsKnownValid(key)) {
    if (vaultAllowsAutoBind(key)) {
      bindToCurrentDevice(key);
      binding = 'ok';
    } else {
      binding = 'blocked';
    }
  }

  const expired = Boolean(expiresAt) && new Date(expiresAt).getTime() < Date.now();
  const deviceMismatch = binding === 'mismatch' || binding === 'blocked';
  const active = keyIsKnownValid(key) && !expired && !deviceMismatch;
  const record = key ? findLicense(key) : undefined;
  const bound =
    Boolean(record?.installId) || (active && isDerivedInstallKey(key)) || binding === 'ok';

  const trialStartedAt = ensureTrialStart();
  const trialEndsAt = new Date(
    new Date(trialStartedAt).getTime() + TRIAL_DAYS * 86400000,
  ).toISOString();
  const trialDevice = (settings[TRIAL_DEVICE_KEY] ?? '').trim().toUpperCase();
  const trialOnAnotherDevice = Boolean(trialDevice) && trialDevice !== currentDevice.toUpperCase();
  const trialDaysLeft = trialOnAnotherDevice
    ? 0
    : Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000));
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
    locked: deviceMismatch || (!active && trialOver),
    bound,
    deviceId: currentDevice,
    deviceBound: binding === 'ok',
    deviceMismatch,
  };
}

function currentInstallId(): string {
  return ensureInstallId();
}

/** هل المفتاح مشتق من رقم هذا التثبيت؟ (بمعنى: لن يعمل على تثبيت آخر). */
function isDerivedInstallKey(key: string): boolean {
  if (!derivedKeyAllowed()) return false;
  return normalize(key) === normalize(installKeyFor(currentInstallId()));
}

export function deactivateLicense(): void {
  setSettings({
    'license.key': '',
    'license.activated_at': '',
    'license.expires_at': '',
    [DEVICE_ID_KEY]: '',
    [DEVICE_SIG_KEY]: '',
  });
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

export function generateLicense(
  type: LicenseRecord['type'],
  durationDays: number,
  installId?: string,
): LicenseRecord {
  const days = type === 'annual' ? (durationDays > 0 ? durationDays : 365) : 0;
  const boundTo = String(installId ?? '').trim().toUpperCase();
  const key = boundTo ? installKeyFor(boundTo) : generateLicenseKey();
  const createdAt = new Date().toISOString();
  const record: LicenseRecord = {
    key,
    type,
    durationDays: days,
    createdAt,
    expiresAt: '',
    usedAt: '',
    ...(boundTo ? { installId: boundTo } : {}),
  };
  // توقيع غير متماثل (1.6.0): إن توفر المفتاح الخاص، وقّع حمولة المفتاح.
  const payload = JSON.stringify({ key: normalize(key), type, installId: boundTo || null, days, createdAt });
  const sig = signLicensePayload(payload);
  if (sig) record.sig = sig;
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

/**
 * استيراد ترخيص موقّع (license file) إلى سجل this التثبيت.
 * يتحقق من التوقيع Ed25519 قبل الحفظ. يُستخدم لتسليم تراخيص من vendor إلى customer.
 */
export function importLicense(record: LicenseRecord): { ok: boolean; reason?: string } {
  if (!record || typeof record !== 'object') return { ok: false, reason: 'بيانات غير صالحة' };
  const key = String(record.key ?? '').trim();
  if (!key) return { ok: false, reason: 'مفتاح مفقود' };
  const normalized = normalize(key);
  if (record.installId && record.installId.toUpperCase() !== currentInstallId().toUpperCase()) {
    return { ok: false, reason: 'الترخيص مرتبط بجهاز آخر' };
  }
  // تحقق التوقيع (تراخيص 1.6.0)
  if (!record.sig) {
    if (!LICENSE_ALLOW_UNSIGNED) {
      return { ok: false, reason: 'الترخيص unsigned مرفوض (اضبط LICENSE_ALLOW_UNSIGNED=true للسماح)' };
    }
  } else {
    const payload = JSON.stringify({
      key: normalized,
      type: record.type,
      installId: record.installId ?? null,
      days: record.durationDays,
      createdAt: record.createdAt,
    });
    if (!verifyLicenseSignature(payload, record.sig)) {
      return { ok: false, reason: 'توقيع غير صالح' };
    }
  }
  const records = readRegistry();
  if (records.some((r) => normalize(r.key) === normalized)) {
    return { ok: true }; // already imported
  }
  const imported: LicenseRecord = {
    key,
    type: record.type,
    durationDays: record.durationDays,
    createdAt: record.createdAt || new Date().toISOString(),
    expiresAt: record.expiresAt || '',
    usedAt: record.usedAt || '',
    installId: record.installId,
    sig: record.sig,
  };
  records.unshift(imported);
  writeRegistry(records);
  return { ok: true };
}

export function revokeLicense(key: string): boolean {
  const normalized = normalize(key);
  const records = readRegistry();
  const next = records.filter((record) => normalize(record.key) !== normalized);
  if (next.length === records.length) return false;
  writeRegistry(next);
  return true;
}

/** التحقق من المفتاح نفسه (سجل المفاتيح، رقم التثبيت، تاريخ الانتهاء) دون النظر إلى الجهاز. */
function keyIsKnownValid(key: string): boolean {
  const normalized = normalize(key);
  if (!normalized) return false;
  if (derivedKeyAllowed() && normalized === normalize(installKeyFor(currentInstallId()))) {
    return true;
  }
  // مفتاح قديم غير مرتبط بجهاز — يبقى مقبولاً للتوافق مع تراخيص صادرة سابقاً.
  if (derivedKeyAllowed() && normalized === normalize(licenseKey())) return true;
  const record = findLicense(key);
  if (!record) return false;
  // مفتاح مرتبط برقم تثبيت آخر لا يُقبل هنا.
  if (record.installId && record.installId !== currentInstallId().toUpperCase()) return false;
  if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) return false;
  // تحقق التوقيع غير المتماثل (1.6.0) إن وُجد.
  if (record.sig) {
    const payload = JSON.stringify({ key: normalize(record.key), type: record.type, installId: record.installId ?? null, days: record.durationDays, createdAt: record.createdAt });
    if (!verifyLicenseSignature(payload, record.sig)) return false;
  }
  return true;
}

export function isValidLicense(key: string): boolean {
  if (!keyIsKnownValid(key)) return false;
  // مفتاح صالح لكنه مربوط بجهاز آخر = نسخة منسوخة.
  return deviceBinding(key) !== 'mismatch';
}

/**
 * هل يدل ما في قاعدة البيانات على تفعيل سابق لهذا المفتاح على تثبيت آخر؟
 *
 * القاعدة: مفتاح لم يُستعمل قط يُقبل على أي جهاز (ترخيص جديد للزبون أو للجهاز
 * البديل)، أما مفتاح سبق تفعيله فلا يُعاد تفعيله إلا إذا شهدت خزنة هذا الجهاز
 * أنه رُبط به — وهذا ما يمنع نسخ مجلد التطبيق ثم تفعيله على حاسوب آخر.
 */
function activatedElsewhere(key: string): boolean {
  const settings = allSettings();
  const storedKey = normalize(settings['license.key'] ?? '');
  const sameKey = Boolean(storedKey) && storedKey === normalize(key);
  const usedBefore = Boolean(findLicense(key)?.usedAt);
  if (!sameKey && !usedBefore) return false;
  return !vaultAllowsAutoBind(key);
}

export function activateLicense(input: string, expiresAt?: string): boolean {
  if (!keyIsKnownValid(input)) return false;
  // لا يُعاد تفعيل مفتاح مربوط بجهاز آخر على هذا الجهاز.
  if (deviceBinding(input) === 'mismatch') return false;
  // ولا يُعاد تفعيل ترخيص سبق تفعيله على جهاز آخر بحذف صفوف الربط من نسخته.
  if (activatedElsewhere(input)) return false;
  const record = findLicense(input);
  // الترخيص السنوي يُحسب مرة واحدة عند أول تفعيل؛ إعادة التفعيل لا تمدّد المدة.
  let computedExpires = expiresAt ?? '';
  if (!computedExpires && record) {
    computedExpires =
      record.expiresAt ||
      (record.type === 'annual'
        ? new Date(Date.now() + (record.durationDays || 365) * 86400000).toISOString()
        : '');
  }
  setSettings({
    'license.key': input,
    'license.activated_at': new Date().toISOString(),
    'license.expires_at': computedExpires,
  });
  bindToCurrentDevice(input);
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
