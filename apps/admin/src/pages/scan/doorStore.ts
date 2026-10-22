import {
  TicketVerdict, checkLiveScan, parseTicketScan, ticketCodeHash, ticketVerdict,
} from '@headtilts/shared';
import type { Changes, DoorEvent, DoorStats, DoorTicket, Manifest } from '../../services/checkIn';

/**
 * What a door phone knows: the event's tickets (hashed codes only), scans
 * waiting to reach the server, and the server's clock. It judges a scan on
 * its own in a few milliseconds, so the result is on screen before the
 * network answers, and scanning keeps going if the venue Wi-Fi drops.
 * The server still has the final say on every admission.
 *
 * Kept in localStorage per event, so a reload or a dead battery mid-queue
 * doesn't lose the ticket list or the scans not yet sent.
 */

export interface QueuedScan {
  key: string;            // for de-duplicating retries
  payload: string;
  count: number;
  scannedAt: number;      // server clock
  ticketId: number | null;
  name: string | null;
}

/** An offline admission the server later refused: someone may have got in on a copy. */
export interface Conflict {
  key: string;
  name: string | null;
  verdict: TicketVerdict;
  scannedAt: number;
  detail: string;
}

export interface Judgement {
  verdict: TicketVerdict;
  ticket: DoorTicket | null;
  /** People to let in (admit only). */
  count: number;
  /** The phone can't tell (e.g. a ticket booked after the list was loaded): wait for the server. */
  unsure: boolean;
}

interface Saved {
  event: DoorEvent;
  tickets: DoorTicket[];
  stats: DoorStats;
  cursor: number;
  canSupervise: boolean;
  clockOffset: number;
  loadedAt: number;
  queue: QueuedScan[];
  conflicts: Conflict[];
}

const storageKey = (eventId: number) => `door:${eventId}`;

export class DoorStore {
  event: DoorEvent | null = null;
  stats: DoorStats = { expected: 0, checkedIn: 0 };
  cursor = 0;
  canSupervise = false;
  /** serverTime − Date.now(), so live codes are judged on the server's clock. */
  clockOffset = 0;
  loadedAt = 0;
  queue: QueuedScan[] = [];
  conflicts: Conflict[] = [];
  private tickets = new Map<number, DoorTicket>();
  private byHash = new Map<string, number>();

  constructor(readonly eventId: number) {}

  /** Restores the list and queue saved on this phone, if any. */
  restore(): boolean {
    try {
      const raw = localStorage.getItem(storageKey(this.eventId));
      if (!raw) return false;
      const s = JSON.parse(raw) as Saved;
      this.event = s.event;
      this.stats = s.stats;
      this.cursor = s.cursor;
      this.canSupervise = s.canSupervise;
      this.clockOffset = s.clockOffset;
      this.loadedAt = s.loadedAt;
      this.queue = s.queue ?? [];
      this.conflicts = s.conflicts ?? [];
      this.setTickets(s.tickets);
      return true;
    } catch {
      return false;
    }
  }

  save() {
    if (!this.event) return;
    const s: Saved = {
      event: this.event, tickets: [...this.tickets.values()], stats: this.stats, cursor: this.cursor,
      canSupervise: this.canSupervise, clockOffset: this.clockOffset, loadedAt: this.loadedAt,
      queue: this.queue, conflicts: this.conflicts,
    };
    try {
      localStorage.setItem(storageKey(this.eventId), JSON.stringify(s));
    } catch {
      // Storage full or blocked: the phone still works, it just won't survive a reload.
    }
  }

  get ready() { return this.event !== null; }
  get ticketCount() { return this.tickets.size; }
  now() { return Date.now() + this.clockOffset; }

  private setTickets(list: DoorTicket[]) {
    this.tickets.clear();
    this.byHash.clear();
    for (const t of list) this.putTicket(t);
  }

  private putTicket(t: DoorTicket) {
    const old = this.tickets.get(t.id);
    const merged = { ...old, ...t };
    // Admissions still waiting to reach the server count as in, on this phone.
    merged.checkedInCount = Math.min(merged.quantity, t.checkedInCount + this.pendingFor(t.id));
    this.tickets.set(t.id, merged);
    if (merged.hash) this.byHash.set(merged.hash, t.id);
  }

  private pendingFor(ticketId: number) {
    return this.queue.filter((q) => q.ticketId === ticketId).reduce((n, q) => n + q.count, 0);
  }

  /** Server totals, plus admissions on this phone the server hasn't heard about yet. */
  private withPending(stats: DoorStats): DoorStats {
    return { ...stats, checkedIn: stats.checkedIn + this.queue.reduce((n, q) => n + q.count, 0) };
  }

  applyManifest(m: Manifest, requestedAt: number) {
    this.event = m.event;
    this.stats = this.withPending(m.stats);
    this.cursor = m.cursor;
    this.canSupervise = m.canSupervise;
    // Half the round trip is the best guess at how stale serverTime is on arrival.
    const arrived = Date.now();
    this.clockOffset = m.serverTime + (arrived - requestedAt) / 2 - arrived;
    this.loadedAt = arrived;
    this.setTickets(m.tickets);
    this.save();
  }

  applyChanges(c: Changes) {
    for (const t of c.tickets) this.putTicket(t);
    this.stats = this.withPending(c.stats);
    this.cursor = Math.max(this.cursor, c.cursor);
    this.save();
  }

  /** The server's view of one ticket, straight after it judged a scan. */
  applyTicket(t: DoorTicket | null) {
    if (t) this.putTicket(t);
    this.save();
  }

  setStats(stats: DoorStats) {
    this.stats = this.withPending(stats);
    this.save();
  }

  ticket(id: number) { return this.tickets.get(id) ?? null; }

  /** A ticket's verdict on its booking alone (for the manual lookup). */
  judgeTicket(id: number): TicketVerdict {
    const t = this.tickets.get(id);
    return t ? ticketVerdict(t) : 'not_found';
  }

  /** Offline name lookup, for when the network is down. */
  searchByName(q: string): DoorTicket[] {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    return [...this.tickets.values()]
      .filter((t) => t.name.toLowerCase().includes(term) && t.status !== 'unconfirmed')
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 20);
  }

  /** Judges a scan from what the phone knows, without the network. */
  judge(payload: string): Judgement {
    const scan = parseTicketScan(payload);
    const none = (verdict: TicketVerdict, unsure = false): Judgement => ({ verdict, ticket: null, count: 0, unsure });
    let ticket: DoorTicket | null = null;

    if (scan.kind === 'static') {
      const id = this.byHash.get(ticketCodeHash(scan.code));
      ticket = id === undefined ? null : this.tickets.get(id) ?? null;
      // Not on this phone's list: another event's ticket, a brand-new booking, or a fake.
      if (!ticket) return none('not_found', true);
      if (this.event?.liveTicketQr) return { verdict: 'live_required', ticket, count: 0, unsure: false };
    } else if (scan.kind === 'live') {
      ticket = this.tickets.get(scan.registrationId) ?? null;
      if (!ticket) return none('invalid', true);
      if (!ticket.liveKey) return { verdict: 'admit', ticket, count: 0, unsure: true };
      const check = checkLiveScan(ticket.liveKey, scan, this.now());
      if (check !== 'ok') return { verdict: check, ticket, count: 0, unsure: false };
    } else {
      return none('invalid');
    }

    const verdict = ticketVerdict(ticket);
    return { verdict, ticket, count: verdict === 'admit' ? ticket.quantity - ticket.checkedInCount : 0, unsure: false };
  }

  /** Counts people in on this phone straight away, before the server confirms. */
  admitLocally(ticketId: number, count: number) {
    const t = this.tickets.get(ticketId);
    if (!t) return;
    t.checkedInCount = Math.min(t.quantity, t.checkedInCount + count);
    if (!t.firstInAt) t.firstInAt = new Date(this.now()).toISOString();
    this.stats = { ...this.stats, checkedIn: this.stats.checkedIn + count };
    this.save();
  }

  undoLocally(ticketId: number, count: number) {
    const t = this.tickets.get(ticketId);
    if (!t) return;
    t.checkedInCount = Math.max(0, t.checkedInCount - count);
    this.stats = { ...this.stats, checkedIn: Math.max(0, this.stats.checkedIn - count) };
    this.save();
  }

  enqueue(item: Omit<QueuedScan, 'key'>) {
    this.queue.push({ ...item, key: `${item.scannedAt}-${Math.random().toString(36).slice(2, 8)}` });
    this.save();
  }

  dequeue(key: string) {
    this.queue = this.queue.filter((q) => q.key !== key);
    this.save();
  }

  addConflict(c: Conflict) {
    this.conflicts = [c, ...this.conflicts].slice(0, 50);
    this.save();
  }

  clearConflicts() {
    this.conflicts = [];
    this.save();
  }
}

/** Drops ticket lists for events long over, so names don't linger on door phones. */
export function purgeOldDoorData(maxAgeMs = 12 * 60 * 60 * 1000) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key?.startsWith('door:') || key === 'door:device') continue;
      try {
        const s = JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<Saved>;
        const ended = s.event ? new Date(s.event.endAt).getTime() : 0;
        if (!s.queue?.length && Date.now() - ended > maxAgeMs) localStorage.removeItem(key);
      } catch {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // localStorage unavailable: nothing was stored either.
  }
}

const DEVICE_KEY = 'door:device';

export function loadDeviceName(): string {
  try { return localStorage.getItem(DEVICE_KEY) ?? ''; } catch { return ''; }
}

export function saveDeviceName(name: string) {
  try { localStorage.setItem(DEVICE_KEY, name); } catch { /* not remembered, asked again next time */ }
}
