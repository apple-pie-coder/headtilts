// Cloudflare Turnstile: a free, mostly invisible "are you human" check on the
// public ticket form. Off unless both keys are set (TURNSTILE_SITE_KEY and
// TURNSTILE_SECRET_KEY, from dash.cloudflare.com → Turnstile).

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** The public key for the widget, or '' when the check is off. */
export function turnstileSiteKey(): string {
  const site = process.env.TURNSTILE_SITE_KEY ?? '';
  return site && process.env.TURNSTILE_SECRET_KEY ? site : '';
}

/**
 * Whether a widget token is genuine. Always true while the check is off. If
 * Cloudflare can't be reached the answer is no: bots shouldn't get through
 * just because the check is down.
 */
export async function verifyTurnstile(token: unknown, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!turnstileSiteKey() || !secret) return true;
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (error) {
    console.error('[turnstile] verification failed', error);
    return false;
  }
}
