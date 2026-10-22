import { Prisma } from '@prisma/client';
import {
  PERMISSIONS, TicketVerdict, checkLiveScan, liveTicketKey, parseTicketScan, ticketCodeHash, ticketVerdict,
} from '@headtilts/shared';
import { prisma } from '../config/database';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';

/**
 * The door: scanning tickets, manual check-in, undo, and the ticket list the
 * door phones keep so they can answer before the network does.
 *
 * Every admission is a single conditional update ("add n people while there's
 * room on the ticket and it's valid"), so two doors scanning copies of the same
 * ticket can never both let the whole group in. Every scan, admitted or not,
 * is written to EventCheckIn.
 */

/** Staff who only hold the scanner permission can use it this long either side of an event. */
const DOOR_WINDOW_MS = 12 * 60 * 60 * 1000;
/** Offline scans sync later; older than this, a scan's own timestamp isn't trusted. */
const MAX_OFFLINE_AGE_MS = 24 * 60 * 60 * 1000;
/** Door staff can take back their own admission for this long; supervisors any time. */
const STAFF_UNDO_MS = 5 * 60 * 1000;

export interface DoorActor {
  userId: string;
  permissions: string[];
  device?: string;
}

const canSupervise = (a: DoorActor) => a.permissions.includes(PERMISSIONS.EVENT_MANAGE_REGISTRATIONS);

const REG_SELECT = {
  id: true, eventId: true, ticketCode: true, name: true, quantity: true, status: true,
  paymentStatus: true, checkedInCount: true, checkInAt: true,
  ticketTier: { select: { name: true } },
} as const;
type RegRow = Prisma.EventRegistrationGetPayload<{ select: typeof REG_SELECT }>;

/** What a door phone needs to show about a ticket. */
function ticketSummary(r: RegRow) {
  return {
    id: r.id,
    name: r.name,
    tier: r.ticketTier?.name ?? null,
    quantity: r.quantity,
    checkedInCount: r.checkedInCount,
    status: r.status,
    paymentStatus: r.paymentStatus,
    firstInAt: r.checkInAt,
  };
}
export type TicketSummary = ReturnType<typeof ticketSummary>;

async function loadEvent(eventId: number) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true, title: true, slug: true, startAt: true, endAt: true, timezone: true, status: true,
      liveTicketQr: true, venueName: true, venueCity: true,
    },
  });
  if (!event) throw new NotFoundError('Event not found');
  return event;
}
type DoorEvent = Awaited<ReturnType<typeof loadEvent>>;

function inDoorWindow(event: { startAt: Date; endAt: Date }, now = Date.now()) {
  return now >= event.startAt.getTime() - DOOR_WINDOW_MS && now <= event.endAt.getTime() + DOOR_WINDOW_MS;
}

/** Scanner-only staff are limited to the hours around the event; supervisors aren't. */
async function eventForActor(eventId: number, actor: DoorActor): Promise<DoorEvent> {
  const event = await loadEvent(eventId);
  if (!canSupervise(actor) && !inDoorWindow(event)) {
    throw new ForbiddenError('The scanner for this event opens 12 hours before it starts and closes 12 hours after it ends');
  }
  return event;
}

async function staffName(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, username: true } });
  if (!u) return null;
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username;
}

function cleanDevice(device: unknown): string | null {
  return typeof device === 'string' && device.trim() ? device.trim().slice(0, 60) : null;
}

async function doorStats(eventId: number) {
  const agg = await prisma.eventRegistration.aggregate({
    where: { eventId, status: 'confirmed', paymentStatus: { in: ['free', 'paid', 'disputed', 'partially_refunded'] } },
    _sum: { quantity: true, checkedInCount: true },
  });
  return { expected: agg._sum.quantity ?? 0, checkedIn: agg._sum.checkedInCount ?? 0 };
}

// ─── Event list and ticket list ──────────────────────────────────────────────

/** Events the scanner can open now: around event time for door staff, the coming month for supervisors. */
export async function scannableEvents(actor: DoorActor) {
  const now = Date.now();
  const supervise = canSupervise(actor);
  const events = await prisma.event.findMany({
    where: {
      status: 'published',
      endAt: { gte: new Date(now - DOOR_WINDOW_MS) },
      startAt: { lte: new Date(now + (supervise ? 31 * 24 : 12) * 60 * 60 * 1000) },
    },
    select: { id: true, title: true, startAt: true, endAt: true, timezone: true, venueName: true, venueCity: true, liveTicketQr: true },
    orderBy: { startAt: 'asc' },
    take: 30,
  });
  return events.map((e) => ({ ...e, open: inDoorWindow(e, now) }));
}

/**
 * Everything a door phone needs to judge scans on its own. Ticket codes are
 * never sent: only their one-way hash, plus (for live tickets) the key that
 * checks a live code's signature.
 */
export async function manifest(eventId: number, actor: DoorActor) {
  const event = await eventForActor(eventId, actor);
  const regs = await prisma.eventRegistration.findMany({
    where: { eventId, status: { not: 'unconfirmed' } },
    select: REG_SELECT,
    orderBy: { id: 'asc' },
  });
  const cursor = await prisma.eventCheckIn.aggregate({ where: { eventId }, _max: { id: true } });
  return {
    event,
    tickets: regs.map((r) => ({
      ...ticketSummary(r),
      hash: ticketCodeHash(r.ticketCode),
      ...(event.liveTicketQr ? { liveKey: liveTicketKey(r.ticketCode) } : {}),
    })),
    stats: await doorStats(eventId),
    cursor: cursor._max.id ?? 0,
    canSupervise: canSupervise(actor),
    serverTime: Date.now(),
  };
}

/** Tickets touched at any door since a phone last asked, so every phone stays in step. */
export async function changes(eventId: number, since: number, actor: DoorActor) {
  await eventForActor(eventId, actor);
  const logs = await prisma.eventCheckIn.findMany({
    where: { eventId, id: { gt: since } },
    select: { id: true, registrationId: true },
    orderBy: { id: 'asc' },
    take: 500,
  });
  const ids = [...new Set(logs.map((l) => l.registrationId).filter((id): id is number => id !== null))];
  const regs = ids.length ? await prisma.eventRegistration.findMany({ where: { id: { in: ids } }, select: REG_SELECT }) : [];
  return {
    tickets: regs.map(ticketSummary),
    stats: await doorStats(eventId),
    cursor: logs.length ? logs[logs.length - 1].id : since,
    serverTime: Date.now(),
  };
}

// ─── Admitting ───────────────────────────────────────────────────────────────

interface LogInput {
  eventId: number;
  registrationId: number | null;
  actor: DoorActor;
  name: string | null;
  action: 'admit' | 'undo' | 'denied';
  count?: number;
  verdict?: TicketVerdict;
  source: 'scan' | 'manual' | 'offline';
  override?: boolean;
  reason?: string | null;
  scannedAt: Date;
}

function writeLog(l: LogInput, tx: Prisma.TransactionClient = prisma) {
  return tx.eventCheckIn.create({
    data: {
      eventId: l.eventId, registrationId: l.registrationId, userId: l.actor.userId, staffName: l.name,
      device: cleanDevice(l.actor.device), action: l.action, count: l.count ?? 0, verdict: l.verdict ?? null,
      source: l.source, override: l.override ?? false, reason: l.reason ?? null, scannedAt: l.scannedAt,
    },
    select: { id: true },
  });
}

/** The last admission on a ticket, for "already used at 7:42 pm by Main gate". */
async function lastAdmission(registrationId: number) {
  const log = await prisma.eventCheckIn.findFirst({
    where: { registrationId, action: 'admit' },
    orderBy: { id: 'desc' },
    select: { staffName: true, device: true, scannedAt: true, count: true },
  });
  return log ? { by: log.staffName, device: log.device, at: log.scannedAt, count: log.count } : null;
}

/**
 * Adds n people to a ticket in one conditional update. Normal admissions also
 * require the ticket to be valid at that instant; an override only needs room.
 */
async function addPeople(reg: RegRow, n: number, override: boolean) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.eventRegistration.updateMany({
      where: {
        id: reg.id,
        checkedInCount: { lte: reg.quantity - n },
        ...(override ? {} : { status: 'confirmed', paymentStatus: { in: ['free', 'paid'] } }),
      },
      data: { checkedInCount: { increment: n } },
    });
    if (count === 0) return false;
    await tx.eventRegistration.updateMany({ where: { id: reg.id, checkInAt: null }, data: { checkInAt: new Date() } });
    return true;
  });
}

function clampCount(requested: unknown, remaining: number): number {
  const n = Number(requested);
  if (!Number.isInteger(n) || n < 1) return remaining;
  return Math.min(n, remaining);
}

export interface ScanInput {
  payload: string;
  count?: number;
  /** When the phone saw the code (its clock, corrected to the server's), for scans synced late. */
  scannedAt?: number;
  offline?: boolean;
}

export interface DoorResult {
  verdict: TicketVerdict;
  ticket: TicketSummary | null;
  admitted: number;
  /** Set when the ticket was already used, or another door got there first. */
  previous: Awaited<ReturnType<typeof lastAdmission>>;
  otherEvent?: string;
  logId: number;
}

/** One scan at the door: work out the ticket, judge it, and admit if valid. */
export async function scan(eventId: number, input: ScanInput, actor: DoorActor): Promise<DoorResult> {
  const event = await eventForActor(eventId, actor);
  const now = Date.now();
  const scannedAt = input.offline && typeof input.scannedAt === 'number'
    && input.scannedAt <= now + 60_000 && now - input.scannedAt <= MAX_OFFLINE_AGE_MS
    ? input.scannedAt : now;
  const source = input.offline ? 'offline' : 'scan';
  const name = await staffName(actor.userId);
  const parsed = parseTicketScan(typeof input.payload === 'string' ? input.payload.slice(0, 500) : '');

  const deny = async (verdict: TicketVerdict, reg: RegRow | null, extra: Partial<DoorResult> = {}): Promise<DoorResult> => {
    const log = await writeLog({
      eventId, registrationId: reg && reg.eventId === eventId ? reg.id : null, actor, name,
      action: 'denied', verdict, source, scannedAt: new Date(scannedAt),
    });
    const previous = reg && verdict === 'already' ? await lastAdmission(reg.id) : null;
    return { verdict, ticket: reg && reg.eventId === eventId ? ticketSummary(reg) : null, admitted: 0, previous, logId: log.id, ...extra };
  };

  let reg: RegRow | null = null;
  if (parsed.kind === 'static') {
    reg = await prisma.eventRegistration.findUnique({ where: { ticketCode: parsed.code }, select: REG_SELECT });
    if (!reg) return deny('not_found', null);
  } else if (parsed.kind === 'live') {
    reg = await prisma.eventRegistration.findUnique({ where: { id: parsed.registrationId }, select: REG_SELECT });
    if (!reg) return deny('invalid', null);
    const check = checkLiveScan(liveTicketKey(reg.ticketCode), parsed, scannedAt);
    if (check !== 'ok') return deny(check, reg.eventId === eventId ? reg : null);
  } else {
    return deny('invalid', null);
  }

  if (reg.eventId !== eventId) {
    const other = await prisma.event.findUnique({ where: { id: reg.eventId }, select: { title: true } });
    return deny('wrong_event', null, { otherEvent: other?.title });
  }
  // A screenshot of the email's static code is exactly what live tickets exist to stop.
  if (parsed.kind === 'static' && event.liveTicketQr) return deny('live_required', reg);

  const verdict = ticketVerdict(reg);
  if (verdict !== 'admit') return deny(verdict, reg);

  const n = clampCount(input.count, reg.quantity - reg.checkedInCount);
  if (!(await addPeople(reg, n, false))) {
    // Another door admitted this ticket between our read and our update.
    const fresh = await prisma.eventRegistration.findUniqueOrThrow({ where: { id: reg.id }, select: REG_SELECT });
    return deny(ticketVerdict(fresh), fresh);
  }
  const log = await writeLog({ eventId, registrationId: reg.id, actor, name, action: 'admit', count: n, source, scannedAt: new Date(scannedAt) });
  const fresh = await prisma.eventRegistration.findUniqueOrThrow({ where: { id: reg.id }, select: REG_SELECT });
  return { verdict: 'admit', ticket: ticketSummary(fresh), admitted: n, previous: null, logId: log.id };
}

/**
 * Check-in from the manual lookup (no QR). Supervisors can override a ticket
 * that isn't valid, with a reason that goes in the log; door staff can't.
 */
export async function admitManually(
  eventId: number,
  input: { registrationId: number; count?: number; override?: boolean; reason?: string },
  actor: DoorActor,
): Promise<DoorResult> {
  await eventForActor(eventId, actor);
  const reg = await prisma.eventRegistration.findUnique({ where: { id: Number(input.registrationId) }, select: REG_SELECT });
  if (!reg || reg.eventId !== eventId) throw new NotFoundError('Ticket not found for this event');

  const name = await staffName(actor.userId);
  const verdict = ticketVerdict(reg);
  const remaining = reg.quantity - reg.checkedInCount;
  const override = verdict !== 'admit';
  if (override) {
    if (!input.override) throw new ValidationError('This ticket isn’t valid. A supervisor can override it, with a reason.');
    if (!canSupervise(actor)) throw new ForbiddenError('Only a supervisor can let in a ticket that isn’t valid');
    const reason = (input.reason ?? '').trim();
    if (reason.length < 3) throw new ValidationError('Give a reason for the override');
    if (remaining <= 0) throw new ValidationError('Everyone on this ticket is already in');
  }

  const n = clampCount(input.count, remaining);
  if (remaining <= 0 || !(await addPeople(reg, n, override))) {
    const fresh = await prisma.eventRegistration.findUniqueOrThrow({ where: { id: reg.id }, select: REG_SELECT });
    const log = await writeLog({
      eventId, registrationId: reg.id, actor, name, action: 'denied', verdict: ticketVerdict(fresh),
      source: 'manual', scannedAt: new Date(),
    });
    return { verdict: ticketVerdict(fresh), ticket: ticketSummary(fresh), admitted: 0, previous: await lastAdmission(reg.id), logId: log.id };
  }
  const log = await writeLog({
    eventId, registrationId: reg.id, actor, name, action: 'admit', count: n, source: 'manual',
    override, reason: override ? input.reason!.trim().slice(0, 500) : null, scannedAt: new Date(),
  });
  const fresh = await prisma.eventRegistration.findUniqueOrThrow({ where: { id: reg.id }, select: REG_SELECT });
  return { verdict: 'admit', ticket: ticketSummary(fresh), admitted: n, previous: null, logId: log.id };
}

/** Takes people back off a ticket after a mis-scan or "only 2 of the 4 are here". */
export async function undo(
  eventId: number,
  input: { registrationId: number; count: number },
  actor: DoorActor,
) {
  await eventForActor(eventId, actor);
  const reg = await prisma.eventRegistration.findUnique({ where: { id: Number(input.registrationId) }, select: REG_SELECT });
  if (!reg || reg.eventId !== eventId) throw new NotFoundError('Ticket not found for this event');
  const n = Number(input.count);
  if (!Number.isInteger(n) || n < 1) throw new ValidationError('Nothing to undo');

  if (!canSupervise(actor)) {
    // Door staff can only take back what they themselves just let in.
    const recent = await prisma.eventCheckIn.aggregate({
      where: {
        registrationId: reg.id, userId: actor.userId, action: 'admit',
        createdAt: { gte: new Date(Date.now() - STAFF_UNDO_MS) },
      },
      _sum: { count: true },
    });
    const undone = await prisma.eventCheckIn.aggregate({
      where: {
        registrationId: reg.id, userId: actor.userId, action: 'undo',
        createdAt: { gte: new Date(Date.now() - STAFF_UNDO_MS) },
      },
      _sum: { count: true },
    });
    if ((recent._sum.count ?? 0) - (undone._sum.count ?? 0) < n) {
      throw new ForbiddenError('You can only undo your own check-ins, within 5 minutes. Ask a supervisor.');
    }
  }

  const done = await prisma.$transaction(async (tx) => {
    const { count } = await tx.eventRegistration.updateMany({
      where: { id: reg.id, checkedInCount: { gte: n } },
      data: { checkedInCount: { decrement: n } },
    });
    if (count === 0) return false;
    await tx.eventRegistration.updateMany({ where: { id: reg.id, checkedInCount: 0 }, data: { checkInAt: null } });
    await writeLog({
      eventId, registrationId: reg.id, actor, name: await staffName(actor.userId), action: 'undo', count: n,
      source: 'manual', scannedAt: new Date(),
    }, tx);
    return true;
  });
  if (!done) throw new ValidationError('That ticket doesn’t have that many people checked in');
  const fresh = await prisma.eventRegistration.findUniqueOrThrow({ where: { id: reg.id }, select: REG_SELECT });
  return { ticket: ticketSummary(fresh), stats: await doorStats(eventId) };
}

/** Manual lookup: name, email, phone or (part of) a ticket code. */
export async function search(eventId: number, q: string, actor: DoorActor) {
  await eventForActor(eventId, actor);
  const term = q.trim();
  if (term.length < 2) return [];
  const regs = await prisma.eventRegistration.findMany({
    where: {
      eventId,
      status: { not: 'unconfirmed' },
      OR: [
        { name: { contains: term } },
        { email: { contains: term } },
        { phone: { contains: term } },
        { ticketCode: { startsWith: term.toLowerCase() } },
      ],
    },
    select: { ...REG_SELECT, email: true },
    orderBy: { name: 'asc' },
    take: 20,
  });
  return regs.map((r) => ({ ...ticketSummary(r), email: maskEmail(r.email), verdict: ticketVerdict(r) }));
}

/** Enough of an email to confirm it's them, without door phones holding the address. */
function maskEmail(email: string) {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(1, Math.min(6, user.length - 2)))}@${domain}`;
}

/** The door's history for the registrations page: every scan, admission, denial and undo. */
export async function checkInLog(eventId: number, page = 1, limit = 50) {
  const where = { eventId };
  const [items, total] = await Promise.all([
    prisma.eventCheckIn.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { registration: { select: { name: true, quantity: true } } },
    }),
    prisma.eventCheckIn.count({ where }),
  ]);
  return { items, total, stats: await doorStats(eventId) };
}

/** The registrations page's "Check in" button: everyone on the ticket, logged like any door check-in. */
export function checkInFromAdmin(eventId: number, registrationId: number, actor: DoorActor) {
  return admitManually(eventId, { registrationId }, actor);
}
