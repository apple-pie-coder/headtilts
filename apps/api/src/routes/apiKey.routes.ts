import { Router, Request, Response, IRouter } from 'express';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess, sendError } from '../utils/response';
import {
  createApiKey, listApiKeys, updateApiKey, revokeApiKey, AVAILABLE_SCOPES,
} from '../services/apiKey.service';
import { ValidationError } from '../utils/errors';

const router: IRouter = Router();

router.use(authenticate as any);

// GET /api/api-keys — list caller's own keys
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const keys = await listApiKeys(userId);
  sendSuccess(res, keys);
}));

// GET /api/api-keys/scopes — list all valid scopes
router.get('/scopes', (_req: Request, res: Response) => {
  sendSuccess(res, AVAILABLE_SCOPES);
});

// POST /api/api-keys — create new key
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const { name, scopes, expiresAt } = req.body as {
    name?: string;
    scopes?: string[];
    expiresAt?: string | null;
  };

  if (!name?.trim()) throw new ValidationError('name is required');
  if (!Array.isArray(scopes) || scopes.length === 0) throw new ValidationError('at least one scope is required');

  const invalidScopes = scopes.filter((s) => !(AVAILABLE_SCOPES as readonly string[]).includes(s));
  if (invalidScopes.length) throw new ValidationError(`Invalid scopes: ${invalidScopes.join(', ')}`);

  const expiry = expiresAt ? new Date(expiresAt) : null;
  if (expiry && isNaN(expiry.getTime())) throw new ValidationError('Invalid expiresAt date');

  const key = await createApiKey(userId, name.trim(), scopes, expiry);
  res.status(201).json({ success: true, data: key });
}));

// PATCH /api/api-keys/:id — update name / scopes / expiry
router.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { sendError(res, 'BAD_REQUEST', 'Invalid id', 400); return; }

  const { name, scopes, expiresAt } = req.body as {
    name?: string;
    scopes?: string[];
    expiresAt?: string | null;
  };

  if (scopes !== undefined) {
    const invalid = scopes.filter((s) => !(AVAILABLE_SCOPES as readonly string[]).includes(s));
    if (invalid.length) throw new ValidationError(`Invalid scopes: ${invalid.join(', ')}`);
  }

  const expiry = expiresAt !== undefined
    ? (expiresAt ? new Date(expiresAt) : null)
    : undefined;

  try {
    const updated = await updateApiKey(id, userId, { name, scopes, expiresAt: expiry });
    sendSuccess(res, updated);
  } catch {
    sendError(res, 'NOT_FOUND', 'API key not found', 404);
  }
}));

// DELETE /api/api-keys/:id — revoke
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { sendError(res, 'BAD_REQUEST', 'Invalid id', 400); return; }

  try {
    await revokeApiKey(id, userId);
    sendSuccess(res, { deleted: true });
  } catch {
    sendError(res, 'NOT_FOUND', 'API key not found', 404);
  }
}));

export default router;
