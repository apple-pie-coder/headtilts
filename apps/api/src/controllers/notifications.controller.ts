import { Request, Response } from 'express';
import * as notificationsService from '../services/notifications.service';
import { sendSuccess, sendError } from '../utils/response';
import { ApiError, ValidationError } from '../utils/errors';
import { NOTIFICATION_TYPES } from '../services/notifications.service';

function handleError(res: Response, error: unknown): void {
  if (error instanceof ApiError) {
    sendError(res, error.code, error.message, error.statusCode, error.details);
  } else {
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const cursor = req.query.cursor ? Number(req.query.cursor) : undefined;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const result = await notificationsService.listForUser(req.user!.sub, cursor, limit);
    sendSuccess(res, result);
  } catch (error) {
    handleError(res, error);
  }
}

export async function unreadCount(req: Request, res: Response): Promise<void> {
  try {
    const count = await notificationsService.unreadCount(req.user!.sub);
    sendSuccess(res, { count });
  } catch (error) {
    handleError(res, error);
  }
}

function parseIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(Number).filter((n) => Number.isInteger(n) && n > 0);
}

export async function markRead(req: Request, res: Response): Promise<void> {
  try {
    await notificationsService.setReadState(req.user!.sub, parseIds(req.body.ids), true);
    sendSuccess(res, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
}

export async function markUnread(req: Request, res: Response): Promise<void> {
  try {
    await notificationsService.setReadState(req.user!.sub, parseIds(req.body.ids), false);
    sendSuccess(res, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
}

export async function markAllRead(req: Request, res: Response): Promise<void> {
  try {
    await notificationsService.markAllRead(req.user!.sub);
    sendSuccess(res, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
}

// ── Preferences ──

export async function listPreferences(req: Request, res: Response): Promise<void> {
  try {
    const prefs = await notificationsService.getPreferences(req.user!.sub);
    // Merge with type definitions for the UI
    const merged = NOTIFICATION_TYPES.map((def) => {
      const pref = prefs.find((p) => p.type === def.type);
      return {
        ...def,
        channel: pref?.channel ?? def.defaultChannel,
        enabled: pref?.enabled ?? true,
        threshold: pref?.threshold ?? def.thresholdDefault ?? null,
      };
    });
    sendSuccess(res, merged);
  } catch (error) {
    handleError(res, error);
  }
}

export async function updatePreferences(req: Request, res: Response): Promise<void> {
  try {
    const prefs = req.body;
    if (!Array.isArray(prefs)) throw new ValidationError('preferences must be an array');

    const validTypes = new Set(NOTIFICATION_TYPES.map((t) => t.type));
    const validChannels = new Set(['email', 'inapp', 'both', 'none']);

    for (const p of prefs) {
      if (!validTypes.has(p.type)) throw new ValidationError(`Unknown notification type: ${p.type}`);
      if (!validChannels.has(p.channel)) throw new ValidationError(`Invalid channel: ${p.channel}`);
      if (typeof p.enabled !== 'boolean') throw new ValidationError('enabled must be boolean');
    }

    await notificationsService.updatePreferences(req.user!.sub, prefs);
    const rows = await notificationsService.getPreferences(req.user!.sub);
    // Merge with type definitions so the frontend gets labels/descriptions
    const merged = NOTIFICATION_TYPES.map((def) => {
      const pref = rows.find((p) => p.type === def.type);
      return {
        ...def,
        channel: pref?.channel ?? def.defaultChannel,
        enabled: pref?.enabled ?? true,
        threshold: pref?.threshold ?? def.thresholdDefault ?? null,
      };
    });
    sendSuccess(res, merged, 200, 'Preferences updated');
  } catch (error) {
    handleError(res, error);
  }
}

export async function sendTestNotification(req: Request, res: Response): Promise<void> {
  try {
    const { type } = req.body as { type?: string };
    if (!type || !NOTIFICATION_TYPES.some((t) => t.type === type)) {
      throw new ValidationError('Invalid notification type');
    }
    const def = NOTIFICATION_TYPES.find((t) => t.type === type)!;
    await notificationsService.notify({
      type: def.type,
      title: `[Test] ${def.label}`,
      body: `This is a test notification for "${def.label}".`,
      link: null,
      recipientIds: [req.user!.sub],
    });
    sendSuccess(res, { ok: true }, 200, 'Test notification sent');
  } catch (error) {
    handleError(res, error);
  }
}
