import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { sendSuccess, sendError } from '../utils/response';
import { ApiError } from '../utils/errors';

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { email, username, password, firstName, lastName } = req.body;

    const result = await authService.register(email, username, password, firstName, lastName);
    sendSuccess(res, result, 201, 'User registered successfully');
  } catch (error) {
    if (error instanceof ApiError) {
      sendError(res, error.code, error.message, error.statusCode, error.details);
    } else {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  }
}

export async function setupStatus(_req: Request, res: Response): Promise<void> {
  try {
    const result = await authService.getSetupStatus();
    sendSuccess(res, result);
  } catch (error) {
    if (error instanceof ApiError) {
      sendError(res, error.code, error.message, error.statusCode, error.details);
    } else {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  }
}

export async function setup(req: Request, res: Response): Promise<void> {
  try {
    const { email, username, password, firstName, lastName } = req.body;

    const result = await authService.setupFirstAdmin(email, username, password, firstName, lastName);
    sendSuccess(res, result, 201, 'Administrator account created successfully');
  } catch (error) {
    if (error instanceof ApiError) {
      sendError(res, error.code, error.message, error.statusCode, error.details);
    } else {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    // Accept `identifier` (email or username); fall back to `email` for compatibility.
    const { identifier, email, password } = req.body;
    const loginId: string | undefined = identifier ?? email;

    if (!loginId || !password) {
      sendError(res, 'VALIDATION_ERROR', 'Email or username and password are required', 400);
      return;
    }

    const result = await authService.login(loginId, password);
    sendSuccess(res, result, 200, 'Logged in successfully');
  } catch (error) {
    if (error instanceof ApiError) {
      sendError(res, error.code, error.message, error.statusCode, error.details);
    } else {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'UNAUTHORIZED', 'Unauthorized', 401);
      return;
    }

    const user = await authService.getCurrentUser(req.user.sub);
    sendSuccess(res, user);
  } catch (error) {
    if (error instanceof ApiError) {
      sendError(res, error.code, error.message, error.statusCode, error.details);
    } else {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await authService.logout(refreshToken);
    }
    sendSuccess(res, { message: 'Logged out successfully' });
  } catch (error) {
    // Logout should always succeed from the client's perspective
    sendSuccess(res, { message: 'Logged out successfully' });
  }
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body;
    if (!email) {
      sendError(res, 'VALIDATION_ERROR', 'Email is required', 400);
      return;
    }
    await authService.requestPasswordReset(email);
    // Always succeed — do not reveal whether the email exists
    sendSuccess(res, { message: 'If that email exists, a reset link has been sent' });
  } catch (error) {
    if (error instanceof ApiError) {
      sendError(res, error.code, error.message, error.statusCode, error.details);
    } else {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  }
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  try {
    const { token, password } = req.body;
    await authService.resetPassword(token, password);
    sendSuccess(res, { message: 'Password updated. You can now log in.' });
  } catch (error) {
    if (error instanceof ApiError) {
      sendError(res, error.code, error.message, error.statusCode, error.details);
    } else {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  }
}
