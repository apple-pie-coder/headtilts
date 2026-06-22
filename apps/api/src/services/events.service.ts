import crypto from 'crypto';
import Razorpay from 'razorpay';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { ValidationError, NotFoundError } from '../utils/errors';
import { slugify } from '@headtilts/shared';
import { sendMail } from './mail.service';
import qrcode from 'qrcode';

// ─── Select shapes ────────────────────────────────────────────────────────────

const TICKET_TIER_SELECT = {
  id: true, eventId: true, name: true, description: true,
  price: true, currency: true, quantity: true, soldCount: true,
  availableFrom: true, availableUntil: true, isVisible: true,
  perOrderMin: true, perOrderMax: true, position: true,
} as const;

const SPEAKER_SELECT = {
  id: true, eventId: true, name: true, bio: true, photo: true,
  designation: true, company: true, socialLinks: true, position: true,
} as const;

const AGENDA_SELECT = {
  id: true, eventId: true, title: true, description: true,
  startsAt: true, endsAt: true, type: true, speakerId: true, position: true,
} as const;

const CUSTOM_FIELD_SELECT = {
  id: true, eventId: true, label: true, fieldType: true,
  options: true, required: true, position: true,
} as const;

const EVENT_LIST_SELECT = {
  id: true, title: true, slug: true, excerpt: true, startAt: true, endAt: true,
  timezone: true, type: true, status: true, featuredImage: true, bannerImage: true,
  venueName: true, venueCity: true, venueCountry: true, isFeatured: true,
  isRegistrationRequired: true, maxAttendees: true, showAttendeesCount: true,
  isRecurring: true, parentEventId: true, createdAt: true, updatedAt: true,
  _count: { select: { registrations: true } },
} as const;

const EVENT_FULL_SELECT = {
  ...EVENT_LIST_SELECT,
  description: true, venueAddress: true, venueState: true, venueMapEmbed: true,
  onlineUrl: true, streamUrl: true, streamPlatform: true,
  registrationDeadline: true, requireApproval: true, showAttendeesNames: true,
  recurrenceType: true, recurrenceInterval: true, recurrenceDays: true,
  recurrenceEndsAt: true, metaTitle: true, metaDescription: true, ogImage: true,
  ticketTiers: { select: TICKET_TIER_SELECT, orderBy: { position: 'asc' as const } },
  speakers: { select: SPEAKER_SELECT, orderBy: { position: 'asc' as const } },
  agendaItems: { select: AGENDA_SELECT, orderBy: { position: 'asc' as const } },
  customFields: { select: CUSTOM_FIELD_SELECT, orderBy: { position: 'asc' as const } },
} as const;

// ─── Input interfaces ─────────────────────────────────────────────────────────

export interface TicketTierInput {
  id?: number;
  name: string;
  description?: string;
  price?: number;
  currency?: string;
  quantity?: number | null;
  availableFrom?: string | null;
  availableUntil?: string | null;
  isVisible?: boolean;
  perOrderMin?: number;
  perOrderMax?: number;
  position?: number;
}

export interface SpeakerInput {
  id?: number;
  name: string;
  bio?: string;
  photo?: string;
  designation?: string;
  company?: string;
  socialLinks?: Record<string, string>;
  position?: number;
}

export interface AgendaItemInput {
  id?: number;
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  type?: string;
  speakerId?: number | null;
  position?: number;
}

export interface CustomFieldInput {
  id?: number;
  label: string;
  fieldType?: string;
  options?: string[];
  required?: boolean;
  position?: number;
}

export interface EventInput {
  title: string;
  slug?: string;
  excerpt?: string;
  description?: string;
  startAt: string;
  endAt: string;
  timezone?: string;
  type?: string;
  status?: string;
  featuredImage?: string | null;
  bannerImage?: string | null;
  venueName?: string;
  venueAddress?: string;
  venueCity?: string;
  venueState?: string;
  venueCountry?: string;
  venueMapEmbed?: string;
  onlineUrl?: string;
  streamUrl?: string;
  streamPlatform?: string;
  maxAttendees?: number | null;
  isRegistrationRequired?: boolean;
  registrationDeadline?: string | null;
  requireApproval?: boolean;
  showAttendeesCount?: boolean;
  showAttendeesNames?: boolean;
  isFeatured?: boolean;
  isRecurring?: boolean;
  recurrenceType?: string;
  recurrenceInterval?: number;
  recurrenceDays?: string;
  recurrenceEndsAt?: string | null;
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
  ticketTiers?: TicketTierInput[];
  speakers?: SpeakerInput[];
  agendaItems?: AgendaItemInput[];
  customFields?: CustomFieldInput[];
}

// ─── Recurring helpers ────────────────────────────────────────────────────────

function generateOccurrenceDates(
  firstStart: Date,
  firstEnd: Date,
  recType: string,
  interval: number,
  endsAt: Date | null,
  recDays?: string,
): { startAt: Date; endAt: Date }[] {
  const duration = firstEnd.getTime() - firstStart.getTime();
  const results: { startAt: Date; endAt: Date }[] = [];
  const maxOccurrences = 52;
  const limit = endsAt ?? new Date(firstStart.getTime() + 365 * 24 * 3600 * 1000);

  let current = new Date(firstStart);
  let count = 0;

  while (count < maxOccurrences) {
    // Advance by interval
    if (recType === 'daily') {
      current = new Date(current.getTime() + interval * 24 * 3600 * 1000);
    } else if (recType === 'weekly') {
      if (recDays) {
        // Multi-day weekly: find next matching day
        const days: number[] = JSON.parse(recDays);
        let found = false;
        for (let i = 1; i <= 7 * interval; i++) {
          const next = new Date(current.getTime() + i * 24 * 3600 * 1000);
          if (days.includes(next.getDay())) {
            current = next;
            found = true;
            break;
          }
        }
        if (!found) break;
      } else {
        current = new Date(current.getTime() + interval * 7 * 24 * 3600 * 1000);
      }
    } else if (recType === 'monthly') {
      current = new Date(current);
      current.setMonth(current.getMonth() + interval);
    } else if (recType === 'yearly') {
      current = new Date(current);
      current.setFullYear(current.getFullYear() + interval);
    } else {
      break;
    }

    if (current > limit) break;
    results.push({ startAt: new Date(current), endAt: new Date(current.getTime() + duration) });
    count++;
  }

  return results;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listEvents(
  page = 1,
  limit = 20,
  opts: { search?: string; status?: string; type?: string; timeframe?: string } = {},
) {
  const now = new Date();
  const where: Record<string, unknown> = {
    parentEventId: null, // don't show child occurrences in list
    ...(opts.search ? {
      OR: [
        { title: { contains: opts.search } },
        { excerpt: { contains: opts.search } },
        { venueCity: { contains: opts.search } },
      ],
    } : {}),
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.type ? { type: opts.type } : {}),
    ...(opts.timeframe === 'upcoming' ? { startAt: { gte: now } } : {}),
    ...(opts.timeframe === 'past' ? { endAt: { lt: now } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.event.findMany({
      where,
      select: EVENT_LIST_SELECT,
      orderBy: { startAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.event.count({ where }),
  ]);

  return { items, total };
}

export async function getEvent(idOrSlug: string | number) {
  const where = typeof idOrSlug === 'number' || /^\d+$/.test(String(idOrSlug))
    ? { id: Number(idOrSlug) }
    : { slug: String(idOrSlug) };
  const event = await prisma.event.findFirst({ where, select: EVENT_FULL_SELECT });
  if (!event) throw new NotFoundError('Event not found');
  return event;
}

export async function createEvent(input: EventInput) {
  const slug = await resolveSlug(input.slug, input.title);

  const event = await prisma.event.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: buildEventData(slug, input) as any,
    select: EVENT_FULL_SELECT,
  });

  // Sync child resources
  await syncChildResources(event.id, input);

  // Generate recurring occurrences
  if (input.isRecurring && input.recurrenceType) {
    await generateOccurrences(event.id, event.startAt, event.endAt, input);
  }

  return getEvent(event.id);
}

export async function updateEvent(
  id: number,
  input: Partial<EventInput>,
  recurringScope: 'this' | 'future' | 'all' = 'this',
) {
  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Event not found');

  let slug = existing.slug;
  if (input.title && input.slug === undefined) {
    // title changed but no explicit slug — keep current
  } else if (input.slug && input.slug !== existing.slug) {
    slug = await resolveSlug(input.slug, input.title ?? existing.title, id);
  }

  const data = buildEventData(slug, { ...input, title: input.title ?? existing.title });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await prisma.event.update({ where: { id }, data: data as any });

  if (input.ticketTiers !== undefined) await syncTicketTiers(id, input.ticketTiers);
  if (input.speakers !== undefined) await syncSpeakers(id, input.speakers);
  if (input.agendaItems !== undefined) await syncAgendaItems(id, input.agendaItems);
  if (input.customFields !== undefined) await syncCustomFields(id, input.customFields);

  // Propagate to child occurrences for recurring events
  if (existing.isRecurring && (recurringScope === 'future' || recurringScope === 'all')) {
    const children = await prisma.event.findMany({
      where: {
        parentEventId: id,
        ...(recurringScope === 'future' ? { startAt: { gte: existing.startAt } } : {}),
      },
    });
    const baseFields = buildEventData(slug, { ...input, title: input.title ?? existing.title });
    // Don't overwrite per-occurrence start/end
    const { startAt: _s, endAt: _e, ...fieldsToPropagate } = baseFields as Record<string, unknown>;
    void _s; void _e;
    for (const child of children) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await prisma.event.update({ where: { id: child.id }, data: fieldsToPropagate as any });
    }
  }

  return getEvent(id);
}

export async function deleteEvent(id: number) {
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) throw new NotFoundError('Event not found');
  await prisma.event.delete({ where: { id } });
}

// ─── Public listing ───────────────────────────────────────────────────────────

const PUBLIC_EVENT_SELECT = {
  id: true, title: true, slug: true, excerpt: true, startAt: true, endAt: true,
  timezone: true, type: true, status: true, featuredImage: true, bannerImage: true,
  venueName: true, venueCity: true, venueState: true, venueCountry: true,
  streamUrl: true, streamPlatform: true,
  isFeatured: true, isRegistrationRequired: true, maxAttendees: true,
  showAttendeesCount: true, registrationDeadline: true,
  ticketTiers: {
    where: { isVisible: true },
    select: { id: true, name: true, description: true, price: true, currency: true, quantity: true, soldCount: true, availableFrom: true, availableUntil: true, perOrderMin: true, perOrderMax: true },
    orderBy: { position: 'asc' as const },
  },
  speakers: { select: SPEAKER_SELECT, orderBy: { position: 'asc' as const } },
  agendaItems: { select: AGENDA_SELECT, orderBy: { position: 'asc' as const } },
  customFields: { select: CUSTOM_FIELD_SELECT, orderBy: { position: 'asc' as const } },
  _count: { select: { registrations: { where: { status: { in: ['confirmed', 'waitlisted'] as string[] } } } } },
} as const;

export async function listPublicEvents(
  page = 1,
  limit = 12,
  opts: { type?: string; timeframe?: string; featured?: boolean; excludeIds?: number[] } = {},
) {
  const now = new Date();
  const where: Record<string, unknown> = {
    status: 'published',
    parentEventId: null,
    ...(opts.type ? { type: opts.type } : {}),
    ...(opts.timeframe === 'upcoming' ? { startAt: { gte: now } } : {}),
    ...(opts.timeframe === 'past' ? { endAt: { lt: now } } : {}),
    ...(opts.featured ? { isFeatured: true } : {}),
    ...(opts.excludeIds?.length ? { id: { notIn: opts.excludeIds } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.event.findMany({
      where,
      select: PUBLIC_EVENT_SELECT,
      orderBy: opts.timeframe === 'past' ? { startAt: 'desc' } : { startAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.event.count({ where }),
  ]);

  return { items, total };
}

export async function getPublicEvent(slug: string) {
  const event = await prisma.event.findFirst({
    where: { slug, status: 'published' },
    select: {
      ...PUBLIC_EVENT_SELECT,
      description: true, venueAddress: true, venueMapEmbed: true,
      showAttendeesNames: true, requireApproval: true,
      metaTitle: true, metaDescription: true, ogImage: true,
    },
  });
  if (!event) throw new NotFoundError('Event not found');

  let attendees: { name: string; email: string }[] | null = null;
  if (event.showAttendeesNames) {
    const regs = await prisma.eventRegistration.findMany({
      where: { eventId: event.id, status: 'confirmed' },
      select: { name: true, email: true },
      take: 50,
    });
    attendees = regs;
  }

  return { ...event, attendees };
}

// ─── Registration ─────────────────────────────────────────────────────────────

function getRazorpay(): Razorpay {
  const key = process.env.RAZORPAY_KEY_ID ?? '';
  const secret = process.env.RAZORPAY_KEY_SECRET ?? '';
  if (!key || !secret) throw new ValidationError('Razorpay not configured');
  return new Razorpay({ key_id: key, key_secret: secret });
}

export async function registerForEvent(
  slug: string,
  input: {
    name: string;
    email: string;
    phone?: string;
    ticketTierId?: number;
    quantity?: number;
    customData?: Record<string, unknown>;
  },
) {
  const event = await prisma.event.findFirst({
    where: { slug, status: 'published' },
    include: {
      ticketTiers: { where: { isVisible: true } },
      _count: { select: { registrations: { where: { status: { in: ['confirmed', 'waitlisted'] as string[] } } } } },
    },
  });
  if (!event) throw new NotFoundError('Event not found');

  // Registration deadline check
  if (event.registrationDeadline && new Date() > event.registrationDeadline) {
    throw new ValidationError('Registration is closed for this event');
  }

  // Capacity check
  const qty = input.quantity ?? 1;
  const confirmedCount = event._count.registrations;
  const isWaitlisted = event.maxAttendees !== null && confirmedCount + qty > event.maxAttendees;

  // Ticket tier
  let tier: typeof event.ticketTiers[0] | null = null;
  if (input.ticketTierId) {
    tier = event.ticketTiers.find((t) => t.id === input.ticketTierId) ?? null;
    if (!tier) throw new ValidationError('Invalid ticket tier');

    // Tier availability window
    const now = new Date();
    if (tier.availableFrom && now < tier.availableFrom) throw new ValidationError('Ticket sales not yet open');
    if (tier.availableUntil && now > tier.availableUntil) throw new ValidationError('Ticket sales closed');

    // Tier quantity
    if (tier.quantity !== null && tier.soldCount + qty > tier.quantity) {
      throw new ValidationError('Selected ticket tier is sold out');
    }

    if (qty < tier.perOrderMin || qty > tier.perOrderMax) {
      throw new ValidationError(`Quantity must be between ${tier.perOrderMin} and ${tier.perOrderMax}`);
    }
  }

  const isFree = !tier || tier.price === 0;
  const status = event.requireApproval ? 'pending' : (isWaitlisted ? 'waitlisted' : 'confirmed');

  // Create registration record
  const reg = await prisma.eventRegistration.create({
    data: {
      eventId: event.id,
      ticketTierId: tier?.id ?? null,
      name: input.name,
      email: input.email,
      phone: input.phone,
      quantity: qty,
      status: isFree ? status : 'pending',
      paymentStatus: isFree ? 'free' : 'pending',
      paymentProvider: isFree ? null : 'razorpay',
      customData: (input.customData ?? Prisma.DbNull) as Prisma.InputJsonValue,
    },
  });

  if (isFree) {
    if (tier) {
      await prisma.eventTicketTier.update({
        where: { id: tier.id },
        data: { soldCount: { increment: qty } },
      });
    }
    if (status === 'confirmed') {
      await sendTicketEmail(reg, event);
    }
    return { registration: reg, requiresPayment: false };
  }

  // Paid — create Razorpay order
  const razorpay = getRazorpay();
  const amountPaise = tier!.price * qty;
  const order = await razorpay.orders.create({
    amount: amountPaise,
    currency: tier!.currency,
    receipt: `reg_${reg.id}`,
    notes: { registrationId: String(reg.id), eventSlug: slug },
  });

  await prisma.eventRegistration.update({
    where: { id: reg.id },
    data: { paymentOrderId: order.id, paymentAmount: amountPaise },
  });

  return {
    registration: reg,
    requiresPayment: true,
    orderId: order.id,
    amount: amountPaise,
    currency: tier!.currency,
    keyId: process.env.RAZORPAY_KEY_ID,
  };
}

export async function verifyPayment(input: {
  registrationId: number;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}) {
  const reg = await prisma.eventRegistration.findUnique({
    where: { id: input.registrationId },
    include: { event: true, ticketTier: true },
  });
  if (!reg) throw new NotFoundError('Registration not found');
  if (reg.paymentStatus === 'paid') return reg;

  const body = `${input.razorpay_order_id}|${input.razorpay_payment_id}`;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET ?? '')
    .update(body)
    .digest('hex');

  if (expected !== input.razorpay_signature) {
    throw new ValidationError('Payment verification failed');
  }

  const updated = await prisma.eventRegistration.update({
    where: { id: reg.id },
    data: {
      status: reg.event.requireApproval ? 'pending' : 'confirmed',
      paymentStatus: 'paid',
      paymentId: input.razorpay_payment_id,
    },
  });

  if (reg.ticketTier) {
    await prisma.eventTicketTier.update({
      where: { id: reg.ticketTier.id },
      data: { soldCount: { increment: reg.quantity } },
    });
  }

  if (updated.status === 'confirmed') {
    await sendTicketEmail(updated, reg.event);
  }

  return updated;
}

export async function cancelRegistration(ticketCode: string) {
  const reg = await prisma.eventRegistration.findUnique({ where: { ticketCode }, include: { event: true } });
  if (!reg) throw new NotFoundError('Registration not found');
  if (reg.status === 'cancelled') return reg;

  // Allow self-cancel up to event start
  if (reg.event.startAt <= new Date()) throw new ValidationError('Event has already started');

  await prisma.eventRegistration.update({
    where: { id: reg.id },
    data: { status: 'cancelled', cancelledAt: new Date() },
  });

  if (reg.ticketTierId) {
    await prisma.eventTicketTier.update({
      where: { id: reg.ticketTierId },
      data: { soldCount: { decrement: reg.quantity } },
    });
  }

  return reg;
}

// ─── Admin registration management ───────────────────────────────────────────

export async function listRegistrations(
  eventId: number,
  page = 1,
  limit = 50,
  opts: { status?: string; search?: string } = {},
) {
  const where: Record<string, unknown> = {
    eventId,
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.search ? {
      OR: [
        { name: { contains: opts.search } },
        { email: { contains: opts.search } },
      ],
    } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.eventRegistration.findMany({
      where,
      include: { ticketTier: { select: { id: true, name: true, price: true } } },
      orderBy: { registeredAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.eventRegistration.count({ where }),
  ]);

  return { items, total };
}

export async function updateRegistration(
  id: number,
  action: 'approve' | 'cancel' | 'check-in',
) {
  const reg = await prisma.eventRegistration.findUnique({
    where: { id }, include: { event: true, ticketTier: true },
  });
  if (!reg) throw new NotFoundError('Registration not found');

  if (action === 'approve') {
    await prisma.eventRegistration.update({
      where: { id }, data: { status: 'confirmed' },
    });
    await sendTicketEmail({ ...reg, status: 'confirmed' }, reg.event);
  } else if (action === 'cancel') {
    await prisma.eventRegistration.update({
      where: { id }, data: { status: 'cancelled', cancelledAt: new Date() },
    });
    if (reg.ticketTier) {
      await prisma.eventTicketTier.update({
        where: { id: reg.ticketTier.id },
        data: { soldCount: { decrement: reg.quantity } },
      });
    }
  } else if (action === 'check-in') {
    await prisma.eventRegistration.update({
      where: { id }, data: { checkInAt: new Date() },
    });
  }

  return prisma.eventRegistration.findUnique({ where: { id } });
}

export async function exportRegistrationsCsv(eventId: number): Promise<string> {
  const regs = await prisma.eventRegistration.findMany({
    where: { eventId },
    include: { ticketTier: { select: { name: true } } },
    orderBy: { registeredAt: 'asc' },
  });

  const headers = ['ID', 'Name', 'Email', 'Phone', 'Ticket', 'Qty', 'Status', 'Payment', 'Checked In', 'Registered At'];
  const rows = regs.map((r) => [
    r.id,
    r.name,
    r.email,
    r.phone ?? '',
    r.ticketTier?.name ?? 'General',
    r.quantity,
    r.status,
    r.paymentStatus,
    r.checkInAt ? r.checkInAt.toISOString() : '',
    r.registeredAt.toISOString(),
  ]);

  return [headers, ...rows].map((row) =>
    row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
  ).join('\n');
}

// ─── iCal feed ────────────────────────────────────────────────────────────────

function icalDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function foldLine(line: string): string {
  const out: string[] = [];
  while (line.length > 75) {
    out.push(line.slice(0, 75));
    line = ' ' + line.slice(75);
  }
  out.push(line);
  return out.join('\r\n');
}

export async function generateIcal(slugs?: string[]): Promise<string> {
  const where: Record<string, unknown> = { status: 'published', parentEventId: null };
  if (slugs?.length) where.slug = { in: slugs };

  const events = await prisma.event.findMany({
    where,
    select: {
      id: true, title: true, slug: true, excerpt: true, startAt: true, endAt: true,
      venueName: true, venueAddress: true, venueCity: true, venueCountry: true,
      status: true,
    },
    orderBy: { startAt: 'asc' },
  });

  const baseUrl = process.env.PUBLIC_URL ?? '';

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Headtilts//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const e of events) {
    const location = [e.venueName, e.venueAddress, e.venueCity, e.venueCountry]
      .filter(Boolean).join(', ');
    lines.push('BEGIN:VEVENT');
    lines.push(foldLine(`UID:event-${e.id}@headtilts`));
    lines.push(foldLine(`DTSTART:${icalDate(e.startAt)}`));
    lines.push(foldLine(`DTEND:${icalDate(e.endAt)}`));
    lines.push(foldLine(`SUMMARY:${e.title}`));
    if (e.excerpt) lines.push(foldLine(`DESCRIPTION:${e.excerpt.replace(/\n/g, '\\n')}`));
    if (location) lines.push(foldLine(`LOCATION:${location}`));
    lines.push(foldLine(`URL:${baseUrl}/events/${e.slug}`));
    lines.push(foldLine(`STATUS:${e.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`));
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// ─── Email ────────────────────────────────────────────────────────────────────

async function sendTicketEmail(
  reg: { id: number; name: string; email: string; ticketCode: string; quantity: number; status: string },
  event: { title: string; startAt: Date; endAt: Date; venueName?: string | null; venueCity?: string | null; type: string },
) {
  try {
    const qrDataUrl = await qrcode.toDataURL(reg.ticketCode, { width: 200 });
    const location = event.type === 'online'
      ? 'Online Event — join link sent separately'
      : [event.venueName, event.venueCity].filter(Boolean).join(', ') || 'TBD';

    const html = `
<h2>Your registration is confirmed!</h2>
<p>Hi ${reg.name},</p>
<p>You're registered for <strong>${event.title}</strong>.</p>
<table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
  <tr><td style="padding:4px 12px 4px 0;color:#888">Date</td><td>${event.startAt.toUTCString()}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#888">Location</td><td>${location}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#888">Ticket code</td><td><code>${reg.ticketCode}</code></td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#888">Quantity</td><td>${reg.quantity}</td></tr>
</table>
<p>Show this QR code at the event entrance:</p>
<img src="${qrDataUrl}" alt="QR Code" width="200" />
<p>To cancel your registration, use ticket code: <code>${reg.ticketCode}</code></p>
    `.trim();

    await sendMail({
      to: reg.email,
      subject: `Ticket confirmed: ${event.title}`,
      html,
      text: `Confirmed for ${event.title}. Ticket code: ${reg.ticketCode}`,
    });
  } catch {
    // Non-blocking — log silently
    console.error('[events] Failed to send ticket email for registration', reg.id);
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function resolveSlug(slug?: string, title?: string, excludeId?: number): Promise<string> {
  const base = slug ? slugify(slug) : slugify(title ?? 'event');
  let candidate = base;
  let suffix = 1;

  while (true) {
    const existing = await prisma.event.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${base}-${suffix++}`;
  }
}

function buildEventData(slug: string, input: Partial<EventInput>) {
  return {
    slug,
    title: input.title!,
    excerpt: input.excerpt,
    description: input.description,
    ...(input.startAt ? { startAt: new Date(input.startAt) } : {}),
    ...(input.endAt   ? { endAt:   new Date(input.endAt)   } : {}),
    timezone: input.timezone ?? 'UTC',
    type: input.type ?? 'in_person',
    status: input.status ?? 'draft',
    featuredImage: input.featuredImage ?? null,
    bannerImage: input.bannerImage ?? null,
    venueName: input.venueName,
    venueAddress: input.venueAddress,
    venueCity: input.venueCity,
    venueState: input.venueState,
    venueCountry: input.venueCountry,
    venueMapEmbed: input.venueMapEmbed,
    onlineUrl: input.onlineUrl,
    streamUrl: input.streamUrl,
    streamPlatform: input.streamPlatform,
    maxAttendees: input.maxAttendees ?? null,
    isRegistrationRequired: input.isRegistrationRequired ?? true,
    registrationDeadline: input.registrationDeadline ? new Date(input.registrationDeadline) : null,
    requireApproval: input.requireApproval ?? false,
    showAttendeesCount: input.showAttendeesCount ?? true,
    showAttendeesNames: input.showAttendeesNames ?? false,
    isFeatured: input.isFeatured ?? false,
    isRecurring: input.isRecurring ?? false,
    recurrenceType: input.recurrenceType,
    recurrenceInterval: input.recurrenceInterval ?? 1,
    recurrenceDays: input.recurrenceDays,
    recurrenceEndsAt: input.recurrenceEndsAt ? new Date(input.recurrenceEndsAt) : null,
    metaTitle: input.metaTitle,
    metaDescription: input.metaDescription,
    ogImage: input.ogImage,
  };
}

async function syncChildResources(eventId: number, input: Partial<EventInput>) {
  if (input.ticketTiers !== undefined) await syncTicketTiers(eventId, input.ticketTiers);
  if (input.speakers !== undefined) await syncSpeakers(eventId, input.speakers);
  if (input.agendaItems !== undefined) await syncAgendaItems(eventId, input.agendaItems);
  if (input.customFields !== undefined) await syncCustomFields(eventId, input.customFields);
}

async function syncTicketTiers(eventId: number, tiers: TicketTierInput[] = []) {
  const existing = await prisma.eventTicketTier.findMany({ where: { eventId }, select: { id: true } });
  const incoming = new Set(tiers.map((t) => t.id).filter(Boolean));
  const toDelete = existing.filter((t) => !incoming.has(t.id)).map((t) => t.id);

  if (toDelete.length) await prisma.eventTicketTier.deleteMany({ where: { id: { in: toDelete } } });

  for (const tier of tiers) {
    if (tier.id) {
      await prisma.eventTicketTier.update({
        where: { id: tier.id },
        data: {
          name: tier.name, description: tier.description,
          price: tier.price ?? 0, currency: tier.currency ?? 'INR',
          quantity: tier.quantity ?? null,
          availableFrom: tier.availableFrom ? new Date(tier.availableFrom) : null,
          availableUntil: tier.availableUntil ? new Date(tier.availableUntil) : null,
          isVisible: tier.isVisible ?? true,
          perOrderMin: tier.perOrderMin ?? 1, perOrderMax: tier.perOrderMax ?? 10,
          position: tier.position ?? 0,
        },
      });
    } else {
      await prisma.eventTicketTier.create({
        data: {
          eventId, name: tier.name, description: tier.description,
          price: tier.price ?? 0, currency: tier.currency ?? 'INR',
          quantity: tier.quantity ?? null,
          availableFrom: tier.availableFrom ? new Date(tier.availableFrom) : null,
          availableUntil: tier.availableUntil ? new Date(tier.availableUntil) : null,
          isVisible: tier.isVisible ?? true,
          perOrderMin: tier.perOrderMin ?? 1, perOrderMax: tier.perOrderMax ?? 10,
          position: tier.position ?? 0,
        },
      });
    }
  }
}

async function syncSpeakers(eventId: number, speakers: SpeakerInput[] = []) {
  const existing = await prisma.eventSpeaker.findMany({ where: { eventId }, select: { id: true } });
  const incoming = new Set(speakers.map((s) => s.id).filter(Boolean));
  const toDelete = existing.filter((s) => !incoming.has(s.id)).map((s) => s.id);
  if (toDelete.length) await prisma.eventSpeaker.deleteMany({ where: { id: { in: toDelete } } });

  for (const sp of speakers) {
    const data = {
      name: sp.name, bio: sp.bio, photo: sp.photo,
      designation: sp.designation, company: sp.company,
      socialLinks: (sp.socialLinks ?? Prisma.DbNull) as Prisma.InputJsonValue,
      position: sp.position ?? 0,
    };
    if (sp.id) await prisma.eventSpeaker.update({ where: { id: sp.id }, data });
    else await prisma.eventSpeaker.create({ data: { eventId, ...data } });
  }
}

async function syncAgendaItems(eventId: number, items: AgendaItemInput[] = []) {
  const existing = await prisma.eventAgendaItem.findMany({ where: { eventId }, select: { id: true } });
  const incoming = new Set(items.map((i) => i.id).filter(Boolean));
  const toDelete = existing.filter((i) => !incoming.has(i.id)).map((i) => i.id);
  if (toDelete.length) await prisma.eventAgendaItem.deleteMany({ where: { id: { in: toDelete } } });

  for (const item of items) {
    const data = {
      title: item.title, description: item.description,
      startsAt: new Date(item.startsAt), endsAt: new Date(item.endsAt),
      type: item.type ?? 'session', speakerId: item.speakerId ?? null,
      position: item.position ?? 0,
    };
    if (item.id) await prisma.eventAgendaItem.update({ where: { id: item.id }, data });
    else await prisma.eventAgendaItem.create({ data: { eventId, ...data } });
  }
}

async function syncCustomFields(eventId: number, fields: CustomFieldInput[] = []) {
  const existing = await prisma.eventCustomField.findMany({ where: { eventId }, select: { id: true } });
  const incoming = new Set(fields.map((f) => f.id).filter(Boolean));
  const toDelete = existing.filter((f) => !incoming.has(f.id)).map((f) => f.id);
  if (toDelete.length) await prisma.eventCustomField.deleteMany({ where: { id: { in: toDelete } } });

  for (const field of fields) {
    const data = {
      label: field.label, fieldType: field.fieldType ?? 'text',
      options: (field.options ?? Prisma.DbNull) as Prisma.InputJsonValue,
      required: field.required ?? false,
      position: field.position ?? 0,
    };
    if (field.id) await prisma.eventCustomField.update({ where: { id: field.id }, data });
    else await prisma.eventCustomField.create({ data: { eventId, ...data } });
  }
}

async function generateOccurrences(
  parentId: number,
  firstStart: Date,
  firstEnd: Date,
  input: EventInput,
) {
  const occurrences = generateOccurrenceDates(
    firstStart, firstEnd,
    input.recurrenceType!, input.recurrenceInterval ?? 1,
    input.recurrenceEndsAt ? new Date(input.recurrenceEndsAt) : null,
    input.recurrenceDays,
  );

  const parentData = await prisma.event.findUnique({
    where: { id: parentId },
    select: EVENT_FULL_SELECT,
  });
  if (!parentData) return;

  for (let i = 0; i < occurrences.length; i++) {
    const { startAt, endAt } = occurrences[i];
    const childSlug = `${parentData.slug}-${i + 2}`;
    await prisma.event.create({
      data: {
        ...buildEventData(childSlug, input),
        startAt, endAt,
        parentEventId: parentId,
        isRecurring: false,
      },
    });
  }
}
