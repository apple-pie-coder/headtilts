import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/errors';
import { sendError } from '../utils/response';

export function errorHandler(
  err: Error | ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('[Error]', err.message);

  if (err instanceof ApiError) {
    sendError(res, err.code, err.message, err.statusCode, err.details);
    return;
  }

  sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
