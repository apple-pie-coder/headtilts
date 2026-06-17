import { Request, Response } from 'express';
import * as usersService from '../services/users.service';
import { sendSuccess, sendPaginatedSuccess, sendError } from '../utils/response';
import { ApiError } from '../utils/errors';

function handleError(res: Response, error: unknown): void {
  if (error instanceof ApiError) {
    sendError(res, error.code, error.message, error.statusCode, error.details);
  } else {
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}

export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) { sendError(res, 'UNAUTHORIZED', 'Unauthorized', 401); return; }
    const user = await usersService.getUserById(req.user.sub);
    sendSuccess(res, user);
  } catch (error) {
    handleError(res, error);
  }
}

export async function updateMe(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) { sendError(res, 'UNAUTHORIZED', 'Unauthorized', 401); return; }
    const { firstName, lastName, bio, avatar, password, currentPassword } = req.body;
    const user = await usersService.updateMe(req.user.sub, { firstName, lastName, bio, avatar, password, currentPassword });
    sendSuccess(res, user, 200, 'Profile updated successfully');
  } catch (error) {
    handleError(res, error);
  }
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;

    const { items, total } = await usersService.listUsers(page, limit, search);
    sendPaginatedSuccess(res, items, total, page, limit);
  } catch (error) {
    handleError(res, error);
  }
}

export async function getOne(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    const user = await usersService.getUserById(id);
    sendSuccess(res, user);
  } catch (error) {
    handleError(res, error);
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const { email, username, password, firstName, lastName, roleIds } = req.body;
    const user = await usersService.createUser({ email, username, password, firstName, lastName, roleIds });
    sendSuccess(res, user, 201, 'User created successfully');
  } catch (error) {
    handleError(res, error);
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) { sendError(res, 'UNAUTHORIZED', 'Unauthorized', 401); return; }
    const id = req.params.id;
    const { email, username, firstName, lastName, avatar, isActive, roleIds } = req.body;
    const user = await usersService.updateUser(id, { email, username, firstName, lastName, avatar: avatar ?? undefined, isActive, roleIds }, req.user.sub);
    sendSuccess(res, user, 200, 'User updated successfully');
  } catch (error) {
    handleError(res, error);
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'UNAUTHORIZED', 'Unauthorized', 401);
      return;
    }

    const id = req.params.id;
    await usersService.deleteUser(id, req.user.sub);
    sendSuccess(res, { message: 'User deleted successfully' });
  } catch (error) {
    handleError(res, error);
  }
}
