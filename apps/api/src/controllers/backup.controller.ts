import { Request, Response } from 'express';
import fs from 'fs';
import {
  createBackup, listBackups, getBackup, streamBackup,
  deleteBackup, restoreBackup, verifyBackup, RestoreScope,
} from '../services/backup.service';
import { getBackupSettings } from '../services/backup.settings';
import { resolveStorageProvider } from '../storage';
import { prisma } from '../config/database';

export const backupController = {
  async create(req: Request, res: Response) {
    const { label } = req.body as { label?: string };
    const id = await createBackup(label);
    res.status(202).json({ data: { id, status: 'pending' } });
  },

  async list(_req: Request, res: Response) {
    const backups = await listBackups();
    res.json({ data: backups });
  },

  async get(req: Request, res: Response) {
    const backup = await getBackup(Number(req.params.id));
    res.json({ data: backup });
  },

  async download(req: Request, res: Response) {
    const { stream, filename, sizeBytes } = await streamBackup(Number(req.params.id));
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (sizeBytes) res.setHeader('Content-Length', sizeBytes);
    stream.pipe(res);
  },

  async remove(req: Request, res: Response) {
    await deleteBackup(Number(req.params.id));
    res.json({ data: { deleted: true } });
  },

  async restore(req: Request, res: Response) {
    const scope = (req.body?.scope ?? 'all') as RestoreScope;
    if (!['all', 'db', 'uploads'].includes(scope)) {
      res.status(400).json({ error: { message: 'Invalid scope. Must be all | db | uploads' } });
      return;
    }
    await restoreBackup(Number(req.params.id), scope);
    res.json({ data: { restored: true, scope } });
  },

  async verify(req: Request, res: Response) {
    const result = await verifyBackup(Number(req.params.id));
    res.json({ data: result });
  },

  async upload(req: Request, res: Response) {
    if (!req.file) { res.status(400).json({ error: { message: 'No file uploaded' } }); return; }
    try {
      const filename = `uploaded-${Date.now()}.tar.gz`;
      const storage = await resolveStorageProvider();
      await storage.write(filename, fs.createReadStream(req.file.path));
      fs.unlinkSync(req.file.path);

      const sizeBytes = (await storage.list()).find((f) => f.filename === filename)?.sizeBytes ?? 0;
      const record = await prisma.backup.create({
        data: { filename, label: req.file.originalname, status: 'ready', sizeBytes, completedAt: new Date() },
      });
      res.status(201).json({ data: { ...record, sizeBytes: Number(record.sizeBytes) } });
    } catch (err) {
      // Clean up temp file on error
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      throw err;
    }
  },

  async getSettings(_req: Request, res: Response) {
    const settings = await getBackupSettings();
    // Don't expose raw S3 secret key — send masked version
    res.json({ data: { ...settings, s3SecretKey: settings.s3SecretKey ? '••••••••' : '' } });
  },

  async updateSettings(req: Request, res: Response) {
    const allowed = [
      'backup_schedule', 'backup_schedule_time', 'backup_schedule_day',
      'backup_retention_days', 'backup_retention_count',
      'backup_notify_email', 'backup_pre_restore',
      'backup_storage', 'backup_s3_bucket', 'backup_s3_region',
      'backup_s3_access_key', 'backup_s3_secret_key', 'backup_s3_endpoint',
    ];
    const body = req.body as Record<string, string>;
    const updates: Record<string, string> = {};
    for (const key of allowed) {
      if (key in body) {
        // Don't overwrite the secret key if the masked placeholder was sent back
        if (key === 'backup_s3_secret_key' && body[key] === '••••••••') continue;
        updates[key] = body[key];
      }
    }
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: { message: 'No valid settings provided' } });
      return;
    }
    await prisma.$transaction(
      Object.entries(updates).map(([key, value]) =>
        prisma.setting.upsert({
          where: { key },
          update: { value },
          create: { key, value, type: 'string' },
        }),
      ),
    );
    res.json({ data: { updated: true } });
  },
};
