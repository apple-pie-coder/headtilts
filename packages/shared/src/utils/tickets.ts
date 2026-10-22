// Event tickets at the door: what a ticket's QR code holds, and how a scan is judged.
// Shared so the API, the door phones (which judge scans offline) and the
// attendee's live ticket page all agree on every detail.
//
// Two QR formats:
//   static  the ticket code itself (a UUID), as printed in the confirmation email
//   live    HT1.<registration id>.<time step>.<signature>, redrawn every 15 seconds on
//           the attendee's booking page. The signature uses a key derived from the
//           ticket code, so only someone holding the code can make one, and a
//           screenshot stops working within about a minute.
import { sha256 } from '@noble/hashes/sha2';
import { hmac } from '@noble/hashes/hmac';
import { utf8ToBytes } from '@noble/hashes/utils';

export const LIVE_QR_STEP_SECONDS = 15;
/** Steps either side of "now" still accepted: allows for clocks a little out and a slow queue. */
export const LIVE_QR_TOLERANCE_STEPS = 2;

const LIVE_PREFIX = 'HT1';
const MAC_LENGTH = 16; // base64url characters, 96 bits
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64URL[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64URL[n & 63];
  }
  return out;
}

function fromBase64Url(text: string): Uint8Array {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of text) {
    const v = B64URL.indexOf(ch);
    if (v < 0) throw new Error('Invalid base64url');
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * One-way hash of a ticket code. Door phones keep only this, so a lost phone
 * can't be used to make working static tickets.
 */
export function ticketCodeHash(code: string): string {
  return toBase64Url(sha256(utf8ToBytes(`ht-ticket:${code.trim().toLowerCase()}`)));
}

/** The key that signs a ticket's live QR codes, derived from its ticket code. */
export function liveTicketKey(code: string): string {
  return toBase64Url(hmac(sha256, utf8ToBytes('ht-live-v1'), utf8ToBytes(code.trim().toLowerCase())));
}

export function liveTicketStep(atMs: number): number {
  return Math.floor(atMs / 1000 / LIVE_QR_STEP_SECONDS);
}

function liveMac(key: string, registrationId: number, step: number): string {
  return toBase64Url(hmac(sha256, fromBase64Url(key), utf8ToBytes(`${registrationId}.${step}`))).slice(0, MAC_LENGTH);
}

/** What the attendee's live ticket shows at a moment in time. */
export function liveTicketPayload(registrationId: number, key: string, atMs: number): string {
  const step = liveTicketStep(atMs);
  return `${LIVE_PREFIX}.${registrationId.toString(36)}.${step.toString(36)}.${liveMac(key, registrationId, step)}`;
}

export type ScannedTicket =
  | { kind: 'static'; code: string }
  | { kind: 'live'; registrationId: number; step: number; mac: string }
  | { kind: 'unknown' };

/** Reads whatever the camera decoded: a live code, a ticket code, or a booking link holding one. */
export function parseTicketScan(text: string): ScannedTicket {
  const raw = text.trim();
  if (raw.startsWith(`${LIVE_PREFIX}.`)) {
    const [, id, step, mac] = raw.split('.');
    const registrationId = parseInt(id ?? '', 36);
    const stepNumber = parseInt(step ?? '', 36);
    if (Number.isSafeInteger(registrationId) && registrationId > 0 && Number.isSafeInteger(stepNumber)
      && typeof mac === 'string' && mac.length === MAC_LENGTH) {
      return { kind: 'live', registrationId, step: stepNumber, mac };
    }
    return { kind: 'unknown' };
  }
  const uuid = UUID.exec(raw);
  return uuid ? { kind: 'static', code: uuid[0].toLowerCase() } : { kind: 'unknown' };
}

/** Checks a live code's signature and that it was on screen recently enough. */
export function checkLiveScan(
  key: string,
  scan: { registrationId: number; step: number; mac: string },
  atMs: number,
): 'ok' | 'expired' | 'invalid' {
  if (!sameText(liveMac(key, scan.registrationId, scan.step), scan.mac)) return 'invalid';
  return Math.abs(liveTicketStep(atMs) - scan.step) <= LIVE_QR_TOLERANCE_STEPS ? 'ok' : 'expired';
}

// ─── Verdicts ────────────────────────────────────────────────────────────────

export type TicketVerdict =
  | 'admit'             // valid, people still to come in
  | 'already'           // everyone on this ticket is already in
  | 'flagged'           // payment disputed or partly refunded: send to the help desk
  | 'cancelled'
  | 'refunded'
  | 'unpaid'
  | 'awaiting_approval'
  | 'waitlisted'
  | 'unconfirmed'       // email address never confirmed
  | 'not_found'
  | 'wrong_event'
  | 'expired'           // live code too old: a screenshot or a phone clock far out
  | 'invalid'           // not a ticket, or a live code with a bad signature
  | 'live_required';    // static code shown for an event that uses live tickets

export type VerdictTone = 'green' | 'amber' | 'red';

export const VERDICT_TONE: Record<TicketVerdict, VerdictTone> = {
  admit: 'green',
  already: 'amber',
  flagged: 'amber',
  cancelled: 'red',
  refunded: 'red',
  unpaid: 'red',
  awaiting_approval: 'red',
  waitlisted: 'red',
  unconfirmed: 'red',
  not_found: 'red',
  wrong_event: 'red',
  expired: 'red',
  invalid: 'red',
  live_required: 'red',
};

export interface TicketState {
  status: string;        // confirmed | pending | waitlisted | cancelled | unconfirmed
  paymentStatus: string; // free | pending | paid | refunded | partially_refunded | disputed
  quantity: number;
  checkedInCount: number;
}

/** Whether a ticket gets people in, judged on its booking alone. */
export function ticketVerdict(t: TicketState): TicketVerdict {
  if (t.paymentStatus === 'refunded') return 'refunded';
  if (t.status === 'cancelled') return 'cancelled';
  if (t.status === 'unconfirmed') return 'unconfirmed';
  if (t.paymentStatus === 'pending') return 'unpaid';
  if (t.status === 'pending') return 'awaiting_approval';
  if (t.status === 'waitlisted') return 'waitlisted';
  if (t.status !== 'confirmed') return 'invalid';
  if (t.paymentStatus === 'disputed' || t.paymentStatus === 'partially_refunded') return 'flagged';
  if (t.paymentStatus !== 'free' && t.paymentStatus !== 'paid') return 'invalid';
  return t.checkedInCount >= t.quantity ? 'already' : 'admit';
}
