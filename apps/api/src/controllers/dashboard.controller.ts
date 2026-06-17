import { Request, Response } from 'express';
import * as dashboardService from '../services/dashboard.service';
import { sendSuccess, sendError } from '../utils/response';
import { ApiError } from '../utils/errors';

function handleError(res: Response, error: unknown): void {
  if (error instanceof ApiError) {
    sendError(res, error.code, error.message, error.statusCode, error.details);
  } else {
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}

export async function stats(_req: Request, res: Response): Promise<void> {
  try {
    const data = await dashboardService.getDashboardStats();
    sendSuccess(res, data);
  } catch (error) {
    handleError(res, error);
  }
}
