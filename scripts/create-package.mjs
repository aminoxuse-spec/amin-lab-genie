#!/usr/bin/env node
/**
 * إنشاء حزمة التوزيع الكاملة (ZIP) — يعمل على Windows وLinux وmacOS
 * دون أي أدوات خارجية (لا يحتاج 7-Zip ولا PowerShell).
 *
 *   npm run package
 *   node scripts/create-package.mjs --output release/custom.zip
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join, relative, sep } from 'node:path';
import { buildZip, writeZipArchive } from './lib/zip.mjs';

const ROOT = process.cwd();
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output');
const nameIndex = args.indexOf('--name');
const NAME = nameIndex >= 0 ? args[nameIndex + 1] : `Amin-Lab-Genie-v${VERSION}`;
const OUTPUT = outputIndex >= 0 ? args[outputIndex + 1] : join('release', `${NAME}.zip`);

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'data', 'dist', 'release', 'deliveries', '.wrangler', 'coverage']);
const EXCLUDED_FILES = new Set(['.DS_Store', 'Thumbs.db', '.env']);
const EXCLUDED_EXTENSIONS = ['.log', '.sqlite', '.sqlite-wal', '.sqlite-shm', '.zip', '.tsbuildinfo'];

function shouldSkipFile(name) {
  if (EXCLUDED_FILES.has(name)) return true;
  if (name.startsWith('.env') && name !== '.env.example') return true;
  return EXCLUDED_EXTENSIONS.some((extension) => name.endsWith(extension));
}

function walk(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      walk(fullPath, files);
    } else if (entry.isFile() && !shouldSkipFile(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

/* ---------- run ---------- */
const files = walk(ROOT).sort();
if (files.length === 0) {
  console.error('✗ لم يتم العثور على أي ملفات للتغليف');
  process.exit(1);
}

const entries = files.map((fullPath) => {
  const stats = statSync(fullPath);
  const relativePath = relative(ROOT, fullPath).split(sep).join('/');
  return {
    name: `${NAME}/${relativePath}`,
    data: readFileSync(fullPath),
    mtime: stats.mtime,
    size: stats.size,
  };
});

const outputPath = join(ROOT, OUTPUT);
mkdirSync(join(outputPath, '..'), { recursive: true });
if (existsSync(outputPath)) rmSync(outputPath);

const archive = buildZip(entries);
const { checksum } = writeZipArchive(outputPath, archive);

const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
console.log('=== Amin-Lab -Pro🔬 — حزمة التوزيع ===');
console.log(`✔ الملف: ${OUTPUT}`);
console.log(`✔ عدد الملفات: ${entries.length}`);
console.log(`✔ حجم المصدر: ${(totalBytes / 1024).toFixed(1)} KB`);
console.log(`✔ حجم الحزمة: ${(archive.length / 1024).toFixed(1)} KB`);
console.log(`✔ SHA-256: ${checksum}`);
