import { Request, Response } from 'express';
import * as dashboardService from '../services/dashboard.service';
import { sendSuccess, sendError } from '../utils/response';
import { ApiError } from '../utils/errors';
import { loadPermissions } from '../middleware/auth';

function handleError(res: Response, error: unknown): void {
  if (error instanceof ApiError) {
    sendError(res, error.code, error.message, error.statusCode, error.details);
  } else {
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}

export async function stats(req: Request, res: Response): Promise<void> {
  try {
    const data = await dashboardService.getDashboardStats(await loadPermissions(req));
    sendSuccess(res, data);
  } catch (error) {
    handleError(res, error);
  }
}
