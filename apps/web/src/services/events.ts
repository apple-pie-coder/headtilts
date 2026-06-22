import { EventListResult, EventFull, EventRegistrationResult } from '../types';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

async function get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    });
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Request failed: ${res.status}`);
  }
  return (await res.json()).data as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed: ${res.status}`);
  return json.data as T;
}

export async function fetchEvents(opts: {
  page?: number;
  limit?: number;
  type?: string;
  timeframe?: string;
  featured?: boolean;
  excludeIds?: number[];
} = {}): Promise<EventListResult> {
  return get<EventListResult>('/public/events', {
    page: opts.page,
    limit: opts.limit,
    type: opts.type,
    timeframe: opts.timeframe ?? 'upcoming',
    ...(opts.featured ? { featured: true } : {}),
    ...(opts.excludeIds?.length ? { excludeIds: opts.excludeIds.join(',') } : {}),
  });
}

export async function fetchEvent(slug: string): Promise<EventFull> {
  return get<EventFull>(`/public/events/${slug}`);
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
): Promise<EventRegistrationResult> {
  return post<EventRegistrationResult>(`/public/events/${slug}/register`, input);
}

export async function verifyEventPayment(
  slug: string,
  input: {
    registrationId: number;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  },
): Promise<unknown> {
  return post<unknown>(`/public/events/${slug}/register/verify`, input);
}

export async function cancelRegistration(ticketCode: string): Promise<unknown> {
  return post<unknown>(`/public/events/cancel/${ticketCode}`, {});
}

export function eventIcalUrl(slug?: string): string {
  if (slug) return `${BASE}/public/events/${slug}/calendar.ics`;
  return `${BASE}/public/events/calendar.ics`;
}

export function googleCalendarUrl(ev: { title: string; startAt: string; endAt: string; venueName: string | null; venueCity: string | null; slug: string }): string {
  const fmt = (d: string) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const location = [ev.venueName, ev.venueCity].filter(Boolean).join(', ');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: `${fmt(ev.startAt)}/${fmt(ev.endAt)}`,
    ...(location ? { location } : {}),
    details: `${window.location.origin}/events/${ev.slug}`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
