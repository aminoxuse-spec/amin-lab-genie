import test from 'node:test';
import assert from 'node:assert/strict';
import { parseId, validateBody, type Rule } from '../../server/src/middleware/validation.ts';

type FakeResult = {
  nextCalled: boolean;
  status: number;
  payload: unknown;
  body: Record<string, unknown>;
};

function run(rules: Record<string, Rule>, body: Record<string, unknown>): FakeResult {
  const req = { body } as { body: Record<string, unknown> };
  const result: FakeResult = { nextCalled: false, status: 0, payload: null, body };
  const res = {
    status(code: number) {
      result.status = code;
      return this;
    },
    json(payload: unknown) {
      result.payload = payload;
      return this;
    },
  };
  validateBody(rules)(req as never, res as never, () => {
    result.nextCalled = true;
  });
  result.body = req.body;
  return result;
}

const rules: Record<string, Rule> = {
  name: { type: 'string', required: true, minLength: 3, maxLength: 10 },
  quantity: { type: 'int', required: true, min: 1, max: 50 },
  category: { type: 'enum', enum: ['apparatus', 'glassware'] },
  session_date: { type: 'date' },
  start_time: { type: 'time' },
};

test('يقبل الطلب الصالح ويقصّ المسافات', () => {
  const result = run(rules, {
    name: '  مجهر  ',
    quantity: '4',
    category: 'apparatus',
    session_date: '2026-11-13',
    start_time: '08:30',
    extra: 'يجب حذفه',
  });
  assert.equal(result.nextCalled, true);
  assert.deepEqual(result.body, {
    name: 'مجهر',
    quantity: 4,
    category: 'apparatus',
    session_date: '2026-11-13',
    start_time: '08:30',
  });
});

test('يرفض الحقول المطلوبة الناقصة', () => {
  const result = run(rules, {});
  assert.equal(result.nextCalled, false);
  assert.equal(result.status, 400);
  const payload = result.payload as { details: string[] };
  assert.equal(payload.details.length, 2);
});

test('يرفض الأنواع والقيم غير الصالحة', () => {
  const result = run(rules, {
    name: 'ab',
    quantity: 1.5,
    category: 'chemical',
    session_date: '13/11/2026',
    start_time: '25:00',
  });
  assert.equal(result.nextCalled, false);
  assert.equal(result.status, 400);
  const details = (result.payload as { details: string[] }).details.join(' ');
  assert.match(details, /name/);
  assert.match(details, /quantity/);
  assert.match(details, /category/);
  assert.match(details, /session_date/);
  assert.match(details, /start_time/);
});

test('parseId يرفض المعرّفات غير الصالحة', () => {
  assert.equal(parseId('12'), 12);
  assert.throws(() => parseId('0'));
  assert.throws(() => parseId('abc'));
  assert.throws(() => parseId(undefined));
});
