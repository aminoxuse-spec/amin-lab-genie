import { Router } from 'express';
import { requireAuth } from '../middleware/auth.ts';
import {
  TABLE_REPORTS,
  coverage,
  daily,
  dailyCsv,
  dailyXls,
  tableReport,
  tableReportCsv,
  tableReportXls,
  weekly,
  weeklyCsv,
  weeklyXls,
} from '../controllers/report-controller.ts';

const router = Router();

// تغطية التقارير الأسبوعية والأسابيع الناقصة
router.get('/coverage', requireAuth, coverage);

// تقارير اليوم والأسبوع
router.get('/daily', requireAuth, daily);
router.get('/daily.csv', requireAuth, dailyCsv);
router.get('/daily.xls', requireAuth, dailyXls);
router.get('/weekly', requireAuth, weekly);
router.get('/weekly.csv', requireAuth, weeklyCsv);
router.get('/weekly.xls', requireAuth, weeklyXls);

// تقارير جدولية: teachers | equipment | chemicals | late
// مسارات صريحة (لا استخدام `:type` بسبب معالجة النقطة في Express 5)
for (const type of TABLE_REPORTS) {
  router.get(`/${type}`, requireAuth, tableReport(type));
  router.get(`/${type}.csv`, requireAuth, tableReportCsv(type));
  router.get(`/${type}.xls`, requireAuth, tableReportXls(type));
}

export default router;
