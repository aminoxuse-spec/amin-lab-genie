#!/usr/bin/env node
/**
 * توليد زوج مفاتيح Ed25519 لتوقيع التراخيص (Amin-Lab -Pro🔬).
 *
 *   node scripts/gen-license-keys.mjs
 *
 * يُنشئ:
 *   - server/src/license-public.key   (يُودَع في Git — مفتاح التحقق)
 *   - keys/license-private.key       (لا يُودَع — مفتاح التوقيع، يبقى على حاسوب البائع)
 *
 * ⚠️ احتفظ بـ keys/license-private.key في مكان آمن. بدونه لا يمكن توليد
 *    تراخيص موقّعة جديدة. المفتاح العام مضمّن في التطبيق (للتحقق فقط).
 */
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const PUB_PATH = join(ROOT, 'server', 'src', 'license-public.key');
const PRIV_DIR = join(ROOT, 'keys');
const PRIV_PATH = join(PRIV_DIR, 'license-private.key');

if (existsSync(PUB_PATH) || existsSync(PRIV_PATH)) {
  console.error('✗ المفاتيح موجودة بالفعل. احذفها أولاً إن أردت إعادة التوليد.');
  console.error('  ' + PUB_PATH);
  console.error('  ' + PRIV_PATH);
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

mkdirSync(PRIV_DIR, { recursive: true });
writeFileSync(PUB_PATH, pubPem, 'utf8');
writeFileSync(PRIV_PATH, privPem, 'utf8');

console.log('✔ تم توليد زوج مفاتيح Ed25519');
console.log('  المفتاح العام (يُودَع):', PUB_PATH);
console.log('  المفتاح الخاص (لا يُودَع):', PRIV_PATH);
console.log('');
console.log('⚠️ احتفظ بـ keys/license-private.key في مكان آمن (لا تشاركه، لا تودعه في Git).');
console.log('   أضف keys/ إلى .gitignore إن لم يكن مضافاً.');
