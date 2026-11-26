import { gzipSync } from 'node:zlib';
import type { RequestHandler, Response } from 'express';

const MIN_BYTES = 1024;
const COMPRESSIBLE =
  /^(?:text\/|application\/(?:json|javascript|xml|manifest\+json)|image\/svg\+xml)/i;

/**
 * ضغط gzip للاستجابات النصية الكبيرة (JSON/HTML/CSS/JS/SVG) دون أي تبعية خارجية.
 * يقلّل حجم الجرد والتقارير إلى نحو الخُمس على الشبكة المحلية والهاتف.
 */
export function compress(): RequestHandler {
  return (req, res, next) => {
    const accept = String(req.headers['accept-encoding'] ?? '');
    if (!/\bgzip\b/i.test(accept)) {
      next();
      return;
    }

    res.setHeader('Vary', 'Accept-Encoding');
    const originalSend = res.send.bind(res);

    res.send = function compressedSend(body?: unknown) {
      const type = String(res.getHeader('Content-Type') ?? '');
      const alreadyEncoded = res.getHeader('Content-Encoding') !== undefined;
      const statusAllowsBody = res.statusCode !== 204 && res.statusCode !== 304;

      if (!alreadyEncoded && body != null && statusAllowsBody && COMPRESSIBLE.test(type)) {
        try {
          const raw = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
          if (raw.length >= MIN_BYTES) {
            const compressed = gzipSync(raw, { level: 6 });
            res.setHeader('Content-Encoding', 'gzip');
            return originalSend(compressed);
          }
        } catch {
          // في حال فشل الضغط نرسل الجسم الأصلي كما هو
        }
      }

      return originalSend(body as never);
    } as Response['send'];

    next();
  };
}
