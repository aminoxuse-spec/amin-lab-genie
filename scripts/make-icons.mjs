import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

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

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(size, pixel) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixel((x + 0.5) / size, (y + 0.5) / size);
      const offset = y * (stride + 1) + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function insideRoundedSquare(x, y, radius) {
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - radius), 0);
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - radius), 0);
  return dx * dx + dy * dy <= radius * radius;
}

/** شكل دورق مخبري بسيط (رقبة + جسم مخروطي). */
function insideFlask(x, y) {
  if (y > 0.17 && y < 0.215 && Math.abs(x - 0.5) < 0.085) return true; // حلقة الفتحة
  if (x > 0.435 && x < 0.565 && y >= 0.215 && y < 0.44) return true; // الرقبة
  if (y >= 0.44 && y <= 0.735) {
    const t = (y - 0.44) / 0.295;
    const half = 0.065 + t * 0.195;
    if (Math.abs(x - 0.5) < half) return true;
  }
  return false;
}

function pixel(x, y) {
  if (!insideRoundedSquare(x, y, 0.22)) return [0, 0, 0, 0];

  // تدرّج رأسي بين درجتي الأخضر المائي
  const t = y;
  const r = Math.round(20 - 5 * t);
  const g = Math.round(184 - 66 * t);
  const b = Math.round(166 - 57 * t);

  if (insideFlask(x, y)) {
    // سائل أخضر فاتح في أسفل الدورق
    if (y > 0.62) return [236, 254, 255, 255];
    return [255, 255, 255, 255];
  }

  // حلقة ضوء خفيفة أعلى اليسار
  const glow = Math.hypot(x - 0.28, y - 0.24);
  if (glow < 0.22) {
    const mix = 1 - glow / 0.22;
    return [
      Math.min(255, Math.round(r + 60 * mix)),
      Math.min(255, Math.round(g + 40 * mix)),
      Math.min(255, Math.round(b + 40 * mix)),
      255,
    ];
  }

  return [r, g, b, 255];
}

const targets = [
  ['client/src/assets/icons/icon-192.png', 192],
  ['client/src/assets/icons/icon-512.png', 512],
  ['client/src/assets/icons/favicon.png', 32],
];

for (const [file, size] of targets) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, encodePng(size, pixel));
  console.log(`✔ ${file} (${size}×${size})`);
}

// favicon.ico يغلّف صورة PNG بحجم 32×32
const png32 = encodePng(32, pixel);
const icoHeader = Buffer.alloc(6 + 16);
icoHeader.writeUInt16LE(0, 0);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(1, 4);
icoHeader[6] = 32;
icoHeader[7] = 32;
icoHeader[8] = 0;
icoHeader[9] = 0;
icoHeader.writeUInt16LE(1, 10);
icoHeader.writeUInt16LE(32, 12);
icoHeader.writeUInt32LE(png32.length, 14);
icoHeader.writeUInt32LE(22, 18);
writeFileSync('client/src/assets/icons/favicon.ico', Buffer.concat([icoHeader, png32]));
console.log('✔ client/src/assets/icons/favicon.ico');
