/**
 * يفعّل hooks المستودع تلقائياً بعد `npm install` (سكربت prepare).
 *
 * `core.hooksPath` إعداد محلي لا يُدفع مع الفرع، فبدون هذه الخطوة يبقى
 * .githooks/pre-commit معطّلاً في كل نسخة جديدة من المستودع.
 * لا يُفشل التثبيت أبداً: نسخة ZIP أو جهاز بلا Git تمرّ بسلام.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOKS_PATH = '.githooks';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manual = `git config ${HOOKS_PATH === '.githooks' ? 'core.hooksPath .githooks' : ''}`;

if (!existsSync(join(root, '.git'))) process.exit(0);

const current = spawnSync('git', ['config', '--get', 'core.hooksPath'], {
  cwd: root,
  encoding: 'utf8',
});

if (current.error || current.status !== 0) {
  // git غير مثبت أو لا يوجد إعداد بعد: نحاول الضبط، وأي فشل يبقى تحذيراً.
  if (current.error) {
    console.warn('[hooks] Git غير متاح — نفّذ يدوياً: ' + manual);
    process.exit(0);
  }
}

const existing = (current.stdout ?? '').trim();
if (existing === HOOKS_PATH) {
  console.log(`[hooks] pre-commit مفعّل (core.hooksPath = ${HOOKS_PATH})`);
  process.exit(0);
}
if (existing) {
  console.warn(
    `[hooks] core.hooksPath يشير إلى "${existing}" — لم أغيّره. ` +
      `لتفعيل حماية الأسرار: ${manual}`,
  );
  process.exit(0);
}

const set = spawnSync('git', ['config', 'core.hooksPath', HOOKS_PATH], {
  cwd: root,
  encoding: 'utf8',
});

if (set.status === 0) {
  console.log(`[hooks] تم تفعيل pre-commit (core.hooksPath = ${HOOKS_PATH})`);
} else {
  const reason = (set.stderr || set.error?.message || 'خطأ غير معروف').split('\n')[0].trim();
  console.warn(`[hooks] تعذّر التفعيل (${reason}) — نفّذ يدوياً: ${manual}`);
}
process.exit(0);
