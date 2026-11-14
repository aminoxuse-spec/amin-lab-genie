#!/usr/bin/env node
/**
 * استيراد جرد من CSV عبر الـAPI (يتطلب خادماً يعمل).
 * الاستعمال: node scripts/import-inventory.mjs imports/equipment.csv [baseUrl] [user] [password]
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'imports/equipment.csv';
const base = process.argv[3] ?? 'http://127.0.0.1:3002';
const username = process.argv[4] ?? 'admin';
const password = process.argv[5] ?? 'admin123';

function parseCsv(text) {
  const content = text.replace(/^\uFEFF/, '');
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (quoted) {
      if (char === '"') {
        if (content[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') field += char;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const clean = rows.filter((cells) => cells.some((cell) => String(cell).trim() !== ''));
  const headers = clean[0].map((header) => header.trim());
  return clean.slice(1).map((cells) => {
    const record = {};
    headers.forEach((header, position) => {
      record[header] = (cells[position] ?? '').trim();
    });
    return record;
  });
}

async function api(path, options = {}) {
  const headers = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetch(base + '/api' + path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: response.status, data };
}

const login = await api('/auth/login', { method: 'POST', body: { username, password } });
if (login.status !== 200 || !login.data.token) {
  console.error('فشل تسجيل الدخول:', login.status, login.data);
  process.exit(1);
}
const token = login.data.token;

const existing = await api('/inventory', { token });
const usedCodes = new Set(existing.data.items.map((item) => String(item.code).toLowerCase()));
const before = existing.data.items.length;

const rows = parseCsv(readFileSync(file, 'utf8'));
console.log(`ملف: ${file} — ${rows.length} صفاً | الجرد الحالي: ${before} صنف`);

const stats = { ok: 0, failed: 0, renamed: 0, errors: [] };
const categories = new Set(['apparatus', 'glassware', 'chemical']);

for (const [index, row] of rows.entries()) {
  const line = index + 2;
  let code = String(row.code ?? '').trim();
  const name = String(row.name ?? '').trim();
  const category = String(row.category ?? 'apparatus').trim();

  if (!code || !name) {
    stats.failed += 1;
    stats.errors.push(`السطر ${line}: الرمز أو الاسم ناقص`);
    continue;
  }
  if (!categories.has(category)) {
    stats.failed += 1;
    stats.errors.push(`السطر ${line}: فئة غير صالحة (${category})`);
    continue;
  }

  // معالجة تكرار رقم الجرد الموجود مسبقاً بإضافة لاحقة -2، -3…
  if (usedCodes.has(code.toLowerCase())) {
    let suffix = 2;
    let candidate = `${code}-${suffix}`;
    while (usedCodes.has(candidate.toLowerCase())) {
      suffix += 1;
      candidate = `${code}-${suffix}`;
    }
    code = candidate;
    stats.renamed += 1;
  }

  const payload = {
    code,
    name,
    category,
    quantity: Number(row.quantity || 1),
    unit: row.unit || 'قطعة',
    min_quantity: Number(row.min_quantity || 1),
    location: row.location || '',
  };
  if (row.expiry_date) payload.expiry_date = row.expiry_date;

  const created = await api('/inventory', { method: 'POST', body: payload, token });
  if (created.status === 201) {
    stats.ok += 1;
    usedCodes.add(code.toLowerCase());
  } else {
    stats.failed += 1;
    if (stats.errors.length < 10) {
      stats.errors.push(`السطر ${line} (${code}): ${created.data.error ?? created.status}`);
    }
  }
}

const after = await api('/inventory', { token });
console.log('--- نتيجة الاستيراد ---');
console.log('ناجح:', stats.ok, '| فاشل:', stats.failed, '| رموز أُضيفت لها لاحقة:', stats.renamed);
console.log('الجرد قبل:', before, '→ بعد:', after.data.items.length);
if (stats.errors.length) {
  console.log('أخطاء:');
  stats.errors.forEach((error) => console.log(' -', error));
}
process.exit(stats.failed === 0 ? 0 : 2);
