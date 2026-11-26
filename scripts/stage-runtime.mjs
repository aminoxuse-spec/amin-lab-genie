#!/usr/bin/env node
/**
 * تجهيز مكوّنات مثبت Windows ذاتي التشغيل:
 *
 *   node scripts/stage-runtime.mjs
 *
 * 1) installer/runtime/     — Node.js win-x64 (node.exe + npm) مع التحقق من SHA-256
 * 2) installer/vendor/      — تبعيات الإنتاج فقط (express وما يتصل بها)
 *
 * المخرجات كبيرة (~100 ميغابايت) ولا تُحفظ في Git؛ شغّل هذا السكربت قبل
 * `installer\build-setup.cmd`. كلاهما يُنتَج مرة واحدة ثم يُعاد استعماله.
 */
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { gunzipSync } from 'node:zlib';

const ROOT = process.cwd();
const INSTALLER = join(ROOT, 'installer');
const RUNTIME_DIR = join(INSTALLER, 'runtime');
const VENDOR_MODULES = join(INSTALLER, 'vendor', 'node_modules');
const CACHE_DIR = join(INSTALLER, '.cache');
const NODE_MAJOR = '22';
const FILES_FROM_ARCHIVE = ['node.exe', 'npm.cmd', 'npm.ps1', 'npx.cmd', 'npx.ps1'];

const log = (message) => console.log(message);
const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

/* ------------------------------------------------------------------ */
/* zip reader (deflate + store, no external tools)                     */
/* ------------------------------------------------------------------ */

function inflateRaw(data) {
  // node has no public raw-inflate API, so reuse the CLI once for the few
  // small npm files instead of reimplementing DEFLATE.
  return execFileSync(process.execPath, [
    '--input-type=module',
    '-e',
    `import {inflateRawSync} from 'node:zlib';import {readFileSync} from 'node:fs';
     process.stdout.write(inflateRawSync(readFileSync(0)));`,
  ], { input: data, maxBuffer: 256 * 1024 * 1024 });
}

function readZipEntries(buffer) {
  const entries = new Map();
  for (let offset = 0; offset + 30 <= buffer.length; ) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) break;
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString('utf8', offset + 30, offset + 30 + nameLength);
    const dataStart = offset + 30 + nameLength + extraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    entries.set(name, { method, raw });
    offset = dataStart + compressedSize;
  }
  return entries;
}

function entryData(entry) {
  if (!entry) return null;
  if (entry.method === 0) return entry.raw;
  if (entry.method === 8) return inflateRaw(entry.raw);
  fail(`unsupported zip compression method ${entry.method}`);
}

/* ------------------------------------------------------------------ */
/* 1) Node.js runtime                                                  */
/* ------------------------------------------------------------------ */

async function stageRuntime() {
  const expected = join(RUNTIME_DIR, 'node.exe');
  if (existsSync(expected)) {
    const { execFileSync: run } = await import('node:child_process');
    const version = run(expected, ['-v'], { encoding: 'utf8' }).trim();
    log(`- runtime already staged (${version})`);
    return;
  }

  const index = await fetch(`https://nodejs.org/dist/latest-v${NODE_MAJOR}.x/`, { redirect: 'follow' });
  if (!index.ok) fail(`cannot reach nodejs.org (${index.status})`);
  const html = await index.text();
  const match = html.match(new RegExp(`node-(v${NODE_MAJOR}\\.\\d+\\.\\d+)-win-x64\\.zip`));
  if (!match) fail(`no Node.js v${NODE_MAJOR}.x win-x64 build found`);

  const version = match[1];
  const archiveName = `node-${version}-win-x64.zip`;
  mkdirSync(CACHE_DIR, { recursive: true });
  const archivePath = join(CACHE_DIR, archiveName);

  if (!existsSync(archivePath)) {
    log(`- downloading ${archiveName} ...`);
    const response = await fetch(`https://nodejs.org/dist/${version}/${archiveName}`);
    if (!response.ok) fail(`download failed: ${response.status}`);
    writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));
  }

  const sumsResponse = await fetch(`https://nodejs.org/dist/${version}/SHASUMS256.txt`);
  if (!sumsResponse.ok) fail(`cannot read SHASUMS256.txt (${sumsResponse.status})`);
  const expectedLine = (await sumsResponse.text())
    .split('\n')
    .find((line) => line.trim().endsWith(`  ${archiveName}`));
  if (!expectedLine) fail(`no SHA-256 entry for ${archiveName}`);
  const actual = createHash('sha256').update(readFileSync(archivePath)).digest('hex');
  const want = expectedLine.trim().split(/\s+/)[0];
  if (actual !== want) fail(`checksum mismatch: expected ${want}, got ${actual}`);
  log(`- verified ${archiveName} SHA-256`);

  const entries = readZipEntries(readFileSync(archivePath));
  const prefix = `node-${version}-win-x64/`;

  rmSync(RUNTIME_DIR, { recursive: true, force: true });
  mkdirSync(RUNTIME_DIR, { recursive: true });

  for (const name of FILES_FROM_ARCHIVE) {
    const data = entryData(entries.get(prefix + name));
    if (!data) fail(`${name} not found in the Node.js archive`);
    writeFileSync(join(RUNTIME_DIR, name), data);
  }

  for (const [name, entry] of entries) {
    if (!name.startsWith(`${prefix}node_modules/`)) continue;
    if (name.endsWith('/')) continue;
    const target = join(RUNTIME_DIR, name.slice(prefix.length));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, entryData(entry));
  }

  chmodSync(join(RUNTIME_DIR, 'node.exe'), 0o755);
  writeFileSync(join(RUNTIME_DIR, 'VERSION.txt'), `${version}\n`);
  log(`- staged Node.js ${version} into installer/runtime`);
}

/* ------------------------------------------------------------------ */
/* 2) production node_modules                                          */
/* ------------------------------------------------------------------ */

function readDeps(manifestPath) {
  if (!existsSync(manifestPath)) return {};
  return JSON.parse(readFileSync(manifestPath, 'utf8')).dependencies ?? {};
}

function stageProductionModules() {
  const probe = join(VENDOR_MODULES, 'express', 'package.json');
  if (existsSync(probe)) {
    log('- production dependencies already staged');
    return;
  }

  const collected = new Map();
  const queue = [
    ...Object.keys(readDeps(join(ROOT, 'package.json'))),
    ...Object.keys(readDeps(join(ROOT, 'server', 'package.json'))),
  ];

  while (queue.length > 0) {
    const name = queue.shift();
    if (collected.has(name)) continue;
    const moduleDir = join(ROOT, 'node_modules', name);
    if (!existsSync(moduleDir)) {
      fail(`missing production dependency: ${name} — run npm install first`);
    }
    collected.set(name, moduleDir);
    for (const child of Object.keys(readDeps(join(moduleDir, 'package.json')))) {
      if (!collected.has(child)) queue.push(child);
    }
  }

  rmSync(join(INSTALLER, 'vendor'), { recursive: true, force: true });
  mkdirSync(VENDOR_MODULES, { recursive: true });

  let bytes = 0;
  const copy = (dir, base) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) copy(full, base);
      else if (entry.isFile()) {
        const target = join(VENDOR_MODULES, relative(base, full));
        mkdirSync(dirname(target), { recursive: true });
        cpSync(full, target);
        bytes += statSync(full).size;
      }
    }
  };

  for (const moduleDir of collected.values()) copy(moduleDir, join(ROOT, 'node_modules'));
  writeFileSync(
    join(INSTALLER, 'vendor', 'PACKAGES.txt'),
    `${[...collected.keys()].sort().join('\n')}\n`,
  );
  log(`- staged ${collected.size} production packages into installer/vendor (${(bytes / 1048576).toFixed(1)} MB)`);
}

/* ------------------------------------------------------------------ */
/* 3) سر التوقيع الإنتاجي (APP_SECRET)                                 */
/* ------------------------------------------------------------------ */

/**
 * المفاتيح المرتبطة برقم التثبيت تُشتق من APP_SECRET، والخادم يرفضها إن كان
 * السر هو الافتراضي. لذلك نولّد سراً إنتاجياً مرة واحدة ونشحنه في {app}\.env.
 *
 * ⚠️ احتفظ بهذا الملف: إن ضاع، لن يعمل أي مفتاح مرتبط صادر سابقاً. ولا تشاركه
 * علناً (هو مضمّن في المثبت في كل الأحوال، لكنه يبقي المفاتيح غير قابلة للتصنيع
 * من مجرد رؤية المفتاح).
 */
function stageProductionSecret() {
  const envPath = join(INSTALLER, '.env.production');
  if (existsSync(envPath)) {
    log('- production APP_SECRET already exists (reused)');
    return;
  }
  const secret = randomBytes(32).toString('base64url');
  writeFileSync(
    envPath,
    [
      '# سر توقيع الجلسات واشتقاق مفاتيح الترخيص المرتبطة برقم التثبيت.',
      '# يولَّد مرة واحدة بواسطة scripts/stage-runtime.mjs — لا تغيّره بعد إصدار مفاتيح.',
      `APP_SECRET=${secret}`,
      '',
    ].join('\n'),
  );
  log('- generated production APP_SECRET into installer/.env.production');
  log('  ⚠️ backup this file: bound license keys cannot be re-derived without it');
}

/* ------------------------------------------------------------------ */

log('=== تجهيز مكوّنات مثبت Windows ===');
await stageRuntime();
stageProductionModules();
stageProductionSecret();
log('');
log('✔ جاهز — شغّل الآن: installer\\build-setup.cmd');
