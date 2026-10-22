import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// Strict limiter for credential endpoints (login, setup, register, password reset).
// Counts per-IP; successful requests count too, so brute force is throttled
// even when attempts succeed.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' },
  },
});

// Passkey challenges are cheap to hand out but each is a row, and the sign-in
// page asks for one on every visit (for passkey autofill), so this is looser
// than authLimiter. The verify calls still go through authLimiter.
export const passkeyOptionsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' },
  },
});

// General API limiter — generous; protects against runaway clients, not users.
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' },
  },
});

// Public read limiter — applied to all unauthenticated GET endpoints.
// Generous enough for real visitors and RSS readers, tight enough to
// deter automated scraping.
export const publicReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' },
  },
});

// Feedback reports open GitHub issues; cap each signed-in user so a stuck key
// or script can't flood the tracker.
export const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Per signed-in user; the IP fallback is grouped by /56 so IPv6 users can't dodge it.
  keyGenerator: (req) => (req as { user?: { sub?: string } }).user?.sub ?? ipKeyGenerator(req.ip ?? ''),
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'That is a lot of feedback at once — please wait a few minutes.' },
  },
});
