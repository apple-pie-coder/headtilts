import { apiClient } from './api';

export interface TicketTier {
  id?: number;
  eventId?: number;
  name: string;
  description?: string;
  price: number;
  currency: string;
  quantity: number | null;
  soldCount?: number;
  availableFrom?: string | null;
  availableUntil?: string | null;
  isVisible: boolean;
  perOrderMin: number;
  perOrderMax: number;
  position: number;
}

export interface Speaker {
  id?: number;
  eventId?: number;
  name: string;
  bio?: string;
  photo?: string;
  designation?: string;
  company?: string;
  socialLinks?: Record<string, string>;
  position: number;
}

export interface AgendaItem {
  id?: number;
  eventId?: number;
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  type: string;
  speakerId?: number | null;
  position: number;
}

export interface CustomField {
  id?: number;
  eventId?: number;
  label: string;
  fieldType: string;
  options?: string[];
  required: boolean;
  position: number;
}

export interface EventSummary {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  startAt: string;
  endAt: string;
  timezone: string;
  type: string;
  status: string;
  featuredImage: string | null;
  bannerImage: string | null;
  venueName: string | null;
  venueCity: string | null;
  venueCountry: string | null;
  isFeatured: boolean;
  isRegistrationRequired: boolean;
  maxAttendees: number | null;
  showAttendeesCount: boolean;
  isRecurring: boolean;
  parentEventId: number | null;
  createdAt: string;
  updatedAt: string;
  _count: { registrations: number };
}

export interface EventFull extends EventSummary {
  description: string | null;
  venueAddress: string | null;
  venueState: string | null;
  venueMapEmbed: string | null;
  onlineUrl: string | null;
  streamUrl: string | null;
  streamPlatform: string | null;
  registrationDeadline: string | null;
  requireApproval: boolean;
  showAttendeesNames: boolean;
  recurrenceType: string | null;
  recurrenceInterval: number | null;
  recurrenceDays: string | null;
  recurrenceEndsAt: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImage: string | null;
  ticketTiers: TicketTier[];
  speakers: Speaker[];
  agendaItems: AgendaItem[];
  customFields: CustomField[];
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
  ticketTiers?: TicketTier[];
  speakers?: Speaker[];
  agendaItems?: AgendaItem[];
  customFields?: CustomField[];
}

export interface Registration {
  id: number;
  eventId: number;
  ticketTierId: number | null;
  name: string;
  email: string;
  phone: string | null;
  quantity: number;
  status: string;
  ticketCode: string;
  paymentStatus: string;
  paymentProvider: string | null;
  paymentId: string | null;
  paymentAmount: number | null;
  customData: Record<string, unknown> | null;
  checkInAt: string | null;
  registeredAt: string;
  cancelledAt: string | null;
  ticketTier: { id: number; name: string; price: number } | null;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export async function fetchEvents(opts: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  type?: string;
  timeframe?: string;
} = {}): Promise<PaginatedResult<EventSummary>> {
  const params = new URLSearchParams();
  if (opts.page) params.set('page', String(opts.page));
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.search) params.set('search', opts.search);
  if (opts.status) params.set('status', opts.status);
  if (opts.type) params.set('type', opts.type);
  if (opts.timeframe) params.set('timeframe', opts.timeframe);
  const res = await apiClient.get(`/events?${params}`);
  return res.data.data as PaginatedResult<EventSummary>;
}

export async function fetchEvent(id: number): Promise<EventFull> {
  const res = await apiClient.get(`/events/${id}`);
  return res.data.data as EventFull;
}

export async function createEvent(input: EventInput): Promise<EventFull> {
  const res = await apiClient.post('/events', input);
  return res.data.data as EventFull;
}

export async function updateEvent(id: number, input: Partial<EventInput>, scope?: string): Promise<EventFull> {
  const params = scope ? `?scope=${scope}` : '';
  const res = await apiClient.put(`/events/${id}${params}`, input);
  return res.data.data as EventFull;
}

export async function deleteEvent(id: number): Promise<void> {
  await apiClient.delete(`/events/${id}`);
}

export async function fetchRegistrations(
  eventId: number,
  opts: { page?: number; limit?: number; status?: string; search?: string } = {},
): Promise<PaginatedResult<Registration>> {
  const params = new URLSearchParams();
  if (opts.page) params.set('page', String(opts.page));
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.status) params.set('status', opts.status);
  if (opts.search) params.set('search', opts.search);
  const res = await apiClient.get(`/events/${eventId}/registrations?${params}`);
  return res.data.data as PaginatedResult<Registration>;
}

export async function patchRegistration(
  eventId: number,
  regId: number,
  action: 'approve' | 'cancel' | 'check-in',
): Promise<Registration> {
  const res = await apiClient.patch(`/events/${eventId}/registrations/${regId}`, { action });
  return res.data.data as Registration;
}

export function exportRegistrationsUrl(eventId: number): string {
  const base = (apiClient.defaults.baseURL ?? '').replace(/\/$/, '');
  return `${base}/events/${eventId}/registrations/export`;
}
