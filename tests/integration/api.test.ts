import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

const dataDir = mkdtempSync(join(tmpdir(), 'amin-lab-genie-test-'));
// خزنة ربط الجهاز مؤقتة: لا يجوز أن يكتب الاختبار في ProgramData الحقيقي
const vaultDir = mkdtempSync(join(tmpdir(), 'amin-lab-genie-vault-test-'));
process.env.DATA_DIR = dataDir;
process.env.AMIN_LAB_VAULT_DIR = vaultDir;
process.env.BACKUP_DIR = join(dataDir, 'backups');
process.env.DB_PATH = join(dataDir, 'test.sqlite');
process.env.APP_SECRET = 'test-secret';
process.env.ADMIN_PASSWORD = 'test-admin-pass';
process.env.TEACHER_PASSWORD = 'test-teacher-pass';

const { createApp } = await import('../../server/src/app.ts');
const { seed } = await import('../../server/src/seed.ts');
const { db } = await import('../../server/src/db.ts');
seed();

const server = createApp().listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', () => resolve()));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

test.after(() => {
  server.close();
  // Close SQLite first: on Windows an open handle blocks removing the folder.
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(vaultDir, { recursive: true, force: true });
});

let token = '';

async function call(path: string, options: { method?: string; body?: unknown; auth?: string } = {}) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.auth !== '') headers.Authorization = `Bearer ${options.auth ?? token}`;
  const response = await fetch(base + path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: response.status, data };
}

test('health يعمل بدون مصادقة', async () => {
  const response = await call('/api/health', { auth: '' });
  assert.equal(response.status, 200);
  assert.equal(response.data.ok, true);
  assert.equal(response.data.app, 'Amin-Lab -Pro🔬');
});

test('المسارات المحمية ترفض الطلبات بدون رمز', async () => {
  const response = await call('/api/inventory', { auth: '' });
  assert.equal(response.status, 401);
});

test('تسجيل الدخول يرفض بيانات خاطئة ويقبل الصحيحة', async () => {
  const bad = await call('/api/auth/login', {
    method: 'POST',
    auth: '',
    body: { username: 'admin', password: 'wrong-password' },
  });
  assert.equal(bad.status, 401);

  const good = await call('/api/auth/login', {
    method: 'POST',
    auth: '',
    body: { username: 'admin', password: 'test-admin-pass' },
  });
  assert.equal(good.status, 200);
  assert.equal(good.data.user.role, 'admin');
  token = good.data.token;

  const me = await call('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user.username, 'admin');
});

test('الجرد يبدأ ببيانات تجريبية ويقبل إضافة صنف', async () => {
  const list = await call('/api/inventory');
  assert.equal(list.status, 200);
  assert.ok(list.data.items.length >= 13);

  const created = await call('/api/inventory', {
    method: 'POST',
    body: { code: 'TST-001', name: 'صنف اختبار', category: 'apparatus', quantity: 5, unit: 'قطعة', min_quantity: 1 },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.item.available_quantity, 5);

  const duplicate = await call('/api/inventory', {
    method: 'POST',
    body: { code: 'TST-001', name: 'مكرر', category: 'apparatus', quantity: 1 },
  });
  assert.equal(duplicate.status, 409);

  const invalid = await call('/api/inventory', {
    method: 'POST',
    body: { code: 'X', name: 'ن', category: 'invalid', quantity: -3 },
  });
  assert.equal(invalid.status, 400);
});

test('حذف صنف ينقله إلى سلة المحذوفات ويمكن استرجاعه أو حذفه نهائياً', async () => {
  const created = await call('/api/inventory', {
    method: 'POST',
    body: { code: 'TRS-001', name: 'صنف للاسترجاع', category: 'glassware', quantity: 3 },
  });
  assert.equal(created.status, 201);
  const id = created.data.item.id;

  const removed = await call(`/api/inventory/${id}`, { method: 'DELETE' });
  assert.equal(removed.status, 200);
  assert.equal(removed.data.restorable, true);

  const active = await call('/api/inventory');
  assert.ok(!active.data.items.some((item: { id: number }) => item.id === id));
  assert.ok(active.data.summary.deleted >= 1);

  const trash = await call('/api/inventory/deleted');
  assert.equal(trash.status, 200);
  assert.ok(trash.data.items.some((item: { id: number }) => item.id === id));

  const restored = await call(`/api/inventory/${id}/restore`, { method: 'POST' });
  assert.equal(restored.status, 200);
  assert.equal(restored.data.item.id, id);
  assert.equal(restored.data.item.deleted_at, null);

  const afterRestore = await call('/api/inventory');
  assert.ok(afterRestore.data.items.some((item: { id: number }) => item.id === id));

  const restoreAgain = await call(`/api/inventory/${id}/restore`, { method: 'POST' });
  assert.equal(restoreAgain.status, 404);

  await call(`/api/inventory/${id}`, { method: 'DELETE' });
  const purged = await call(`/api/inventory/${id}/permanent`, { method: 'DELETE' });
  assert.equal(purged.status, 200);

  const trashAfter = await call('/api/inventory/deleted');
  assert.ok(!trashAfter.data.items.some((item: { id: number }) => item.id === id));
});

test('إعارة متعددة الأصناف + إرجاع كامل يعيد المخزون', async () => {
  const inventory = (await call('/api/inventory')).data.items as Array<{ id: number; code: string; available_quantity: number }>;
  const beaker = inventory.find((item) => item.code === 'GLS-002');
  const microscope = inventory.find((item) => item.code === 'APP-001');
  assert.ok(beaker && microscope);

  const rooms = (await call('/api/rooms')).data.rooms as Array<{ id: number }>;
  const session = await call('/api/borrowing', {
    method: 'POST',
    body: {
      room_id: rooms[0].id,
      class_name: 'الجذع المشترك العلمي 1',
      subject: 'الفيزياء والكيمياء',
      session_date: '2026-11-13',
      start_time: '08:00',
      end_time: '10:00',
      items: [
        { inventory_id: beaker.id, quantity: 4 },
        { inventory_id: microscope.id, quantity: 2 },
      ],
    },
  });
  assert.equal(session.status, 201);
  assert.equal(session.data.session.items.length, 2);
  assert.equal(session.data.session.status, 'open');

  const afterBorrow = (await call('/api/inventory')).data.items as Array<{ id: number; available_quantity: number }>;
  assert.equal(afterBorrow.find((item) => item.id === beaker.id)?.available_quantity, beaker.available_quantity - 4);

  const overReturn = await call(`/api/borrowing/${session.data.session.id}/return`, {
    method: 'POST',
    body: { items: [{ item_id: session.data.session.items[0].id, quantity: 99, condition_in: 'good' }] },
  });
  assert.equal(overReturn.status, 400);

  const returnLines = session.data.session.items.map((item: { id: number; quantity_out: number }) => ({
    item_id: item.id,
    quantity: item.quantity_out,
    condition_in: 'good',
  }));
  const returned = await call(`/api/borrowing/${session.data.session.id}/return`, {
    method: 'POST',
    body: { items: returnLines },
  });
  assert.equal(returned.status, 200);
  assert.equal(returned.data.session.status, 'returned');

  const afterReturn = (await call('/api/inventory')).data.items as Array<{ id: number; available_quantity: number }>;
  assert.equal(afterReturn.find((item) => item.id === beaker.id)?.available_quantity, beaker.available_quantity);
});

test('الإرجاع الجزئي يحفظ حالة partial ويرفض تجاوز الكمية', async () => {
  const inventory = (await call('/api/inventory')).data.items as Array<{ id: number; code: string }>;
  const tubes = inventory.find((item) => item.code === 'GLS-001');
  assert.ok(tubes);

  const session = await call('/api/borrowing', {
    method: 'POST',
    body: {
      class_name: 'الأولى باك',
      subject: 'علوم الحياة والأرض',
      session_date: '2026-11-12',
      start_time: '10:00',
      end_time: '12:00',
      items: [{ inventory_id: tubes.id, quantity: 6 }],
    },
  });
  assert.equal(session.status, 201);

  const line = session.data.session.items[0];
  const partial = await call(`/api/borrowing/${session.data.session.id}/return`, {
    method: 'POST',
    body: { items: [{ item_id: line.id, quantity: 2, condition_in: 'good' }] },
  });
  assert.equal(partial.status, 200);
  assert.equal(partial.data.session.status, 'partial');
});

test('إعارة متعددة العناصر: عتاد + مادة مستهلكة مع وصل وتقارير وتصدير Excel', async () => {
  const inventory = (await call('/api/inventory')).data.items as Array<{ id: number; code: string; category: string }>;
  const chemical = inventory.find((item) => item.code === 'CHM-004');
  const glass = inventory.find((item) => item.code === 'GLS-003');
  const apparatus = inventory.find((item) => item.code === 'APP-002');
  assert.ok(chemical && glass && apparatus);

  const consumedOnEquipment = await call('/api/borrowing', {
    method: 'POST',
    body: {
      class_name: '2',
      subject: 'الفيزياء',
      session_date: new Date().toISOString().slice(0, 10),
      start_time: '08:00',
      items: [{ inventory_id: apparatus.id, quantity: 1, condition_out: 'consumed' }],
    },
  });
  assert.equal(consumedOnEquipment.status, 400);

  const created = await call('/api/borrowing', {
    method: 'POST',
    body: {
      level: 'الجذع المشترك العلمي',
      class_name: '2',
      subject: 'الفيزياء والكيمياء',
      session_date: new Date().toISOString().slice(0, 10),
      start_time: '09:00',
      notes: 'تجربة متعددة العناصر',
      items: [
        { inventory_id: chemical.id, quantity: 2, condition_out: 'consumed', notes: 'حمض مخفف' },
        { inventory_id: glass.id, quantity: 3, condition_out: 'good' },
      ],
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.session.items.length, 2);
  assert.equal(created.data.session.level, 'الجذع المشترك العلمي');
  assert.equal(created.data.session.end_time, '10:00'); // تُحسب ساعة واحدة تلقائياً
  assert.equal(created.data.session.status, 'open');

  const receipt = await call(`/api/borrowing/${created.data.session.id}/receipt`);
  assert.equal(receipt.status, 200);
  assert.equal(receipt.data.totals.consumed, 2);
  assert.equal(receipt.data.totals.outstanding, 3);

  const consumedLine = created.data.session.items.find((item: { condition_out: string }) => item.condition_out === 'consumed');
  const rejected = await call(`/api/borrowing/${created.data.session.id}/return`, {
    method: 'POST',
    body: { items: [{ item_id: consumedLine.id, quantity: 1, condition_in: 'good' }] },
  });
  assert.equal(rejected.status, 400);

  const glassLine = created.data.session.items.find((item: { condition_out: string }) => item.condition_out === 'good');
  const returned = await call(`/api/borrowing/${created.data.session.id}/return`, {
    method: 'POST',
    body: { items: [{ item_id: glassLine.id, quantity: 3, condition_in: 'good' }] },
  });
  assert.equal(returned.status, 200);
  assert.equal(returned.data.session.status, 'returned');

  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  const teachers = await call(`/api/reports/teachers?from=${from}&to=${today}`);
  assert.equal(teachers.status, 200);
  assert.ok(teachers.data.rows.length >= 1);
  assert.ok(teachers.data.columns.some((column: { key: string }) => column.key === 'consumed'));

  const equipment = await call(`/api/reports/equipment?from=${from}&to=${today}`);
  assert.equal(equipment.status, 200);
  assert.ok(equipment.data.rows.every((row: { category: string }) => row.category !== 'مواد كيميائية'));

  const chemicals = await call(`/api/reports/chemicals?from=${from}&to=${today}`);
  assert.equal(chemicals.status, 200);
  const water = chemicals.data.rows.find((row: { code: string }) => row.code === 'CHM-004');
  assert.ok(water && water.consumed >= 2);

  const late = await call('/api/reports/late');
  assert.equal(late.status, 200);
  assert.ok(Array.isArray(late.data.rows));

  const xls = await call(`/api/reports/teachers.xls?from=${from}&to=${today}`);
  assert.equal(xls.status, 200);
  assert.match(String(xls.data.raw), /<Workbook/);

  const csv = await call(`/api/reports/chemicals.csv?from=${from}&to=${today}`);
  assert.equal(csv.status, 200);
  assert.match(String(csv.data.raw), /المادة/);

  const unknown = await call('/api/reports/unknown');
  assert.equal(unknown.status, 404);
});

test('مراقبة الجودة تسجل فحصاً وتحدّث المؤشرات', async () => {
  const inventory = (await call('/api/inventory')).data.items as Array<{ id: number; code: string }>;
  const chemical = inventory.find((item) => item.code === 'CHM-001');
  assert.ok(chemical);

  const check = await call('/api/qc', {
    method: 'POST',
    body: { inventory_id: chemical.id, status: 'low', quantity_found: 2, notes: 'كمية منخفضة' },
  });
  assert.equal(check.status, 201);

  const analysis = await call('/api/qc/analysis');
  assert.equal(analysis.status, 200);
  assert.ok(analysis.data.summary.totalChecks >= 1);
  assert.ok(Array.isArray(analysis.data.trend));
});

test('استعمال الزمن يكشف التعارض في نفس القاعة', async () => {
  const rooms = (await call('/api/rooms')).data.rooms as Array<{ id: number }>;
  const body = {
    room_id: rooms[0].id,
    class_name: 'قسم أ',
    subject: 'الفيزياء',
    day_of_week: 2,
    start_time: '09:00',
    end_time: '10:00',
  };
  const first = await call('/api/schedule', { method: 'POST', body });
  assert.equal(first.status, 201);

  const conflict = await call('/api/schedule', { method: 'POST', body: { ...body, class_name: 'قسم ب' } });
  assert.equal(conflict.status, 409);
});

test('التقارير اليومية والأسبوعية وملفات CSV', async () => {
  const daily = await call('/api/reports/daily?date=2026-11-13');
  assert.equal(daily.status, 200);
  assert.equal(daily.data.date, '2026-11-13');
  assert.ok(daily.data.sessions.length >= 1);
  assert.ok(daily.data.totals.unitsOut >= 6);

  const weekly = await call('/api/reports/weekly?start=2026-11-07');
  assert.equal(weekly.status, 200);
  assert.equal(weekly.data.days.length, 7);
  assert.ok(weekly.data.topItems.length >= 1);

  const csv = await call('/api/reports/daily.csv?date=2026-11-13');
  assert.equal(csv.status, 200);
  assert.match(String(csv.data.raw), /التاريخ/);

  const future = await call('/api/reports/daily?date=2026-12-31');
  assert.equal(future.status, 200);
  assert.equal(future.data.sessions.length, 0);
});

test('الإعدادات وإدارة المستخدمين وتغيير كلمة المرور', async () => {
  const info = await call('/api/settings');
  assert.equal(info.status, 200);
  assert.equal(info.data.app, 'Amin-Lab -Pro🔬');
  assert.ok(info.data.counts.users >= 2);
  assert.ok(info.data.users.length >= 2);
  assert.ok(info.data.rooms.length >= 1);

  const created = await call('/api/auth/users', {
    method: 'POST',
    body: { username: 't_edit', full_name: 'أستاذ للتعديل', role: 'teacher', password: 'secret123' },
  });
  assert.equal(created.status, 201);
  const userId = created.data.user.id;

  const renamed = await call(`/api/auth/users/${userId}`, {
    method: 'PUT',
    body: { full_name: 'أستاذ معدّل', role: 'teacher' },
  });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.data.user.full_name, 'أستاذ معدّل');

  const login = await call('/api/auth/login', {
    method: 'POST',
    body: { username: 't_edit', password: 'secret123' },
  });
  assert.equal(login.status, 200);
  const userToken = login.data.token as string;

  const wrong = await call('/api/auth/password', {
    method: 'PUT',
    auth: userToken,
    body: { current_password: 'wrong-pass', new_password: 'newsecret123' },
  });
  assert.equal(wrong.status, 400);

  const changed = await call('/api/auth/password', {
    method: 'PUT',
    auth: userToken,
    body: { current_password: 'secret123', new_password: 'newsecret123' },
  });
  assert.equal(changed.status, 200);

  const relogin = await call('/api/auth/login', {
    method: 'POST',
    body: { username: 't_edit', password: 'newsecret123' },
  });
  assert.equal(relogin.status, 200);

  const removed = await call(`/api/auth/users/${userId}`, { method: 'DELETE' });
  assert.equal(removed.status, 200);
});

test('تعديل الحصص والفحوصات وبيانات الإعارة', async () => {
  const rooms = await call('/api/rooms');
  const roomId = rooms.data.rooms[0].id as number;

  const created = await call('/api/schedule', {
    method: 'POST',
    body: { room_id: roomId, class_name: 'قسم أ', subject: 'الأحياء', day_of_week: 2, start_time: '08:00', end_time: '09:00' },
  });
  assert.equal(created.status, 201);
  const lessonId = created.data.id;

  const updated = await call(`/api/schedule/${lessonId}`, {
    method: 'PUT',
    body: { room_id: roomId, class_name: 'قسم أ', subject: 'الجيولوجيا', day_of_week: 2, start_time: '08:00', end_time: '09:00' },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.schedule.subject, 'الجيولوجيا');

  const conflicting = await call('/api/schedule', {
    method: 'POST',
    body: { room_id: roomId, class_name: 'قسم ب', subject: 'الفيزياء', day_of_week: 2, start_time: '08:30', end_time: '09:30' },
  });
  assert.equal(conflicting.status, 409);
  await call(`/api/schedule/${lessonId}`, { method: 'DELETE' });

  const inventory = (await call('/api/inventory')).data.items as Array<{ id: number; available_quantity: number }>;
  const qcItem = inventory[0];
  const borrowItem = inventory.find((item) => item.id !== qcItem.id && item.available_quantity > 0);
  assert.ok(borrowItem);

  const check = await call('/api/qc', {
    method: 'POST',
    body: { inventory_id: qcItem.id, status: 'ok', quantity_found: qcItem.available_quantity },
  });
  assert.equal(check.status, 201);
  const checkId = check.data.id;

  const checkUpdated = await call(`/api/qc/${checkId}`, {
    method: 'PUT',
    body: { status: 'low', quantity_found: 1, notes: 'انخفض المخزون بعد التجربة' },
  });
  assert.equal(checkUpdated.status, 200);
  assert.equal(checkUpdated.data.check.status, 'low');

  const today = new Date().toISOString().slice(0, 10);
  const session = await call('/api/borrowing', {
    method: 'POST',
    body: {
      class_name: 'قسم ج',
      subject: 'الكيمياء',
      session_date: today,
      start_time: '11:00',
      end_time: '12:00',
      items: [{ inventory_id: borrowItem!.id, quantity: 1 }],
    },
  });
  assert.equal(session.status, 201);

  const edited = await call(`/api/borrowing/${session.data.session.id}`, {
    method: 'PUT',
    body: { class_name: 'قسم ج', subject: 'الكيمياء', session_date: today, start_time: '11:00', end_time: '13:00', level: 'الأولى باك', notes: 'تعديل بيانات الحصة' },
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.session.end_time, '13:00');
  assert.equal(edited.data.session.level, 'الأولى باك');
  assert.equal(edited.data.session.notes, 'تعديل بيانات الحصة');
});

test('معلومات المؤسسة: عامة للقراءة وتُحفظ من المدير فقط', async () => {
  const publicInfo = await call('/api/institution', { auth: '' });
  assert.equal(publicInfo.status, 200);
  assert.equal(typeof publicInfo.data.institution.logo_in_print, 'boolean');

  const denied = await call('/api/settings/institution', {
    method: 'PUT',
    auth: '',
    body: { name: 'اسم' },
  });
  assert.equal(denied.status, 401);

  const saved = await call('/api/settings/institution', {
    method: 'PUT',
    body: {
      name: 'ثانوية ابن سينا التأهيلية',
      name_fr: 'Lycée Ibn Sina',
      logo: 'data:image/png;base64,iVBORw0KGgo=',
      logo_in_print: false,
      signature_lab: 'محمد العلمي',
      signature_lab_fr: 'Mohamed Alami',
      signature_counselor: 'سعاد بناني',
      signature_counselor_fr: 'Souad Bennani',
      signature_director: 'أحمد الإدريسي',
      signature_director_fr: 'Ahmed Idrissi',
    },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.institution.logo_in_print, false);

  const after = await call('/api/institution', { auth: '' });
  assert.equal(after.data.institution.name, 'ثانوية ابن سينا التأهيلية');
  assert.equal(after.data.institution.name_fr, 'Lycée Ibn Sina');
  assert.equal(after.data.institution.signature.director_fr, 'Ahmed Idrissi');
  assert.ok(String(after.data.institution.logo).startsWith('data:image/png'));

  const badLogo = await call('/api/settings/institution', {
    method: 'PUT',
    body: { logo: 'not-an-image' },
  });
  assert.equal(badLogo.status, 400);

  const settings = await call('/api/settings');
  assert.equal(settings.data.institution.name, 'ثانوية ابن سينا التأهيلية');
});

test('البحث السريع عن وسيلة (ماسح QR) وحالة الترخيص', async () => {
  const exact = await call('/api/inventory/lookup?code=APP-001');
  assert.equal(exact.status, 200);
  assert.equal(exact.data.exact, true);
  assert.ok(exact.data.items.some((item: { code: string }) => item.code === 'APP-001'));

  const prefixed = await call('/api/inventory/lookup?code=' + encodeURIComponent('AMIN:APP-001'));
  assert.equal(prefixed.status, 200);
  assert.ok(prefixed.data.items.some((item: { code: string }) => item.code === 'APP-001'));

  const partial = await call('/api/inventory/lookup?code=APP');
  assert.equal(partial.status, 200);
  assert.ok(partial.data.items.length >= 1);

  const missing = await call('/api/inventory/lookup?code=ZZZ-999');
  assert.equal(missing.status, 200);
  assert.equal(missing.data.items.length, 0);

  const empty = await call('/api/inventory/lookup?code=');
  assert.equal(empty.status, 400);

  const before = await call('/api/settings/license');
  assert.equal(before.status, 200);
  assert.equal(before.data.trial, true);

  const invalid = await call('/api/settings/license', {
    method: 'PUT',
    body: { key: 'AAAA-BBBB-CCCC-DDDD' },
  });
  assert.equal(invalid.status, 400);

  const { licenseKey } = await import('../../server/src/utils/license.ts');
  const activated = await call('/api/settings/license', {
    method: 'PUT',
    body: { key: licenseKey() },
  });
  assert.equal(activated.status, 200);
  assert.equal(activated.data.active, true);

  const after = await call('/api/settings/license');
  assert.equal(after.data.trial, false);

  const off = await call('/api/settings/license', { method: 'DELETE' });
  assert.equal(off.status, 200);
  assert.equal(off.data.trial, true);
});

test('المسارات غير الموجودة ترجع 404 بصيغة JSON', async () => {
  const missing = await call('/api/does-not-exist');
  assert.equal(missing.status, 404);
  assert.ok(missing.data.error);
});

test('بوابة الترخيص تقفل واجهات العمل بعد التجربة وتُبقي الإعدادات متاحة', async () => {
  const { setSettings } = await import('../../server/src/models/Setting.ts');
  setSettings({
    'license.trial_started_at': new Date(Date.now() - 40 * 86400000).toISOString(),
    'license.key': '',
    'license.expires_at': '',
  });

  const denied = await call('/api/inventory');
  assert.equal(denied.status, 403);
  assert.equal(denied.data.code, 'TRIAL_EXPIRED');

  const settings = await call('/api/settings/license');
  assert.equal(settings.status, 200);
  assert.equal(settings.data.locked, true);

  setSettings({ 'license.trial_started_at': new Date().toISOString() });
  const allowed = await call('/api/inventory');
  assert.equal(allowed.status, 200);
});
