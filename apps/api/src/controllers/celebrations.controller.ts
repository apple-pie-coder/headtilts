import { Request, Response } from 'express';
import * as celebrationsService from '../services/celebrations.service';
import { sendSuccess, sendPaginatedSuccess, sendError } from '../utils/response';
import { ApiError, parseIntParam } from '../utils/errors';

function handleError(res: Response, error: unknown): void {
  if (error instanceof ApiError) {
    sendError(res, error.code, error.message, error.statusCode, error.details);
  } else {
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;

    const { items, total } = await celebrationsService.listCelebrations(page, limit, search, type);
    sendPaginatedSuccess(res, items, total, page, limit);
  } catch (error) {
    handleError(res, error);
  }
}

export async function getOne(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    const celebration = await celebrationsService.getCelebrationById(id);
    sendSuccess(res, celebration);
  } catch (error) {
    handleError(res, error);
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const celebration = await celebrationsService.createCelebration(req.body);
    sendSuccess(res, celebration, 201, 'Celebration created successfully');
  } catch (error) {
    handleError(res, error);
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    const celebration = await celebrationsService.updateCelebration(id, req.body);
    sendSuccess(res, celebration, 200, 'Celebration updated successfully');
  } catch (error) {
    handleError(res, error);
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    await celebrationsService.deleteCelebration(id);
    sendSuccess(res, { message: 'Celebration deleted successfully' });
  } catch (error) {
    handleError(res, error);
  }
}
