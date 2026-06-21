import http from 'http';
import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/database';
import { publishDuePosts } from './services/posts.service';
import { initRealtime } from './realtime/notifications.gateway';
import { prisma } from './config/database';
import { startBackupScheduler } from './services/backupScheduler';

const REQUIRED_ENV_VARS = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'] as const;

function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET === 'dev-secret') {
    console.error('JWT_SECRET must not be "dev-secret" in production');
    process.exit(1);
  }
}

const PORT = parseInt(process.env.API_PORT || '3000', 10);
const SCHEDULED_PUBLISH_INTERVAL_MS = 60 * 1000;

function startScheduledPublisher(): NodeJS.Timeout {
  const run = () =>
    publishDuePosts().catch((error) => {
      console.error('Scheduled publish check failed:', error);
    });
  run();
  return setInterval(run, SCHEDULED_PUBLISH_INTERVAL_MS);
}

async function start(): Promise<void> {
  validateEnv();
  try {
    // Connect to database
    await connectDatabase();

    // Create the Express app and wrap it in an HTTP server so Socket.IO can
    // share the same port for real-time admin notifications.
    const app = createApp();
    const server = http.createServer(app);
    initRealtime(server);

    server.listen(PORT, () => {
      console.log(`✓ Server running on http://localhost:${PORT}`);
      console.log('✓ Real-time notifications (Socket.IO) attached');
    });

    // Fail any backups that were pending at server start (crashed or orphaned by a restore)
    await prisma.backup.updateMany({
      where: { status: 'pending' },
      data: { status: 'failed', errorMsg: 'Aborted — server restarted while backup was running' },
    }).catch(() => {});

    // Publish scheduled posts when they come due
    const publisherTimer = startScheduledPublisher();
    // Auto-backup scheduler — checks every minute against configured schedule
    const backupTimer = startBackupScheduler();
    console.log('✓ Backup scheduler running (every 60s)');
    console.log('✓ Scheduled post publisher running (every 60s)');

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received, shutting down gracefully...');
      clearInterval(publisherTimer);
      clearInterval(backupTimer);
      await disconnectDatabase();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('SIGINT received, shutting down gracefully...');
      clearInterval(publisherTimer);
      clearInterval(backupTimer);
      await disconnectDatabase();
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
