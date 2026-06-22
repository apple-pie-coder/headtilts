import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
import { prisma } from '../config/database';
import { resolveStorageProvider } from '../storage';
import { uploadDir } from '../middleware/upload';
import { getBackupSettings } from './backup.settings';
import { sendMail } from './mail.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const archiver = require('archiver') as (format: string, options?: object) => import('archiver').Archiver;
const execAsync = promisify(exec);

export type RestoreScope = 'all' | 'db' | 'uploads';

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseDatabaseUrl(url: string) {
  const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!m) throw new Error('Cannot parse DATABASE_URL');
  return { user: m[1], password: m[2], host: m[3], port: m[4], database: m[5] };
}

function buildFilename(label?: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const suffix = label ? `-${label.replace(/[^a-z0-9]/gi, '_').slice(0, 30)}` : '';
  return `backup-${ts}${suffix}.tar.gz`;
}

type BackupRow = Awaited<ReturnType<typeof prisma.backup.findUniqueOrThrow>>;
type SerializedBackup = Omit<BackupRow, 'sizeBytes'> & { sizeBytes: number };

function serialize(b: BackupRow): SerializedBackup {
  return { ...b, sizeBytes: Number(b.sizeBytes) };
}

async function findBackup(id: number): Promise<BackupRow> {
  const record = await prisma.backup.findUnique({ where: { id } });
  if (!record) throw new Error('Backup not found');
  return record;
}

// ── Create ────────────────────────────────────────────────────────────────────

/** Fire-and-forget: returns the new id immediately, runs backup async. */
export async function createBackup(label?: string): Promise<number> {
  const filename = buildFilename(label);
  const record = await prisma.backup.create({
    data: { filename, label: label ?? null, status: 'pending' },
  });
  runBackup(record.id, filename, label).catch(() => {});
  return record.id;
}

/** Awaited variant used for the pre-restore safety backup. Skips retention to avoid deleting the backup being restored from. Returns the completed record so the caller can re-insert it after the restore wipes the DB. */
async function createBackupAndWait(label: string): Promise<BackupRow> {
  const filename = buildFilename(label);
  const record = await prisma.backup.create({
    data: { filename, label, status: 'pending' },
  });
  await runBackup(record.id, filename, label, { skipRetention: true });
  return prisma.backup.findUniqueOrThrow({ where: { id: record.id } });
}

async function runBackup(id: number, filename: string, label?: string, opts: { skipRetention?: boolean } = {}) {
  const storage = await resolveStorageProvider();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-backup-'));
  try {
    const db = parseDatabaseUrl(process.env.DATABASE_URL!);

    // 1. MySQL dump — write directly to file (avoids exec 1 MB buffer limit)
    const dumpPath = path.join(tmpDir, 'database.sql');
    await execAsync(
      `mysqldump -h ${db.host} -P ${db.port} -u ${db.user} --password=${db.password} --single-transaction --routines --triggers ${db.database} > "${dumpPath}"`,
    );

    // 2. Manifest
    const tableCount = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*) AS c FROM information_schema.tables
      WHERE table_schema = ${db.database} AND table_type = 'BASE TABLE'`;
    const manifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      label: label ?? null,
      database: db.database,
      tableCount: Number(tableCount[0]?.c ?? 0),
      appVersion: process.env.npm_package_version ?? 'unknown',
    };
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    // 3. .env snapshot
    const envPath = path.resolve(process.cwd(), '../../.env');
    if (fs.existsSync(envPath)) fs.copyFileSync(envPath, path.join(tmpDir, 'app.env'));

    // 4. Pack into tar.gz
    const arc = archiver('tar', { gzip: true, gzipOptions: { level: 6 } });
    const tmpOut = path.join(tmpDir, filename);
    const outStream = createWriteStream(tmpOut);
    arc.pipe(outStream);
    arc.file(dumpPath, { name: 'database.sql' });
    arc.file(path.join(tmpDir, 'manifest.json'), { name: 'manifest.json' });
    if (fs.existsSync(path.join(tmpDir, 'app.env'))) {
      arc.file(path.join(tmpDir, 'app.env'), { name: 'app.env' });
    }
    if (fs.existsSync(uploadDir)) arc.directory(uploadDir, 'uploads');
    await new Promise<void>((res, rej) => {
      outStream.on('close', res);
      outStream.on('error', rej);
      arc.on('error', rej);
      void arc.finalize();
    });

    // 5. Stream to storage
    await storage.write(filename, createReadStream(tmpOut));
    const sizeBytes = fs.statSync(tmpOut).size;

    await prisma.backup.update({
      where: { id },
      data: { status: 'ready', sizeBytes, completedAt: new Date() },
    });

    // 6. Enforce retention policy (skipped for pre-restore safety backups)
    if (!opts.skipRetention) await enforceRetention();

    // 7. Success notification
    await notifyResult(label ?? filename, true);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.backup.update({ where: { id }, data: { status: 'failed', errorMsg: msg } }).catch(() => {});
    await notifyResult(label ?? filename, false, msg);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── Retention ─────────────────────────────────────────────────────────────────

async function enforceRetention() {
  try {
    const settings = await getBackupSettings();
    const storage = await resolveStorageProvider();
    const toDelete = new Set<number>();

    if (settings.retentionCount > 0) {
      const all = await prisma.backup.findMany({
        where: { status: 'ready' },
        orderBy: { createdAt: 'desc' },
      });
      all.slice(settings.retentionCount).forEach((b) => toDelete.add(b.id));
    }

    if (settings.retentionDays > 0) {
      const cutoff = new Date(Date.now() - settings.retentionDays * 86_400_000);
      const old = await prisma.backup.findMany({ where: { status: 'ready', createdAt: { lt: cutoff } } });
      old.forEach((b) => toDelete.add(b.id));
    }

    for (const id of toDelete) {
      const rec = await prisma.backup.findUnique({ where: { id } });
      if (rec) {
        await storage.delete(rec.filename).catch(() => {});
        await prisma.backup.delete({ where: { id } }).catch(() => {});
      }
    }
  } catch { /* non-fatal */ }
}

// ── Notifications ─────────────────────────────────────────────────────────────

async function notifyResult(label: string, success: boolean, errorMsg?: string) {
  try {
    const { notifyEmail } = await getBackupSettings();
    if (!notifyEmail) return;
    const subject = success ? `✓ Backup completed: ${label}` : `✗ Backup failed: ${label}`;
    const text = success
      ? `Your backup "${label}" completed successfully.`
      : `Your backup "${label}" failed.\n\nError: ${errorMsg}`;
    await sendMail({ to: notifyEmail, subject, text });
  } catch { /* non-fatal */ }
}

// ── Reconcile ─────────────────────────────────────────────────────────────────

/**
 * Runs at startup. Marks any "ready" backup records whose files no longer
 * exist in storage as failed, preventing stale records from causing confusing
 * "file not found" errors in the UI (most commonly caused by a DB restore that
 * resurrects records for files that were cleaned up after the backup was taken).
 */
export async function reconcileBackupRecords(): Promise<void> {
  try {
    const storage = await resolveStorageProvider();
    const ready = await prisma.backup.findMany({ where: { status: 'ready' } });
    const stale = await Promise.all(
      ready.map(async (b) => ({ b, exists: await storage.exists(b.filename) }))
    );
    const toMark = stale.filter(({ exists }) => !exists).map(({ b }) => b);
    if (!toMark.length) return;
    await prisma.backup.updateMany({
      where: { id: { in: toMark.map((b) => b.id) } },
      data: { status: 'failed', errorMsg: 'File missing from storage — possibly orphaned by a database restore' },
    });
    console.log(`⚠ Marked ${toMark.length} backup record(s) as failed: files not found in storage`);
  } catch { /* non-fatal */ }
}

// ── List / Get ────────────────────────────────────────────────────────────────

export async function listBackups(): Promise<SerializedBackup[]> {
  const rows = await prisma.backup.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map(serialize);
}

export async function getBackup(id: number): Promise<SerializedBackup> {
  return serialize(await findBackup(id));
}

// ── Stream (download) ─────────────────────────────────────────────────────────

export async function streamBackup(id: number) {
  const record = await findBackup(id);
  if (record.status !== 'ready') throw new Error('Backup is not ready');
  const storage = await resolveStorageProvider();
  const stream = await storage.read(record.filename);
  return { stream, filename: record.filename, sizeBytes: Number(record.sizeBytes) };
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteBackup(id: number) {
  const record = await findBackup(id);
  const storage = await resolveStorageProvider();
  await storage.delete(record.filename).catch(() => {});
  await prisma.backup.delete({ where: { id } });
}

// ── Verify ────────────────────────────────────────────────────────────────────

export async function verifyBackup(id: number): Promise<{ valid: boolean; manifest: object | null; error?: string }> {
  const record = await findBackup(id);
  if (record.status !== 'ready') return { valid: false, manifest: null, error: 'Backup is not in ready state' };

  const storage = await resolveStorageProvider();
  if (!await storage.exists(record.filename)) {
    await prisma.backup.update({
      where: { id },
      data: { status: 'failed', errorMsg: 'File missing from storage — possibly orphaned by a database restore' },
    });
    return { valid: false, manifest: null, error: `Backup file not found in storage: ${record.filename}` };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-verify-'));
  try {
    const storage = await resolveStorageProvider();
    const stream = await storage.read(record.filename);
    const tmpArchive = path.join(tmpDir, 'check.tar.gz');
    await pipeline(stream, createWriteStream(tmpArchive));

    // List archive contents — this validates the gzip/tar integrity
    const { stdout: listing } = await execAsync(`tar -tzf "${tmpArchive}"`, { maxBuffer: 10 * 1024 * 1024 });

    if (!listing.includes('manifest.json')) {
      return { valid: false, manifest: null, error: 'manifest.json missing from archive' };
    }
    if (!listing.includes('database.sql')) {
      return { valid: false, manifest: null, error: 'database.sql missing from archive' };
    }

    // Extract just the manifest for metadata
    await execAsync(`tar -xzf "${tmpArchive}" -C "${tmpDir}" manifest.json`);
    const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'manifest.json'), 'utf8'));
    return { valid: true, manifest };
  } catch (err) {
    return { valid: false, manifest: null, error: err instanceof Error ? err.message : String(err) };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── Restore ───────────────────────────────────────────────────────────────────

export async function restoreBackup(id: number, scope: RestoreScope = 'all'): Promise<void> {
  const record = await findBackup(id);
  if (record.status !== 'ready') throw new Error('Backup is not ready for restore');

  const storageCheck = await resolveStorageProvider();
  if (!await storageCheck.exists(record.filename)) {
    await prisma.backup.update({
      where: { id },
      data: { status: 'failed', errorMsg: 'File missing from storage — possibly orphaned by a database restore' },
    });
    throw new Error(`Backup file not found in storage: ${record.filename}`);
  }

  // Pre-restore safety backup (full scope only, to avoid infinite loops).
  // We save the completed record so we can re-insert it after the restore wipes the DB.
  let safetyRecord: BackupRow | null = null;
  if (scope === 'all') {
    const { preRestoreBackup } = await getBackupSettings();
    if (preRestoreBackup) {
      safetyRecord = await createBackupAndWait(`pre-restore-${record.label ?? record.id}`);
    }
  }

  await runRestore(record.filename, scope);

  // The DB restore replaces all table data. Re-establish both the restored backup and the
  // pre-restore safety backup so they remain visible and subject to future retention.
  await prisma.backup.upsert({
    where: { filename: record.filename },
    update: { status: 'ready', errorMsg: null, completedAt: record.completedAt },
    create: {
      filename: record.filename,
      label: record.label,
      status: 'ready',
      sizeBytes: record.sizeBytes,
      completedAt: record.completedAt,
    },
  });

  if (safetyRecord) {
    await prisma.backup.upsert({
      where: { filename: safetyRecord.filename },
      update: { status: 'ready', errorMsg: null, completedAt: safetyRecord.completedAt },
      create: {
        filename: safetyRecord.filename,
        label: safetyRecord.label,
        status: 'ready',
        sizeBytes: safetyRecord.sizeBytes,
        completedAt: safetyRecord.completedAt,
      },
    });
  }
}

async function runRestore(filename: string, scope: RestoreScope) {
  const storage = await resolveStorageProvider();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-restore-'));
  try {
    // 1. Download and extract archive
    const archiveStream = await storage.read(filename);
    const tmpArchive = path.join(tmpDir, 'upload.tar.gz');
    await pipeline(archiveStream, createWriteStream(tmpArchive));
    await execAsync(`tar -xzf "${tmpArchive}" -C "${tmpDir}"`);

    // 2. Validate manifest
    const manifestPath = path.join(tmpDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) throw new Error('Invalid backup: missing manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.version !== 1) throw new Error(`Unsupported backup version: ${manifest.version}`);

    const db = parseDatabaseUrl(process.env.DATABASE_URL!);

    // 3. Restore database
    if (scope === 'all' || scope === 'db') {
      const dumpPath = path.join(tmpDir, 'database.sql');
      if (!fs.existsSync(dumpPath)) throw new Error('Invalid backup: missing database.sql');
      await execAsync(
        `mysql -h ${db.host} -P ${db.port} -u ${db.user} --password=${db.password} ${db.database} < "${dumpPath}"`,
      );
      // Clean up orphaned pending records from the restored snapshot
      await prisma.backup.updateMany({
        where: { status: 'pending' },
        data: { status: 'failed', errorMsg: 'Aborted — database was restored to a prior state' },
      });
    }

    // 4. Restore uploads
    if (scope === 'all' || scope === 'uploads') {
      const uploadsSource = path.join(tmpDir, 'uploads');
      if (fs.existsSync(uploadsSource)) {
        if (fs.existsSync(uploadDir)) {
          for (const entry of fs.readdirSync(uploadDir)) {
            fs.rmSync(path.join(uploadDir, entry), { recursive: true, force: true });
          }
        } else {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        await execAsync(`cp -r "${uploadsSource}/." "${uploadDir}/"`);
      }
    }

    // 5. Restore .env (full restore only)
    if (scope === 'all') {
      const envSource = path.join(tmpDir, 'app.env');
      const envDest = path.resolve(process.cwd(), '../../.env');
      if (fs.existsSync(envSource) && fs.existsSync(path.dirname(envDest))) {
        fs.copyFileSync(envSource, envDest);
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
