import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';

let materialCache: string | undefined;
let idCache: string | undefined;

/**
 * مادة البصمة الخام من نظام التشغيل نفسه:
 * Windows: MachineGuid من السجل (يثبت ما دام النظام مثبتاً)،
 * Linux: /etc/machine-id،
 * وإلا: اسم الجهاز + المعالج + عناوين MAC الداخلية.
 */
export function machineMaterial(): string {
  if (materialCache !== undefined) return materialCache;
  materialCache = readMachineMaterial();
  return materialCache;
}

function readMachineMaterial(): string {
  if (process.platform === 'win32') {
    try {
      const out = execFileSync(
        'reg',
        ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
        { encoding: 'utf8', windowsHide: true, timeout: 5000 },
      );
      const match = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/);
      if (match?.[1]) return `win:${match[1].toLowerCase()}`;
    } catch {
      // ننتقل إلى البصمة البديلة
    }
  }

  if (process.platform === 'linux') {
    try {
      const id = readFileSync('/etc/machine-id', 'utf8').trim();
      if (id) return `linux:${id}`;
    } catch {
      // ننتقل إلى البصمة البديلة
    }
  }

  const macs: string[] = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (!entry.internal && entry.mac && entry.mac !== '00:00:00:00:00:00') {
        macs.push(entry.mac.toLowerCase());
      }
    }
  }
  macs.sort();
  return `hw:${os.hostname().toLowerCase()}|${os.platform()}|${os.arch()}|${macs.join(',')}`;
}

/** اشتقاق بصمة ثابتة من مادة خام — دالة نقية قابلة للاختبار. */
export function deviceIdFrom(material: string): string {
  const digest = createHash('sha256')
    .update(`amin-lab-device-v1:${material}`)
    .digest('hex')
    .toUpperCase();
  return digest.slice(0, 16).match(/.{4}/g)!.join('-');
}

/**
 * بصمة الجهاز الحالي. تُحسب من النظام في وقت التشغيل،
 * ولا تُقرأ من قاعدة البيانات، لذا لا تُنقل مع مجلد منسوخ.
 */
export function deviceId(): string {
  if (idCache) return idCache;
  idCache = deviceIdFrom(machineMaterial());
  return idCache;
}
