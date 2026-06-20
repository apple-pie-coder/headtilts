import { Request, Response } from 'express';
import * as settingsService from '../services/settings.service';
import { sendMail } from '../services/mail.service';
import { sendSuccess, sendError } from '../utils/response';
import { ApiError, ValidationError } from '../utils/errors';

function handleError(res: Response, error: unknown): void {
  if (error instanceof ApiError) {
    sendError(res, error.code, error.message, error.statusCode, error.details);
  } else {
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}

export async function list(_req: Request, res: Response): Promise<void> {
  try {
    const settings = await settingsService.getSettings();
    sendSuccess(res, settings);
  } catch (error) {
    handleError(res, error);
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const updates = req.body;
    if (typeof updates !== 'object' || updates === null || Array.isArray(updates)) {
      throw new ValidationError('Request body must be an object of setting key-value pairs');
    }

    const settings = await settingsService.updateSettings(updates);
    sendSuccess(res, settings, 200, 'Settings updated successfully');
  } catch (error) {
    handleError(res, error);
  }
}

export async function testEmail(req: Request, res: Response): Promise<void> {
  try {
    const to = (req as Request & { user?: { email: string } }).user?.email;
    if (!to) throw new ValidationError('Could not determine recipient email from session');

    const sent = await sendMail({
      to,
      subject: 'Headtilts CMS — Test Email',
      text: 'This is a test email sent from the Headtilts CMS settings page to verify your SMTP configuration.',
      html: '<p>This is a test email sent from the <strong>Headtilts CMS</strong> settings page to verify your SMTP configuration.</p>',
    });

    if (sent) {
      sendSuccess(res, { sent: true, to }, 200, `Test email sent to ${to}`);
    } else {
      sendError(res, 'SMTP_NOT_CONFIGURED', 'SMTP is not configured — email was logged to console instead', 400);
    }
  } catch (error) {
    handleError(res, error);
  }
}
