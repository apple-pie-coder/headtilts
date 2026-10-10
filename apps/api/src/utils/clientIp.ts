import { Request } from 'express';

/**
 * The real client address. `trust proxy` is set to 1, so Express takes the
 * address nginx appended to X-Forwarded-For. Never read the header's leftmost
 * entry directly — the client controls it and can spoof any IP.
 */
export function clientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || '';
}
