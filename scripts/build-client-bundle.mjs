#!/usr/bin/env node
/**
 * يبني حزمة تحديث الواجهة (release/client-bundle.json) لتُرفع من الإعدادات
 * وتُطبَّق على تطبيق المكتب دون إعادة تثبيت.
 *
 * الاستخدام: node scripts/build-client-bundle.mjs
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const SOURCE = resolve('client/src');
const OUTPUT = resolve('release/client-bundle.json');
const ALLOWED_EXT = /\.(html|js|css|json|webmanifest|svg|txt)$/i;

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.isFile() && ALLOWED_EXT.test(entry.name)) files.push(full);
  }
  return files;
}

if (!existsSync(SOURCE)) {
  console.error('مجلد الواجهة غير موجود:', SOURCE);
  process.exit(1);
}

const cacheMatch = readFileSync(join(SOURCE, 'sw.js'), 'utf8').match(/amin-lab-genie-(v\d+)/);
const version = cacheMatch ? cacheMatch[1] : `build-${new Date().toISOString().slice(0, 10)}`;

const files = walk(SOURCE).map((full) => ({
  path: relative(SOURCE, full).split(sep).join('/'),
  content: readFileSync(full, 'utf8'),
}));

mkdirSync(resolve('release'), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify({ version, generatedAt: new Date().toISOString(), files }), 'utf8');

const bytes = statSync(OUTPUT).size;
console.log(`الإصدار: ${version}`);
console.log(`الملفات: ${files.length}`);
console.log(`الحزمة: ${OUTPUT} (${Math.round(bytes / 1024)} كيلوبايت)`);
