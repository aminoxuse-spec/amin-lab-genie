import express, { type ErrorRequestHandler } from 'express';
import { CLIENT_DIR, APP_NAME, APP_VERSION } from './config.ts';
import { HttpError } from './middleware/validation.ts';
import { requireLicense } from './middleware/license.ts';
import { logger } from './utils/logger.ts';
import authRoutes from './routes/auth.ts';
import inventoryRoutes from './routes/inventory.ts';
import borrowingRoutes from './routes/borrowing.ts';
import scheduleRoutes, { roomsRouter } from './routes/schedule.ts';
import qcRoutes from './routes/qc.ts';
import experimentRoutes from './routes/experiments.ts';
import reportRoutes from './routes/reports.ts';
import settingsRoutes from './routes/settings.ts';
import { institution as institutionPublic } from './controllers/settingsController.ts';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(express.json({ limit: '1mb' }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      logger.debug(`${req.method} ${req.originalUrl} → ${res.statusCode}`, {
        ms: Date.now() - startedAt,
      });
    });
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, app: APP_NAME, version: APP_VERSION, time: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  // مسارات الإعدادات تبقى متاحة دائماً حتى يتمكن المدير من تفعيل الترخيص
  app.use('/api/settings', settingsRoutes);
  app.use('/api/inventory', requireLicense, inventoryRoutes);
  app.use('/api/borrowing', requireLicense, borrowingRoutes);
  app.use('/api/schedule', requireLicense, scheduleRoutes);
  app.use('/api/rooms', requireLicense, roomsRouter);
  app.use('/api/qc', requireLicense, qcRoutes);
  app.use('/api/experiments', requireLicense, experimentRoutes);
  app.use('/api/reports', requireLicense, reportRoutes);
  app.get('/api/institution', institutionPublic);

  app.use(
    express.static(CLIENT_DIR, {
      extensions: ['html'],
      setHeaders: (res, path) => {
        if (path.endsWith('sw.js') || path.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'المسار المطلوب غير موجود' });
  });

  app.use((_req, res) => {
    res.status(404).type('html').send(
      '<!doctype html><meta charset="utf-8"><title>404 — Amin-Lab -Pro🔬</title>' +
        '<body style="font-family:system-ui;direction:rtl;text-align:center;padding:4rem">' +
        '<h1>404</h1><p>الصفحة غير موجودة.</p><p><a href="/">تسجيل الدخول</a></p>',
    );
  });

  const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'صيغة JSON غير صالحة' });
      return;
    }
    logger.error('خطأ غير معالج', {
      path: req.originalUrl,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ error: 'خطأ داخلي في الخادم' });
  };
  app.use(errorHandler);

  return app;
}
