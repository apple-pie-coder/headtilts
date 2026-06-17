import { Request, Response } from 'express';
import * as categoriesService from '../services/categories.service';
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

    const { items, total } = await categoriesService.listCategories(page, limit, search);
    sendPaginatedSuccess(res, items, total, page, limit);
  } catch (error) {
    handleError(res, error);
  }
}

export async function getOne(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    const category = await categoriesService.getCategoryById(id);
    sendSuccess(res, category);
  } catch (error) {
    handleError(res, error);
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const { name, slug, description, parentId, icon, showSidebar } = req.body;
    const category = await categoriesService.createCategory({ name, slug, description, parentId, icon, showSidebar });
    sendSuccess(res, category, 201, 'Category created successfully');
  } catch (error) {
    handleError(res, error);
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    const { name, slug, description, parentId, icon, showSidebar } = req.body;
    const category = await categoriesService.updateCategory(id, { name, slug, description, parentId, icon, showSidebar });
    sendSuccess(res, category, 200, 'Category updated successfully');
  } catch (error) {
    handleError(res, error);
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    await categoriesService.deleteCategory(id);
    sendSuccess(res, { message: 'Category deleted successfully' });
  } catch (error) {
    handleError(res, error);
  }
}
