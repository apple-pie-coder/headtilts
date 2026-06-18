import { Router, IRouter } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { authLimiter } from '../middleware/rateLimit';

const router: IRouter = Router();

router.get('/setup-status', asyncHandler(authController.setupStatus));
router.post('/setup', authLimiter, asyncHandler(authController.setup));
router.post('/register', authLimiter, asyncHandler(authController.register));
router.post('/login', authLimiter, asyncHandler(authController.login));
router.post('/forgot-password', authLimiter, asyncHandler(authController.forgotPassword));
router.post('/reset-password', authLimiter, asyncHandler(authController.resetPassword));
router.post('/logout', authenticate, asyncHandler(authController.logout));
router.get('/me', authenticate, asyncHandler(authController.me));

// MFA — unauthenticated step-2 login
router.post('/mfa/verify', authLimiter, asyncHandler(authController.mfaVerify));
router.post('/mfa/verify-backup', authLimiter, asyncHandler(authController.mfaVerifyBackup));

// MFA — authenticated setup/management
router.get('/mfa/status', authenticate, asyncHandler(authController.mfaStatus));
router.post('/mfa/setup', authenticate, asyncHandler(authController.mfaSetup));
router.post('/mfa/enable', authenticate, asyncHandler(authController.mfaEnable));
router.post('/mfa/disable', authenticate, asyncHandler(authController.mfaDisable));

export default router;
