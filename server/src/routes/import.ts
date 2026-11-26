import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.ts';
import { applyWeeklyImport, planWeeklyImport } from '../services/weeklyImport.ts';

const router = Router();

/**
 * POST /api/import/weekly
 * { text: "جدول التقرير", report_no?: "06", dryRun?: true }
 * الاستيراد idempotent: يُتجاهل أي جلسة بنفس (الأستاذ، التاريخ، ساعة البداية).
 */
router.post('/weekly', requireAuth, requireAdmin, (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const text = typeof body.text === 'string' ? body.text : '';
  const reportNo = typeof body.report_no === 'string' ? body.report_no.trim().slice(0, 20) : '';
  const dryRun = body.dryRun === true;

  if (text.trim().length < 5) {
    res.status(400).json({ error: 'الصق جدول التقرير الأسبوعي أولاً' });
    return;
  }
  if (text.length > 300_000) {
    res.status(400).json({ error: 'النص كبير جداً (الحد 300 ألف حرف)' });
    return;
  }

  const plan = planWeeklyImport(text, reportNo);
  const result = dryRun ? null : applyWeeklyImport(plan, reportNo);

  res.json({
    dryRun,
    inserted: result?.inserted ?? 0,
    lines: result?.lines ?? 0,
    skipped: plan.skipped,
    unresolvedItems: plan.unresolvedItems,
    duplicates: plan.sessions.filter((session) => session.duplicate).length,
    sessions: plan.sessions.map((session) => ({
      date: session.date,
      start: session.start,
      end: session.end,
      teacher: session.teacherName,
      className: session.className,
      level: session.level,
      subject: session.subject,
      items: session.lines.length,
      units: session.lines.reduce((sum, line) => sum + line.quantity, 0),
      unresolved: session.unresolved,
      duplicate: session.duplicate,
    })),
  });
});

export default router;
