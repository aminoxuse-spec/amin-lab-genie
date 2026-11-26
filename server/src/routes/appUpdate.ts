import { Router } from 'express';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, normalize, resolve, sep } from 'node:path';
import { requireAdmin, requireAuth } from '../middleware/auth.ts';
import { CLIENT_OVERLAY_DIR } from '../config.ts';
import { logger } from '../utils/logger.ts';

const router = Router();

/** امتدادات نصية فقط: لا تُقبل ملفات ثنائية عبر الرفع. */
const ALLOWED_EXT = /\.(html|js|css|json|webmanifest|svg|txt)$/i;

function listOverlayFiles(dir = CLIENT_OVERLAY_DIR, base = CLIENT_OVERLAY_DIR): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listOverlayFiles(full, base));
    } else if (entry.isFile() && !full.endsWith('version.json')) {
      files.push(full.slice(base.length + 1).split(sep).join('/'));
    }
  }
  return files;
}

function readVersion(): { version: string; appliedAt: string } | null {
  const file = join(CLIENT_OVERLAY_DIR, 'version.json');
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { version?: string; appliedAt?: string };
    if (!parsed.version) return null;
    return { version: parsed.version, appliedAt: parsed.appliedAt ?? '' };
  } catch {
    return null;
  }
}

/** حالة طبقة تحديث الواجهة. */
router.get('/client-update', requireAuth, (_req, res) => {
  const version = readVersion();
  res.json({
    applied: Boolean(version),
    version: version?.version ?? null,
    appliedAt: version?.appliedAt ?? null,
    files: listOverlayFiles(),
  });
});

/**
 * تطبيق حزمة واجهة (ملف client-bundle.json المولّد محلياً).
 * تُستبدل الطبقة بالكامل ثم تُقدَّم فوراً دون إعادة تشغيل.
 */
router.post('/client-update', requireAuth, requireAdmin, (req, res) => {
  const body = req.body as { version?: unknown; files?: unknown };
  const version = typeof body.version === 'string' ? body.version.trim().slice(0, 60) : '';
  const files = Array.isArray(body.files) ? body.files : null;
  if (!version || !files || files.length === 0) {
    res.status(400).json({ error: 'حزمة غير صالحة: version و files مطلوبان' });
    return;
  }
  if (files.length > 400) {
    res.status(400).json({ error: 'عدد الملفات كبير جداً' });
    return;
  }

  const target = resolve(CLIENT_OVERLAY_DIR);
  const prepared: { path: string; content: string }[] = [];
  for (const entry of files as { path?: unknown; content?: unknown }[]) {
    const rawPath = typeof entry?.path === 'string' ? entry.path.replace(/\\/g, '/') : '';
    const content = typeof entry?.content === 'string' ? entry.content : null;
    if (!rawPath || content === null) {
      res.status(400).json({ error: 'كل ملف يحتاج path و content نصيين' });
      return;
    }
    if (!ALLOWED_EXT.test(rawPath) || rawPath.includes('..') || rawPath.startsWith('/')) {
      res.status(400).json({ error: `مسار غير مسموح: ${rawPath}` });
      return;
    }
    const full = resolve(join(target, normalize(rawPath)));
    if (!full.startsWith(target + sep)) {
      res.status(400).json({ error: `مسار خارج مجلد التحديث: ${rawPath}` });
      return;
    }
    prepared.push({ path: rawPath, content });
  }

  try {
    rmSync(target, { recursive: true, force: true });
    for (const file of prepared) {
      const full = join(target, file.path);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, file.content, 'utf8');
    }
    writeFileSync(
      join(target, 'version.json'),
      JSON.stringify({ version, appliedAt: new Date().toISOString(), files: prepared.length }, null, 2),
      'utf8',
    );
    logger.info('تحديث واجهة مطبّق', { version, files: prepared.length });
    res.json({ ok: true, applied: true, version, files: prepared.length });
  } catch (error) {
    logger.error('فشل تطبيق تحديث الواجهة', {
      message: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'تعذّر تطبيق التحديث' });
  }
});

/** حذف الطبقة والعودة إلى الواجهة المثبّتة. */
router.delete('/client-update', requireAuth, requireAdmin, (_req, res) => {
  rmSync(CLIENT_OVERLAY_DIR, { recursive: true, force: true });
  logger.info('إزالة طبقة تحديث الواجهة');
  res.json({ ok: true, applied: false });
});

export default router;
