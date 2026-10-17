import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * MySQL closes connections that sit idle longer than wait_timeout (8 hours by
 * default), and Prisma's pool only finds out when it next hands one out — the
 * request then fails with "Server has closed the connection". Recycle pooled
 * connections well before that. Values in DATABASE_URL take precedence.
 * (Added here rather than to DATABASE_URL itself, which the backup service
 * parses and would read the query string as part of the database name.)
 */
const POOL_DEFAULTS: Record<string, string> = {
  max_idle_connection_lifetime: '300', // seconds
  max_connection_lifetime: '1800',
};

export function withPoolDefaults(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    for (const [key, value] of Object.entries(POOL_DEFAULTS)) {
      if (!parsed.searchParams.has(key)) parsed.searchParams.set(key, value);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

// Prisma's default 5 s interactive-transaction limit is too tight on a busy
// Raspberry Pi: a save that took 8 s was committed yet reported as a failure
// (P2028). Allow slow hosts; transactions themselves are kept short.
export const prisma = globalForPrisma.prisma || new PrismaClient({
  datasourceUrl: withPoolDefaults(process.env.DATABASE_URL),
  transactionOptions: { maxWait: 10_000, timeout: 30_000 },
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('✓ Database connected');
  } catch (error) {
    console.error('✗ Database connection failed:', error);
    process.exit(1);
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
