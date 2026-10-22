import { Router, IRouter } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { authLimiter, passkeyOptionsLimiter } from '../middleware/rateLimit';

const router: IRouter = Router();

router.get('/setup-status', asyncHandler(authController.setupStatus));
router.post('/setup', authLimiter, asyncHandler(authController.setup));
router.post('/register', authLimiter, asyncHandler(authController.register));
router.post('/login', authLimiter, asyncHandler(authController.login));
router.post('/refresh', authLimiter, asyncHandler(authController.refresh));
router.post('/forgot-password', authLimiter, asyncHandler(authController.forgotPassword));
router.post('/reset-password', authLimiter, asyncHandler(authController.resetPassword));
// No access token needed: logout only revokes the refresh token it is given, and
// must work even after the access token has expired.
router.post('/logout', asyncHandler(authController.logout));
router.get('/me', authenticate, asyncHandler(authController.me));

// MFA — unauthenticated step-2 login
router.post('/mfa/verify', authLimiter, asyncHandler(authController.mfaVerify));
router.post('/mfa/verify-backup', authLimiter, asyncHandler(authController.mfaVerifyBackup));
router.post('/mfa/enroll/start', authLimiter, asyncHandler(authController.mfaEnrollStart));
router.post('/mfa/enroll/complete', authLimiter, asyncHandler(authController.mfaEnrollComplete));
router.post('/mfa/passkey/options', passkeyOptionsLimiter, asyncHandler(authController.mfaPasskeyOptions));
router.post('/mfa/passkey/verify', authLimiter, asyncHandler(authController.mfaPasskeyVerify));
router.post('/mfa/enroll/passkey/options', passkeyOptionsLimiter, asyncHandler(authController.mfaEnrollPasskeyOptions));
router.post('/mfa/enroll/passkey/complete', authLimiter, asyncHandler(authController.mfaEnrollPasskeyComplete));

// Passkeys — passwordless sign-in
router.post('/passkey/login/options', passkeyOptionsLimiter, asyncHandler(authController.passkeyLoginOptions));
router.post('/passkey/login/verify', authLimiter, asyncHandler(authController.passkeyLoginVerify));

// MFA — authenticated setup/management
router.get('/mfa/status', authenticate, asyncHandler(authController.mfaStatus));
router.post('/mfa/setup', authenticate, asyncHandler(authController.mfaSetup));
router.post('/mfa/enable', authenticate, asyncHandler(authController.mfaEnable));
router.post('/mfa/disable', authenticate, asyncHandler(authController.mfaDisable));
router.post('/mfa/backup-codes', authenticate, authLimiter, asyncHandler(authController.mfaRegenerateBackupCodes));

// Passkeys — authenticated management (adding one needs the password)
router.get('/passkeys', authenticate, asyncHandler(authController.passkeysList));
router.post('/passkeys/options', authenticate, authLimiter, asyncHandler(authController.passkeyRegisterOptions));
router.post('/passkeys', authenticate, asyncHandler(authController.passkeyRegister));
router.patch('/passkeys/:id', authenticate, asyncHandler(authController.passkeyRename));
router.delete('/passkeys/:id', authenticate, asyncHandler(authController.passkeyDelete));

export default router;
