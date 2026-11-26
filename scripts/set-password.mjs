#!/usr/bin/env node
/**
 * تغيير كلمة مرور حساب إلى كلمة قوية عشوائية (أو NEW_PASSWORD إن ضُبط).
 *
 *   npm run set-password -- admin
 *   npm run set-password -- teacher
 *
 * الكلمة الجديدة لا تُطبع في الطرفية ولا في السجل؛ تُضاف إلى data/credentials.txt (صلاحيات 600).
 */
import { randomBytes, scryptSync } from 'node:crypto';
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

try {
  process.loadEnvFile();
} catch {
  /* لا يوجد .env */
}

const username = (process.argv[2] ?? 'admin').trim();
if (!/^[A-Za-z0-9_.-]{1,40}$/.test(username)) {
  console.error('✗ اسم حساب غير صالح');
  process.exit(1);
}

const DATA_DIR = resolve(process.env.DATA_DIR ?? 'data');
const DB_PATH = resolve(process.env.DB_PATH ?? join(DATA_DIR, 'amin-lab-genie.sqlite'));

if (!existsSync(DB_PATH)) {
  console.error(`✗ قاعدة البيانات غير موجودة: ${DB_PATH}`);
  process.exit(1);
}

const password = (process.env.NEW_PASSWORD ?? '').trim() || randomBytes(18).toString('base64url');
const salt = randomBytes(16).toString('hex');
const hash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;

const db = new DatabaseSync(DB_PATH);
const result = db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hash, username);
db.close();

if (result.changes === 0) {
  console.error(`✗ الحساب «${username}» غير موجود`);
  process.exit(1);
}

mkdirSync(DATA_DIR, { recursive: true });
const file = join(DATA_DIR, 'credentials.txt');
appendFileSync(file, `${new Date().toISOString()}\t${username}\t${password}\n`, { mode: 0o600 });
try {
  chmodSync(file, 0o600);
} catch {
  /* Windows */
}

// حذف كلمة المرور الأولى لهذا الحساب من ملف أول تشغيل: تغييرها يجعله مضلّلاً.
const firstRunFile = join(DATA_DIR, 'first-run-credentials.txt');
if (existsSync(firstRunFile)) {
  const kept = readFileSync(firstRunFile, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() && (line.startsWith('#') || line.split('\t')[0].trim() !== username));
  const entries = kept.filter((line) => !line.startsWith('#'));
  if (entries.length === 0) rmSync(firstRunFile, { force: true });
  else writeFileSync(firstRunFile, `${kept.join('\n')}\n`, { mode: 0o600 });
}

console.log(`✔ تم تغيير كلمة مرور «${username}».`);
console.log(`  الكلمة الجديدة محفوظة في: ${file}`);
console.log('  انقلها إلى مدير كلمات المرور ثم احذف السطر من الملف.');
console.log('  ملاحظة: كل جلسات هذا الحساب الحالية ستُرفض عند تجديد الرمز.');
