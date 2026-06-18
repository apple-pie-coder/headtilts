import { Request, Response } from 'express';
import * as redirectsService from '../services/redirects.service';
import { sendSuccess, sendError } from '../utils/response';
import { ApiError, parseIntParam } from '../utils/errors';

function handleError(res: Response, error: unknown): void {
  if (error instanceof ApiError) {
    sendError(res, error.code, error.message, error.statusCode, error.details);
  } else {
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}

export async function list(_req: Request, res: Response): Promise<void> {
  try {
    sendSuccess(res, await redirectsService.getAll());
  } catch (error) {
    handleError(res, error);
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const { fromPath, toPath, type = 301 } = req.body;
    const redirect = await redirectsService.create(String(fromPath || ''), String(toPath || ''), Number(type));
    sendSuccess(res, redirect, 201);
  } catch (error) {
    handleError(res, error);
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    const { fromPath, toPath, type } = req.body;
    const redirect = await redirectsService.update(id, {
      ...(fromPath !== undefined ? { fromPath: String(fromPath) } : {}),
      ...(toPath !== undefined ? { toPath: String(toPath) } : {}),
      ...(type !== undefined ? { type: Number(type) } : {}),
    });
    sendSuccess(res, redirect);
  } catch (error) {
    handleError(res, error);
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    await redirectsService.remove(id);
    sendSuccess(res, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
}
