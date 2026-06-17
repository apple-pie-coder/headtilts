import { Request, Response } from 'express';
import * as menusService from '../services/menus.service';
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
    const menus = await menusService.listMenus();
    sendSuccess(res, menus);
  } catch (error) {
    handleError(res, error);
  }
}

export async function getOne(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    const menu = await menusService.getMenuById(id);
    sendSuccess(res, menu);
  } catch (error) {
    handleError(res, error);
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const { name, location, description } = req.body;
    const menu = await menusService.createMenu({ name, location, description });
    sendSuccess(res, menu, 201, 'Menu created successfully');
  } catch (error) {
    handleError(res, error);
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    const { name, location, description } = req.body;
    const menu = await menusService.updateMenu(id, { name, location, description });
    sendSuccess(res, menu, 200, 'Menu updated successfully');
  } catch (error) {
    handleError(res, error);
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    await menusService.deleteMenu(id);
    sendSuccess(res, { message: 'Menu deleted successfully' });
  } catch (error) {
    handleError(res, error);
  }
}

export async function setItems(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    const { items } = req.body;
    if (!Array.isArray(items)) {
      sendError(res, 'VALIDATION_ERROR', 'items must be an array', 400);
      return;
    }
    const menu = await menusService.setMenuItems(id, items);
    sendSuccess(res, menu, 200, 'Menu items saved successfully');
  } catch (error) {
    handleError(res, error);
  }
}
