import { Request, Response } from 'express';
import * as rolesService from '../services/roles.service';
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
    const roles = await rolesService.listRoles();
    sendSuccess(res, roles);
  } catch (error) {
    handleError(res, error);
  }
}

export async function getOne(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    const role = await rolesService.getRoleById(id);
    sendSuccess(res, role);
  } catch (error) {
    handleError(res, error);
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const { name, description, permissionIds } = req.body;
    const role = await rolesService.createRole({ name, description, permissionIds });
    sendSuccess(res, role, 201, 'Role created successfully');
  } catch (error) {
    handleError(res, error);
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    const { name, description, permissionIds } = req.body;
    const role = await rolesService.updateRole(id, { name, description, permissionIds });
    sendSuccess(res, role, 200, 'Role updated successfully');
  } catch (error) {
    handleError(res, error);
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    await rolesService.deleteRole(id);
    sendSuccess(res, { message: 'Role deleted successfully' });
  } catch (error) {
    handleError(res, error);
  }
}

export async function permissions(_req: Request, res: Response): Promise<void> {
  try {
    const grouped = await rolesService.listPermissions();
    sendSuccess(res, grouped);
  } catch (error) {
    handleError(res, error);
  }
}
