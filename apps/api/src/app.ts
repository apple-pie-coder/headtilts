import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { errorHandler } from './middleware/errorHandler';
import { uploadDir } from './middleware/upload';
import { prisma } from './config/database';
import { generateXml } from './services/sitemap.service';
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

  const allowedOrigins = [
    process.env.ADMIN_URL || 'http://localhost:5173',
    process.env.WEB_URL  || 'http://localhost:5173',
  ].map(u => { try { return new URL(u).origin; } catch { return u; } });
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.) and listed origins
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error(`CORS: ${origin} not allowed`));
    },
    credentials: true,
  }));

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(morgan('combined'));

  // Static file serving for uploaded media
  app.use('/uploads', express.static(uploadDir));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
