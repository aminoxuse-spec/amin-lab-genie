import { createHash, createHmac } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import os from 'node:os';
import { SECRET } from '../config.ts';
import { deviceId } from './device.ts';
import { logger } from './logger.ts';

/**
 * خزنة ربط الترخيص على مستوى الجهاز: ملف صغير خارج مجلد التطبيق
 * (ويندوز: `%PROGRAMDATA%\Amin-Lab Genie` ثم `%APPDATA%`، لينكس: `/var/lib` ثم مجلد المستخدم).
 * تحفظ أي مفتاح رُبط على هذا الجهاز، ولأنها خارج مجلد التطبيق وقاعدة البيانات
 * فإن نسخ مجلد التطبيق إلى حاسوب آخر لا ينقلها — فلا يفيد حذف صفوف الربط من
 * قاعدة البيانات المنسوخة في إعادة الربط التلقائي.
 *
 * كل سجل موقَّع بـHMAC-SHA256، والملف يحمل بصمة الجهاز الذي أُنشئ عليه،
 * لذا لا يُقبل ملف منسوخ من جهاز آخر ولا سجل معدَّل يدوياً.
 */
const FILE_NAME = 'license-bindings.json';
const VAULT_VERSION = 1;

export type VaultEntry = {
  device: string;
  boundAt: string;
  sig: string;
};

type VaultState = {
  version: number;
  machine: string;
  bindings: Record<string, VaultEntry>;
  /** تاريخ بدء الفترة التجريبية المحفوظ على مستوى الجهاز (حماية من إعادة التعيين). */
  trialStartedAt?: string;
  trialSig?: string;
};

function normalizeKey(key: string): string {
  return String(key || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function keyHash(key: string): string {
  return createHash('sha256')
    .update(`amin-lab-vault-key-v1:${normalizeKey(key)}`)
    .digest('hex')
    .toUpperCase();
}

function signature(hash: string, device: string): string {
  return createHmac('sha256', SECRET)
    .update(`amin-lab-vault-v1:${hash}:${device.toUpperCase()}`)
    .digest('hex');
}

/** مجلدات الخزنة المحتملة بالأولوية: الأول على مستوى الجهاز. */
export function vaultDirectories(): string[] {
  const override = (process.env.AMIN_LAB_VAULT_DIR ?? '').trim();
  if (override) return [override];
  if (process.platform === 'win32') {
    const dirs: string[] = [];
    const programData = (process.env.PROGRAMDATA ?? '').trim() || 'C:\\ProgramData';
    dirs.push(join(programData, 'Amin-Lab Genie'));
    const appData = (process.env.APPDATA ?? '').trim();
    if (appData) dirs.push(join(appData, 'Amin-Lab Genie'));
    return dirs;
  }
  return [
    '/var/lib/amin-lab-genie',
    join(os.homedir(), '.local', 'share', 'amin-lab-genie'),
  ];
}

function candidateFiles(): string[] {
  return vaultDirectories().map((dir) => join(dir, FILE_NAME));
}

function parseState(raw: string): VaultState | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<VaultState> | null;
    if (!parsed || typeof parsed !== 'object') return undefined;
    if (parsed.version !== VAULT_VERSION) return undefined;
    if (typeof parsed.machine !== 'string' || !parsed.machine) return undefined;
    const bindings =
      parsed.bindings && typeof parsed.bindings === 'object' ? parsed.bindings : {};
    return {
      version: VAULT_VERSION,
      machine: parsed.machine,
      bindings: bindings as Record<string, VaultEntry>,
    };
  } catch {
    return undefined;
  }
}

function readState(path: string): VaultState | undefined {
  try {
    return parseState(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

/** الخزنة الخاصة بهذا الجهاز فقط (ملف جهاز آخر لا يُعتد به). */
function machineVault(): { state: VaultState; path: string } | undefined {
  const current = deviceId().toUpperCase();
  for (const path of candidateFiles()) {
    if (!existsSync(path)) continue;
    const state = readState(path);
    if (!state) continue;
    if (state.machine.toUpperCase() !== current) continue;
    return { state, path };
  }
  return undefined;
}

/** مسار الخزنة الفعلي (للتشخيص والسجل). */
export function vaultLocation(): string {
  return machineVault()?.path ?? candidateFiles()[0] ?? '';
}

/** هل توجد خزنة ربط لهذا الجهاز؟ تُنشأ عند أول ربط ناجح. */
export function vaultPresent(): boolean {
  return Boolean(machineVault());
}

/** سجل الربط الموثوق لهذا المفتاح على هذا الجهاز، إن وُجد. */
function trustedEntry(key: string): VaultEntry | undefined {
  const vault = machineVault();
  if (!vault) return undefined;
  const hash = keyHash(key);
  const entry = vault.state.bindings[hash];
  if (!entry || typeof entry.device !== 'string' || typeof entry.sig !== 'string') return undefined;
  if (entry.device.toUpperCase() !== deviceId().toUpperCase()) return undefined;
  if (entry.sig !== signature(hash, entry.device)) return undefined;
  return entry;
}

/**
 * هل تسمح خزنة هذا الجهاز باستعادة ربط المفتاح تلقائياً؟
 * نعم فقط إذا رُبط هذا المفتاح سابقاً بهذا الجهاز وتوقيعه صحيح — أي أن الخزنة
 * موجودة هنا وتشهد له. نسخة منسوخة لا تملك خزنة، فلا يُستعاد ترخيصها.
 */
export function vaultAllowsAutoBind(key: string): boolean {
  return Boolean(trustedEntry(key));
}

/**
 * هل توجد فترة تجريبية محفوظة على مستوى الجهاز؟
 * تُستخدم لمنع إعادة تعيين Trial بحذف قاعدة البيانات أو صفوف الإعدادات.
 */
export function vaultTrialStart(): string | undefined {
  const vault = machineVault();
  if (!vault) return undefined;
  const startedAt = vault.state.trialStartedAt;
  if (typeof startedAt !== 'string' || !startedAt) return undefined;
  const expected = trialSignature(startedAt, vault.state.machine);
  if (vault.state.trialSig !== expected) return undefined;
  return startedAt;
}

/** حفظ تاريخ بدء الفترة التجريبية في خزنة الجهاز (لا يُستبدل بقيمة أحدث). */
export function vaultRecordTrialStart(startedAt: string): boolean {
  if (!startedAt) return false;
  const vault = machineVault();
  const state: VaultState =
    vault?.state ?? { version: VAULT_VERSION, machine: deviceId(), bindings: {} };
  // لا نُستبدل تاريخاً أقدم (حماية من إعادة التعيين).
  if (state.trialStartedAt && new Date(state.trialStartedAt).getTime() <= new Date(startedAt).getTime()) {
    return true;
  }
  state.trialStartedAt = startedAt;
  state.trialSig = trialSignature(startedAt, state.machine);
  return writeState(state);
}

function trialSignature(startedAt: string, device: string): string {
  return createHmac('sha256', SECRET)
    .update(`amin-lab-trial-v1:${startedAt}:${device.toUpperCase()}`)
    .digest('hex');
}

/** تثبيت ربط المفتاح بهذا الجهاز في الخزنة (يكتب عند التفعيل وعند الترحيل). */
export function vaultRecordBinding(key: string): boolean {
  if (!normalizeKey(key)) return false;
  const device = deviceId();
  const hash = keyHash(key);
  const sig = signature(hash, device);
  const existing = machineVault();
  const state: VaultState =
    existing?.state ?? { version: VAULT_VERSION, machine: device, bindings: {} };
  const previous = state.bindings[hash];
  if (
    existing &&
    previous &&
    previous.device?.toUpperCase() === device.toUpperCase() &&
    previous.sig === sig
  ) {
    return true;
  }
  state.bindings[hash] = { device, boundAt: new Date().toISOString(), sig };
  return writeState(state);
}

function writeState(state: VaultState): boolean {
  const current = deviceId().toUpperCase();
  const files = candidateFiles();
  // نكتب في الملف القائم لهذا الجهاز إن وُجد، وإلا في أول موضع حر.
  const existingPath = files.find((path) => {
    const found = existsSync(path) ? readState(path) : undefined;
    return Boolean(found && found.machine.toUpperCase() === current);
  });
  const ordered = existingPath ? [existingPath, ...files.filter((path) => path !== existingPath)] : files;

  for (const path of ordered) {
    if (existsSync(path)) {
      const found = readState(path);
      // ملف جهاز آخر: لا نكتب فوقه (يبقى دليلاً على النسخ ولا يمنح ثقة).
      if (found && found.machine.toUpperCase() !== current) continue;
    }
    try {
      mkdirSync(dirname(path), { recursive: true });
      const temp = `${path}.${process.pid}.tmp`;
      writeFileSync(temp, JSON.stringify(state, null, 2), 'utf8');
      renameSync(temp, path);
      return true;
    } catch (error) {
      logger.warn('تعذّر حفظ خزنة ربط الجهاز في هذا الموضع', {
        path,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.warn('لم يُعثر على موضع قابل للكتابة لخزنة ربط الجهاز', { tried: files });
  return false;
}
