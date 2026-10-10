import path from 'path';
import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { errorHandler } from './middleware/errorHandler';
import { uploadDir } from './middleware/upload';
import { prisma } from './config/database';
import { generateXml } from './services/sitemap.service';
import { activityLogger } from './middleware/activityLogger';
import apiRoutes from './routes';

export function createApp(): Express {
  const app = express();

  // Behind nginx in production — trust the first proxy so rate limiting
  // and logging see the real client IP from X-Forwarded-For.
  app.set('trust proxy', 1);

  // Security headers. crossOriginResourcePolicy is relaxed so /uploads
  // images can be embedded by the web/admin apps on other origins.
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
  app.use(compression());

  const explicitOrigins = [
    process.env.ADMIN_URL || 'http://localhost:5173',
    process.env.WEB_URL  || 'http://localhost:5173',
    'http://localhost:5174',
    ...(process.env.CORS_ORIGINS || '').split(',').filter(Boolean),
  ].map(u => { try { return new URL(u).origin; } catch { return u; } });

  const IS_PRODUCTION = process.env.NODE_ENV === 'production';

  function isPrivateOrigin(origin: string): boolean {
    try {
      const { hostname } = new URL(origin);
      return (
        hostname === 'localhost' ||
        /^127\./.test(hostname) ||
        /^10\./.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
        /^192\.168\./.test(hostname)
      );
    } catch { return false; }
  }

  app.use(cors({
    origin: (origin, callback) => {
      // Any private-network origin is allowed only in development. In production
      // the admin and site are same-origin behind nginx; trusting every LAN
      // origin would let other apps on the same host read authenticated responses.
      if (!origin || explicitOrigins.includes(origin) || (!IS_PRODUCTION && isPrivateOrigin(origin))) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: ${origin} not allowed`));
      }
    },
    credentials: true,
  }));

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  // Same as 'combined', but tokens in query strings (preview / download links)
  // are redacted so they never end up in the access log.
  morgan.token('safe-url', (req) =>
    ((req as { originalUrl?: string }).originalUrl ?? req.url ?? '').replace(/([?&](?:token|dt|refreshToken)=)[^&]*/gi, '$1[redacted]'),
  );
  app.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method :safe-url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'));

  // Static file serving for uploaded media. Uploads share an origin with the
  // admin panel, so every file is served sandboxed (no script execution even if
  // something hostile slips through) and anything that isn't plain media is
  // forced to download instead of rendering.
  const INLINE_UPLOAD_EXT = new Set([
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.ico', '.tiff',
    '.mp4', '.webm', '.mp3', '.ogg', '.wav', '.pdf',
  ]);
  app.use('/uploads', express.static(uploadDir, {
    dotfiles: 'deny',
    setHeaders: (res, filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // Browsers' built-in PDF viewers refuse to run inside a CSP sandbox.
      if (ext !== '.pdf') {
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox");
      }
      if (!INLINE_UPLOAD_EXT.has(ext)) res.setHeader('Content-Disposition', 'attachment');
    },
  }));

  // Public health check
  app.get('/health', async (_req, res) => {
    const reqStart = Date.now();
    let dbStatus: 'ok' | 'error' = 'ok';
    let dbLatency = 0;
    try {
      const t = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatency = Date.now() - t;
    } catch {
      dbStatus = 'error';
    }
    res.json({
      status: dbStatus === 'error' ? 'degraded' : 'ok',
      version: '1.0.0',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      services: {
        api:      { status: 'ok',      latency: Date.now() - reqStart },
        database: { status: dbStatus,  latency: dbLatency },
      },
    });
  });

  // robots.txt — honors the "search engine visibility" setting
  app.get('/robots.txt', async (_req, res) => {
    const siteUrl = (process.env.SITE_URL || 'http://localhost:5173').replace(/\/$/, '');
    let visible = true;
    try {
      const setting = await prisma.setting.findUnique({ where: { key: 'search_engine_visibility' } });
      visible = setting?.value !== 'no';
    } catch {
      // default to visible if the settings table is unreachable
    }
    res.setHeader('Content-Type', 'text/plain');
    if (visible) {
      res.send(`User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${siteUrl}/sitemap.xml`);
    } else {
      res.send('User-agent: *\nDisallow: /');
    }
  });

  // sitemap.xml — root alias of /api/sitemap/xml so crawlers find it
  app.get('/sitemap.xml', async (_req, res) => {
    try {
      const siteUrl = (process.env.SITE_URL || 'http://localhost:5173').replace(/\/$/, '');
      const content = await generateXml(siteUrl);
      res.setHeader('Content-Type', 'application/xml');
      res.send(content);
    } catch {
      res.status(500).send('');
    }
  });

  // Activity logging for all authenticated mutations
  app.use('/api', activityLogger);

  // API Routes
  app.use('/api', apiRoutes);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
      },
    });
  });

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
