import type { RequestHandler } from 'express';

type Bucket = { count: number; resetAt: number };

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const MAX_KEYS = 5000;

const buckets = new Map<string, Bucket>();

function prune(now: number): void {
  if (buckets.size < MAX_KEYS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * حدّ محاولات الدخول الفاشلة لكل (عنوان الشبكة + اسم المستخدم).
 * يحمي من تخمين كلمات المرور بالقوة الغاشمة ويعيد 429 مع Retry-After.
 */
export function loginRateLimit(): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const body = req.body as { username?: unknown } | undefined;
    const username = String(body?.username ?? '')
      .toLowerCase()
      .slice(0, 40);
    const key = `${ip}|${username}`;

    const bucket = buckets.get(key);
    if (bucket && bucket.resetAt > now && bucket.count >= MAX_ATTEMPTS) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        error: `محاولات دخول كثيرة على هذا الحساب. أعد المحاولة بعد ${Math.ceil(retryAfter / 60)} دقيقة.`,
      });
      return;
    }

    res.on('finish', () => {
      if (res.statusCode === 200) {
        buckets.delete(key);
        return;
      }
      const current = buckets.get(key);
      const at = Date.now();
      if (!current || current.resetAt <= at) {
        buckets.set(key, { count: 1, resetAt: at + WINDOW_MS });
      } else {
        current.count += 1;
      }
      prune(at);
    });

    next();
  };
}
