#!/usr/bin/env node
/**
 * Build a Debian package for Linux amd64 without dpkg-deb.
 *
 *   npm run deb
 *   node linux/build-deb.mjs [--skip-node-download]
 *
 * Output: release/amin-lab-pro_<version>_amd64.deb (+ .sha256)
 *
 * The package bundles the official Node.js linux-x64 runtime under
 * /opt/amin-lab-pro/runtime, so the target machine does not need Node installed.
 */
import { createHash } from 'node:crypto';
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
import { basename, dirname, join, relative } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

const ROOT = process.cwd();
const LINUX_DIR = join(ROOT, 'linux');
const BUILD_DIR = join(LINUX_DIR, 'build');
const CACHE_DIR = join(LINUX_DIR, '.cache');
const STAGE = join(BUILD_DIR, 'data');
const CONTROL_STAGE = join(BUILD_DIR, 'control');
const APP_DIR = '/opt/amin-lab-pro';

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;
const ARCH = 'amd64';
const PKG_NAME = 'amin-lab-pro';
const DEB_FILE = join(ROOT, 'release', `${PKG_NAME}_${VERSION}_${ARCH}.deb`);

const args = process.argv.slice(2);
const SKIP_NODE = args.includes('--skip-node-download');

const log = (message) => console.log(message);
const fail = (message) => {
  console.error(`\u2717 ${message}`);
  process.exit(1);
};

/* ------------------------------------------------------------------ */
/* tar / gzip writer (ustar, deterministic)                            */
/* ------------------------------------------------------------------ */

function octal(value, width) {
  return value.toString(8).padStart(width - 1, '0') + '\0';
}

function tarHeader({ name, mode, size, mtime, type, linkname = '' }) {
  const header = Buffer.alloc(512, 0);
  let prefix = '';
  let shortName = name;

  if (Buffer.byteLength(shortName) > 100) {
    const parts = name.split('/');
    while (parts.length > 1 && Buffer.byteLength(parts.join('/')) > 100) {
      prefix = parts.shift() + (prefix ? `/${prefix}` : '');
    }
    shortName = parts.join('/');
  }

  header.write(shortName, 0, 100, 'utf8');
  header.write(octal(mode, 8), 100, 8, 'ascii');
  header.write(octal(0, 8), 108, 8, 'ascii');
  header.write(octal(0, 8), 116, 8, 'ascii');
  header.write(octal(size, 12), 124, 12, 'ascii');
  header.write(octal(mtime, 12), 136, 12, 'ascii');
  header.write('        ', 148, 8, 'ascii');
  header.write(type, 156, 1, 'ascii');
  header.write(linkname, 157, 100, 'utf8');
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  header.write('root', 265, 32, 'ascii');
  header.write('root', 297, 32, 'ascii');
  header.write(octal(0, 8), 329, 8, 'ascii');
  header.write(octal(0, 8), 337, 8, 'ascii');
  if (prefix) header.write(prefix, 345, 155, 'utf8');

  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(octal(checksum, 7) + ' ', 148, 8, 'ascii');
  return header;
}

/** entries: [{ path, type: 'file'|'dir'|'symlink', mode?, data?, link? }] */
function createTar(entries, mtime) {
  const chunks = [];
  for (const entry of entries) {
    const path = entry.path.replace(/^\//, '');
    const isDir = entry.type === 'dir';
    const data = entry.data ?? Buffer.alloc(0);

    if (Buffer.byteLength(path) > 100) {
      const longName = Buffer.from(`${path}\0`, 'utf8');
      chunks.push(
        tarHeader({
          name: '././@LongLink',
          mode: 0o644,
          size: longName.length,
          mtime,
          type: 'L',
        }),
        longName,
        Buffer.alloc((512 - (longName.length % 512)) % 512, 0),
      );
    }

    const header = tarHeader({
      name: path,
      mode: entry.mode ?? (isDir ? 0o755 : entry.mode ?? 0o644),
      size: isDir ? 0 : data.length,
      mtime,
      type: entry.type === 'symlink' ? '2' : isDir ? '5' : '0',
      linkname: entry.link ?? '',
    });
    chunks.push(header);
    if (!isDir) {
      chunks.push(data);
      const padding = (512 - (data.length % 512)) % 512;
      if (padding) chunks.push(Buffer.alloc(padding, 0));
    }
  }
  chunks.push(Buffer.alloc(1024, 0));
  return gzipSync(Buffer.concat(chunks), { level: 9 });
}

/* ------------------------------------------------------------------ */
/* ar writer                                                           */
/* ------------------------------------------------------------------ */

function arMember(name, data) {
  const header = Buffer.from(
    name.padEnd(16) +
      String(0).padEnd(12) +
      '0'.padEnd(6) +
      '0'.padEnd(6) +
      '100644'.padEnd(8) +
      String(data.length).padEnd(10) +
      '`\n',
    'ascii',
  );
  const padding = data.length % 2 === 1 ? Buffer.from('\n') : Buffer.alloc(0);
  return Buffer.concat([header, data, padding]);
}

function createDeb(controlTar, dataTar) {
  const debianBinary = Buffer.from('2.0\n', 'ascii');
  return Buffer.concat([
    Buffer.from('!<arch>\n', 'ascii'),
    arMember('debian-binary', debianBinary),
    arMember('control.tar.gz', controlTar),
    arMember('data.tar.gz', dataTar),
  ]);
}

/* ------------------------------------------------------------------ */
/* tar reader (for the Node.js runtime archive)                        */
/* ------------------------------------------------------------------ */

function readTar(buffer) {
  const entries = [];
  let offset = 0;
  let longName = null;

  const readString = (start, length) =>
    buffer.toString('utf8', start, start + length).replace(/\0.*$/s, '');

  while (offset + 512 <= buffer.length) {
    const block = buffer.subarray(offset, offset + 512);
    if (block.every((byte) => byte === 0)) break;

    const name = longName ?? readString(offset, 100);
    const prefix = readString(offset + 345, 155);
    const size = parseInt(readString(offset + 124, 12).trim() || '0', 8);
    const mode = parseInt(readString(offset + 100, 8).trim() || '0', 8);
    const type = String.fromCharCode(block[156]);
    const dataStart = offset + 512;
    const data = buffer.subarray(dataStart, dataStart + size);
    const padded = Math.ceil(size / 512) * 512;

    if (type === 'L') {
      longName = data.toString('utf8').replace(/\0.*$/s, '');
      offset = dataStart + padded;
      continue;
    }
    if (type === 'x' || type === 'g') {
      offset = dataStart + padded;
      continue;
    }

    longName = null;
    entries.push({
      path: prefix ? `${prefix}/${name}` : name,
      type: type === '5' ? 'dir' : type === '2' ? 'symlink' : 'file',
      mode,
      data,
    });
    offset = dataStart + padded;
  }
  return entries;
}

/* ------------------------------------------------------------------ */
/* Node.js runtime download                                            */
/* ------------------------------------------------------------------ */

async function download(url, destination) {
  if (existsSync(destination)) return;
  log(`  downloading ${basename(destination)} ...`);
  const response = await fetch(url);
  if (!response.ok) fail(`download failed: ${response.status} ${url}`);
  writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
}

async function resolveNodeVersion() {
  const response = await fetch('https://nodejs.org/dist/index.json');
  if (!response.ok) fail(`cannot read the Node.js release index (${response.status})`);
  const releases = await response.json();
  const candidates = releases
    .filter((release) => release.lts && /^v(2[2-9]|[3-9][0-9])\./.test(release.version))
    .sort((a, b) => {
      const pa = a.version.slice(1).split('.').map(Number);
      const pb = b.version.slice(1).split('.').map(Number);
      return pb[0] - pa[0] || pb[1] - pa[1] || pb[2] - pa[2];
    });
  if (candidates.length === 0) fail('no suitable Node.js LTS build found');
  return candidates[0].version;
}

async function stageNodeRuntime() {
  const runtimeBin = join(STAGE, APP_DIR, 'runtime/bin');
  mkdirSync(runtimeBin, { recursive: true });

  if (SKIP_NODE) {
    const local = process.env.NODE_RUNTIME_BIN;
    if (!local) fail('--skip-node-download needs NODE_RUNTIME_BIN pointing to a linux x64 node binary');
    cpSync(local, join(runtimeBin, 'node'));
    chmodSync(join(runtimeBin, 'node'), 0o755);
    return { version: 'external' };
  }

  const version = await resolveNodeVersion();
  mkdirSync(CACHE_DIR, { recursive: true });
  const archiveName = `node-${version}-linux-x64.tar.gz`;
  const archivePath = join(CACHE_DIR, archiveName);
  await download(`https://nodejs.org/dist/${version}/${archiveName}`, archivePath);

  // Verify the archive against the published SHA-256 checksum.
  const sumsPath = join(CACHE_DIR, `${version}-SHASUMS256.txt`);
  await download(`https://nodejs.org/dist/${version}/SHASUMS256.txt`, sumsPath);
  const sumsText = readFileSync(sumsPath, 'utf8');
  const expectedLine = sumsText.split('\n').find((line) => line.trim().endsWith(`  ${archiveName}`));
  if (!expectedLine) fail(`no SHA-256 entry for ${archiveName} in SHASUMS256.txt`);
  const expected = expectedLine.trim().split(/\s+/)[0];
  const actual = createHash('sha256').update(readFileSync(archivePath)).digest('hex');
  if (expected !== actual) fail(`Node.js archive checksum mismatch: expected ${expected}, got ${actual}`);
  log(`  verified SHA-256: ${actual}`);

  log(`  extracting Node.js ${version} (linux-x64) ...`);
  const entries = readTar(gunzipSync(readFileSync(archivePath)));
  const nodeEntry = entries.find((entry) => entry.path.endsWith('/bin/node'));
  if (!nodeEntry) fail('bin/node not found in the Node.js archive');

  writeFileSync(join(runtimeBin, 'node'), nodeEntry.data);
  chmodSync(join(runtimeBin, 'node'), 0o755);

  const license = entries.find((entry) => entry.path === `${basename(archiveName, '.tar.gz')}/LICENSE`);
  if (license) writeFileSync(join(STAGE, APP_DIR, 'runtime/LICENSE'), license.data);

  return { version };
}

/* ------------------------------------------------------------------ */
/* file tree helpers                                                   */
/* ------------------------------------------------------------------ */

function walkFiles(directory, base = directory, out = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.DS_Store' || entry.name === 'Thumbs.db') continue;
    const full = join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      out.push({ path: relative(base, full).split('\\').join('/'), type: 'dir' });
      walkFiles(full, base, out);
    } else if (entry.isFile()) {
      out.push({ path: relative(base, full).split('\\').join('/'), type: 'file', full });
    }
  }
  return out;
}

function copyTree(source, destinationRelative) {
  const files = walkFiles(source);
  for (const file of files) {
    const target = join(STAGE, APP_DIR, destinationRelative, file.path);
    if (file.type === 'dir') {
      mkdirSync(target, { recursive: true });
    } else {
      mkdirSync(dirname(target), { recursive: true });
      cpSync(file.full, target);
    }
  }
  return files.length;
}

function resolveProductionDependencies() {
  const collected = new Map();
  const queue = [];

  const readDeps = (manifestPath) => {
    if (!existsSync(manifestPath)) return {};
    return JSON.parse(readFileSync(manifestPath, 'utf8')).dependencies ?? {};
  };

  for (const name of Object.keys(readDeps(join(ROOT, 'package.json')))) queue.push(name);
  for (const name of Object.keys(readDeps(join(ROOT, 'server/package.json')))) queue.push(name);

  while (queue.length > 0) {
    const name = queue.shift();
    if (collected.has(name)) continue;
    const moduleDir = join(ROOT, 'node_modules', name);
    if (!existsSync(moduleDir)) fail(`missing production dependency: ${name}`);
    collected.set(name, moduleDir);
    for (const child of Object.keys(readDeps(join(moduleDir, 'package.json')))) {
      if (!collected.has(child)) queue.push(child);
    }
  }
  return [...collected.entries()];
}

/* ------------------------------------------------------------------ */
/* build                                                               */
/* ------------------------------------------------------------------ */

const requiredDist = join(ROOT, 'server/dist/index.js');
if (!existsSync(requiredDist)) {
  log('server/dist/index.js missing - building TypeScript ...');
  execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: true });
}
if (!existsSync(requiredDist)) fail('build failed: server/dist/index.js still missing');

rmSync(BUILD_DIR, { recursive: true, force: true });
mkdirSync(join(STAGE, APP_DIR), { recursive: true });
mkdirSync(CONTROL_STAGE, { recursive: true });

log(`=== Building ${PKG_NAME}_${VERSION}_${ARCH}.deb ===`);

log('- staging application ...');
copyTree(join(ROOT, 'server/dist'), 'server/dist');
copyTree(join(ROOT, 'client/src'), 'client/src');
for (const file of ['package.json', 'package-lock.json']) {
  cpSync(join(ROOT, file), join(STAGE, APP_DIR, file));
}
cpSync(join(ROOT, 'server/package.json'), join(STAGE, APP_DIR, 'server/package.json'));

log('- staging production dependencies ...');
for (const [name, moduleDir] of resolveProductionDependencies()) {
  copyTree(moduleDir, `node_modules/${name}`);
}

log('- staging system integration files ...');
const place = (sourceRelative, targetRelative, mode) => {
  const target = join(STAGE, targetRelative);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(ROOT, sourceRelative), target);
  chmodSync(target, mode);
};
place('linux/launcher.sh', 'usr/bin/amin-lab-pro', 0o755);
place('linux/amin-lab-pro.desktop', 'usr/share/applications/amin-lab-pro.desktop', 0o644);
place('linux/amin-lab-pro.service', `lib/systemd/system/${PKG_NAME}.service`, 0o644);
place('client/src/assets/icons/icon-512.png', 'usr/share/icons/hicolor/512x512/apps/amin-lab-pro.png', 0o644);
place('README.md', `usr/share/doc/${PKG_NAME}/README.md`, 0o644);

const runtime = await stageNodeRuntime();
log(`- bundled Node.js runtime: ${runtime.version}`);

/* control tree */
log('- building control archive ...');
const installedSizeKb = walkFiles(STAGE).reduce((total, entry) => {
  if (entry.type !== 'file') return total;
  return total + Math.ceil(statSync(join(STAGE, entry.path)).size / 1024);
}, 0);

const control = [
  `Package: ${PKG_NAME}`,
  `Version: ${VERSION}`,
  `Architecture: ${ARCH}`,
  'Maintainer: Amin-Lab <aminhadjadj13@gmail.com>',
  'Installed-Size: ' + installedSizeKb,
  'Depends: libc6 (>= 2.28), libstdc++6, libgcc-s1, adduser',
  'Recommends: chromium | chromium-browser | google-chrome-stable | microsoft-edge-stable | firefox-esr, xdg-utils | curl',
  'Section: education',
  'Priority: optional',
  'Description: Amin-Lab -Pro - school science lab management',
  ' Inventory, borrowing, weekly schedule, quality checks and printable',
  ' reports for a school science laboratory. Ships a local web UI and a',
  ' bundled Node.js runtime, so no external Node.js installation is needed.',
].join('\n');

const writeControlFile = (name, content, mode) => {
  const target = join(CONTROL_STAGE, name);
  writeFileSync(target, content);
  chmodSync(target, mode);
};
writeControlFile('control', control + '\n', 0o644);
writeControlFile('md5sums', '', 0o644);
for (const script of ['postinst', 'prerm', 'postrm']) {
  writeControlFile(script, readFileSync(join(LINUX_DIR, script)), 0o755);
}

/* md5sums for every packaged file */
const md5Lines = walkFiles(STAGE)
  .filter((entry) => entry.type === 'file')
  .map((entry) => {
    const digest = createHash('md5').update(readFileSync(join(STAGE, entry.path))).digest('hex');
    return `${digest}  ${entry.path}`;
  });
writeFileSync(join(CONTROL_STAGE, 'md5sums'), md5Lines.join('\n') + '\n');

/* tar archives */
const mtime = Math.floor(Date.now() / 1000);
const toTarEntry = (base) =>
  walkFiles(base).map((entry) => ({
    path: `./${entry.path}`,
    type: entry.type,
    mode: entry.type === 'dir' ? 0o755 : entry.path.startsWith('usr/bin/') || entry.path.includes('/runtime/bin/') ? 0o755 : 0o644,
    data: entry.type === 'file' ? readFileSync(join(base, entry.path)) : undefined,
  }));

const controlEntries = [
  { path: './', type: 'dir', mode: 0o755 },
  ...walkFiles(CONTROL_STAGE).map((entry) => ({
    path: `./${entry.path}`,
    type: entry.type,
    mode: ['postinst', 'prerm', 'postrm'].includes(entry.path) ? 0o755 : 0o644,
    data: entry.type === 'file' ? readFileSync(join(CONTROL_STAGE, entry.path)) : undefined,
  })),
];
const controlTar = createTar(controlEntries, mtime);

const dataEntries = [{ path: './', type: 'dir', mode: 0o755 }, ...toTarEntry(STAGE)];
const dataTar = createTar(dataEntries, mtime);

const deb = createDeb(controlTar, dataTar);
mkdirSync(dirname(DEB_FILE), { recursive: true });
writeFileSync(DEB_FILE, deb);

const checksum = createHash('sha256').update(deb).digest('hex');
writeFileSync(`${DEB_FILE}.sha256`, `${checksum}  ${basename(DEB_FILE)}\n`);

/* ------------------------------------------------------------------ */
/* self validation                                                     */
/* ------------------------------------------------------------------ */

log('- validating package ...');
const built = readFileSync(DEB_FILE);
if (built.subarray(0, 8).toString('ascii') !== '!<arch>\n') fail('invalid ar header');

const members = [];
let cursor = 8;
while (cursor + 60 <= built.length) {
  const header = built.toString('ascii', cursor, cursor + 60);
  const name = header.slice(0, 16).trim();
  const size = parseInt(header.slice(48, 58).trim(), 10);
  if (!name || Number.isNaN(size)) break;
  members.push({ name, data: built.subarray(cursor + 60, cursor + 60 + size) });
  cursor += 60 + size + (size % 2);
}
const names = members.map((member) => member.name).join(', ');
for (const required of ['debian-binary', 'control.tar.gz', 'data.tar.gz']) {
  if (!members.some((member) => member.name === required)) fail(`missing ${required} (${names})`);
}

const parsedControl = gunzipSync(members.find((m) => m.name === 'control.tar.gz').data);
const parsedData = gunzipSync(members.find((m) => m.name === 'data.tar.gz').data);
const controlListing = readTar(parsedControl).map((entry) => entry.path);
const dataListing = readTar(parsedData).map((entry) => entry.path);

for (const required of [
  './control',
  './postinst',
  './opt/amin-lab-pro/server/dist/index.js',
  './opt/amin-lab-pro/runtime/bin/node',
  './opt/amin-lab-pro/client/src/index.html',
  './usr/bin/amin-lab-pro',
  `./lib/systemd/system/${PKG_NAME}.service`,
]) {
  if (!controlListing.includes(required) && !dataListing.includes(required)) {
    fail(`missing packaged path: ${required}`);
  }
}

const nodeBinary = readTar(parsedData).find(
  (entry) => entry.path === './opt/amin-lab-pro/runtime/bin/node',
);
if (!nodeBinary || nodeBinary.data.subarray(0, 4).toString('hex') !== '7f454c46') {
  fail('bundled runtime is not a linux ELF binary');
}

log('');
log('\u2714 built successfully');
log(`  file:     ${relative(ROOT, DEB_FILE).split('\\').join('/')}`);
log(`  size:     ${(built.length / 1024 / 1024).toFixed(1)} MB`);
log(`  files:    ${dataListing.length}`);
log(`  sha256:   ${checksum}`);
