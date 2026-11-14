import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, signToken, verifyPassword, verifyToken } from '../../server/src/utils/security.ts';

test('hashPassword ينتج تجزئة scrypt مختلفة في كل مرة', () => {
  const first = hashPassword('admin123');
  const second = hashPassword('admin123');
  assert.match(first, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.notEqual(first, second);
});

test('verifyPassword يقبل كلمة المرور الصحيحة ويرفض الخاطئة', () => {
  const hash = hashPassword('s3cret-pass');
  assert.equal(verifyPassword('s3cret-pass', hash), true);
  assert.equal(verifyPassword('s3cret-pas', hash), false);
  assert.equal(verifyPassword('', hash), false);
});

test('verifyPassword يرفض تجزئة بصيغة غير معروفة', () => {
  assert.equal(verifyPassword('x', 'plain$abc$def'), false);
  assert.equal(verifyPassword('x', ''), false);
});

test('signToken / verifyToken دورة صحيحة', () => {
  const token = signToken({ id: 7, username: 'teacher', role: 'teacher' });
  const payload = verifyToken(token);
  assert.ok(payload);
  assert.equal(payload?.sub, 7);
  assert.equal(payload?.role, 'teacher');
  assert.equal(payload?.username, 'teacher');
});

test('verifyToken يرفض التوقيع المعدّل والرمز المنتهي', () => {
  const token = signToken({ id: 1, username: 'admin', role: 'admin' });
  const [body] = token.split('.');
  assert.equal(verifyToken(`${body}.tampered`), null);
  assert.equal(verifyToken('not-a-token'), null);
  assert.equal(verifyToken(''), null);

  const expired = signToken({ id: 1, username: 'admin', role: 'admin' }, -10);
  assert.equal(verifyToken(expired), null);
});
