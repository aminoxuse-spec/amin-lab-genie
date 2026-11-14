#!/usr/bin/env node
/**
 * إنشاء حزمة التوزيع الكاملة (ZIP) — يعمل على Windows وLinux وmacOS
 * دون أي أدوات خارجية (لا يحتاج 7-Zip ولا PowerShell).
 *
 *   npm run package
 *   node scripts/create-package.mjs --output release/custom.zip
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, sep } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const ROOT = process.cwd();
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output');
const nameIndex = args.indexOf('--name');
const NAME = nameIndex >= 0 ? args[nameIndex + 1] : `Amin-Lab-Genie-v${VERSION}`;
const OUTPUT = outputIndex >= 0 ? args[outputIndex + 1] : join('release', `${NAME}.zip`);

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'data', 'dist', 'release', '.wrangler', 'coverage']);
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

/* ---------- CRC32 ---------- */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function dosDateTime(date) {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f);
  const day = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
  return { time, day };
}

/** كتابة ZIP قياسي (deflate/store) — يدعم أسماء ملفات UTF-8. */
function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf8');
    const raw = entry.data;
    const compressed = deflateRawSync(raw, { level: 9 });
    const useDeflate = compressed.length < raw.length;
    const payload = useDeflate ? compressed : raw;
    const crc = crc32(raw);
    const { time, day } = dosDateTime(entry.mtime);

    const local = Buffer.alloc(30 + nameBuffer.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuffer.copy(local, 30);

    locals.push(local, payload);

    const central = Buffer.alloc(46 + nameBuffer.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuffer.copy(central, 46);
    centrals.push(central);

    offset += local.length + payload.length;
  }

  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuffer, end]);
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
writeFileSync(outputPath, archive);

const checksum = createHash('sha256').update(archive).digest('hex');
writeFileSync(`${outputPath}.sha256`, `${checksum}  ${NAME}.zip\n`);

const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
console.log('=== Amin-Lab -cem🔬 — حزمة التوزيع ===');
console.log(`✔ الملف: ${OUTPUT}`);
console.log(`✔ عدد الملفات: ${entries.length}`);
console.log(`✔ حجم المصدر: ${(totalBytes / 1024).toFixed(1)} KB`);
console.log(`✔ حجم الحزمة: ${(archive.length / 1024).toFixed(1)} KB`);
console.log(`✔ SHA-256: ${checksum}`);
