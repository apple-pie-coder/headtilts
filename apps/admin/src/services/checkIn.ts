import type { TicketVerdict } from '@headtilts/shared';
import { apiClient } from './api';

// The door scanner's calls (apps/api/src/routes/checkIn.routes.ts).

export interface DoorEvent {
  id: number;
  title: string;
  startAt: string;
  endAt: string;
  timezone: string;
  venueName: string | null;
  venueCity: string | null;
  liveTicketQr: boolean;
  /** Within 12 hours of the event, when door staff can scan. */
  open?: boolean;
}

export interface DoorTicket {
  id: number;
  name: string;
  tier: string | null;
  quantity: number;
  checkedInCount: number;
  status: string;
  paymentStatus: string;
  firstInAt: string | null;
  /** One-way hash of the ticket code (manifest only). */
  hash?: string;
  /** Checks live QR codes (manifest only, live-ticket events). */
  liveKey?: string;
}

export interface DoorStats { expected: number; checkedIn: number }

export interface Manifest {
  event: DoorEvent;
  tickets: DoorTicket[];
  stats: DoorStats;
  cursor: number;
  canSupervise: boolean;
  serverTime: number;
}

export interface Changes {
  tickets: DoorTicket[];
  stats: DoorStats;
  cursor: number;
  serverTime: number;
}

export interface Previous { by: string | null; device: string | null; at: string; count: number }

export interface DoorResult {
  verdict: TicketVerdict;
  ticket: DoorTicket | null;
  admitted: number;
  previous: Previous | null;
  otherEvent?: string;
  logId: number;
}

export interface SearchHit extends DoorTicket { email: string; verdict: TicketVerdict }

export interface CheckInLogEntry {
  id: number;
  registrationId: number | null;
  staffName: string | null;
  device: string | null;
  action: 'admit' | 'undo' | 'denied';
  count: number;
  verdict: TicketVerdict | null;
  source: 'scan' | 'manual' | 'offline';
  override: boolean;
  reason: string | null;
  scannedAt: string;
  createdAt: string;
  registration: { name: string; quantity: number } | null;
}

/** Each phone has a name ("Main gate") that goes in the log with every scan. */
function deviceHeaders(device: string) {
  return device ? { headers: { 'X-Door-Device': encodeURIComponent(device) } } : {};
}

export async function fetchDoorEvents(): Promise<DoorEvent[]> {
  return (await apiClient.get('/events/check-in/events')).data.data;
}

export async function fetchManifest(eventId: number, device: string): Promise<Manifest> {
  return (await apiClient.get(`/events/${eventId}/check-in/manifest`, deviceHeaders(device))).data.data;
}

export async function fetchChanges(eventId: number, since: number, device: string): Promise<Changes> {
  return (await apiClient.get(`/events/${eventId}/check-in/changes?since=${since}`, { ...deviceHeaders(device), timeout: 8000 })).data.data;
}

export async function postScan(
  eventId: number,
  body: { payload: string; count?: number; scannedAt?: number; offline?: boolean },
  device: string,
): Promise<DoorResult> {
  return (await apiClient.post(`/events/${eventId}/check-in/scan`, body, { ...deviceHeaders(device), timeout: 8000 })).data.data;
}

export async function postAdmit(
  eventId: number,
  body: { registrationId: number; count?: number; override?: boolean; reason?: string },
  device: string,
): Promise<DoorResult> {
  return (await apiClient.post(`/events/${eventId}/check-in/admit`, body, deviceHeaders(device))).data.data;
}

export async function postUndo(
  eventId: number,
  body: { registrationId: number; count: number },
  device: string,
): Promise<{ ticket: DoorTicket; stats: DoorStats }> {
  return (await apiClient.post(`/events/${eventId}/check-in/undo`, body, deviceHeaders(device))).data.data;
}

export async function searchTickets(eventId: number, q: string, device: string): Promise<SearchHit[]> {
  return (await apiClient.get(`/events/${eventId}/check-in/search?q=${encodeURIComponent(q)}`, deviceHeaders(device))).data.data;
}

export async function fetchCheckInLog(eventId: number, page = 1, limit = 50): Promise<{
  items: CheckInLogEntry[]; total: number; page: number; limit: number; stats: DoorStats;
}> {
  return (await apiClient.get(`/events/${eventId}/check-in/log?page=${page}&limit=${limit}`)).data.data;
}
