import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft, faBolt, faCircleCheck, faCircleExclamation, faCircleXmark, faMagnifyingGlass, faMinus,
  faRotate, faTriangleExclamation, faWifi, faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { TicketVerdict, VERDICT_TONE, VerdictTone } from '@headtilts/shared';
import {
  DoorResult, DoorTicket, Previous, fetchChanges, fetchManifest, postAdmit, postScan, postUndo, searchTickets,
} from '../../services/checkIn';
import { DoorStore, loadDeviceName, saveDeviceName } from './doorStore';
import { useQrCamera } from './useQrCamera';
import { signal, unlockSound } from './feedback';
import styles from './Scanner.module.css';

/**
 * The door scanner: point the phone at a ticket, get green / amber / red.
 *
 * The phone judges each scan itself from the ticket list it holds (see
 * doorStore.ts), shows the result at once, and tells the server, which has the
 * final say. Without a connection, scans queue up and sync when it's back.
 */

const VERDICT_TEXT: Record<TicketVerdict, { title: string; hint: string }> = {
  admit: { title: 'Admit', hint: '' },
  already: { title: 'Already checked in', hint: 'Everyone on this ticket is already in. Send them to the help desk.' },
  flagged: { title: 'Send to the help desk', hint: 'The payment for this ticket is disputed or partly refunded.' },
  cancelled: { title: 'Cancelled ticket', hint: 'This booking was cancelled.' },
  refunded: { title: 'Refunded ticket', hint: 'This ticket was refunded, so it’s no longer valid.' },
  unpaid: { title: 'Not paid', hint: 'The payment for this ticket never went through.' },
  awaiting_approval: { title: 'Not approved yet', hint: 'The organisers haven’t approved this registration.' },
  waitlisted: { title: 'On the waitlist', hint: 'This person is on the waitlist, not booked in.' },
  unconfirmed: { title: 'Email not confirmed', hint: 'This sign-up was never confirmed, so it has no ticket.' },
  not_found: { title: 'Ticket not found', hint: 'This isn’t a ticket we issued. It may be fake.' },
  wrong_event: { title: 'Wrong event', hint: 'This ticket is for a different event.' },
  expired: { title: 'Code expired', hint: 'Probably a screenshot, or a phone clock that’s wrong. Ask them to open the live ticket.' },
  invalid: { title: 'Not a ticket', hint: 'This QR code isn’t one of our tickets.' },
  live_required: { title: 'Live ticket needed', hint: 'This event uses live tickets. Ask them to open the ticket link from their email.' },
};

const TONE_ICON = { green: faCircleCheck, amber: faTriangleExclamation, red: faCircleXmark };

interface Shown {
  verdict: TicketVerdict;
  ticket: DoorTicket | null;
  admitted: number;
  previous: Previous | null;
  otherEvent?: string;
  /** Waiting for the server (the phone couldn't judge it alone). */
  checking: boolean;
  /** The server disagreed with the phone, e.g. another door got there first. */
  correction?: string;
  offline: boolean;
}

const timeOf = (iso: string | number) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function errMessage(err: unknown, fallback: string) {
  return (err as AxiosError<{ error?: { message?: string } }>).response?.data?.error?.message ?? fallback;
}

/** True when the request never got an answer (as opposed to the server saying no). */
const isNetworkError = (err: unknown) => !(err as AxiosError).response;

function usedText(p: Previous | null) {
  if (!p) return '';
  const where = [p.device, p.by].filter(Boolean).join(', ');
  return `Used at ${timeOf(p.at)}${where ? ` · ${where}` : ''}`;
}

export default function ScannerPage() {
  const eventId = Number(useParams().id);
  const storeRef = useRef<DoorStore | null>(null);
  if (!storeRef.current || storeRef.current.eventId !== eventId) storeRef.current = new DoorStore(eventId);
  const store = storeRef.current;

  const [, setVersion] = useState(0);
  const rerender = useCallback(() => setVersion((v) => v + 1), []);
  const [device, setDevice] = useState(loadDeviceName);
  const [deviceDraft, setDeviceDraft] = useState(loadDeviceName);
  const [started, setStarted] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [online, setOnline] = useState(true);
  const [shown, setShown] = useState<Shown | null>(null);
  const [lastAdmit, setLastAdmit] = useState<{ ticketId: number; count: number; name: string; queuedKey?: string } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notice, setNotice] = useState('');

  const busyRef = useRef(false);
  const lastTextRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  /** The ticket this phone just let in: still in front of the camera, it isn't "already used". */
  const justAdmitted = useRef<{ ticketId: number; at: number }>({ ticketId: 0, at: 0 });
  const dismissTimer = useRef<number>();
  const shownRef = useRef<Shown | null>(null);
  shownRef.current = shown;
  const pendingUndo = useRef(0);
  const undoRef = useRef<(ticketId: number, count: number) => Promise<void>>(async () => {});

  // ── Ticket list: restore what this phone saved, then load fresh ────────────
  const loadManifest = useCallback(async () => {
    const requestedAt = Date.now();
    try {
      const m = await fetchManifest(eventId, device);
      store.applyManifest(m, requestedAt);
      setLoadError('');
      setOnline(true);
    } catch (err) {
      if (isNetworkError(err)) {
        setOnline(false);
        if (!store.ready) setLoadError('No connection, and this phone has no saved ticket list for this event yet.');
      } else {
        setLoadError(errMessage(err, 'Couldn’t load the ticket list.'));
      }
    }
    rerender();
  }, [eventId, device, store, rerender]);

  useEffect(() => {
    store.restore();
    rerender();
    void loadManifest();
  }, [store, loadManifest, rerender]);

  // ── Keep in step with other doors, and send queued scans ───────────────────
  const flushing = useRef(false);
  const flushQueue = useCallback(async () => {
    if (flushing.current || store.queue.length === 0) return;
    flushing.current = true;
    try {
      for (const item of [...store.queue]) {
        let res: DoorResult;
        try {
          res = await postScan(eventId, { payload: item.payload, count: item.count, scannedAt: item.scannedAt, offline: true }, device);
        } catch (err) {
          if (isNetworkError(err)) { setOnline(false); return; }
          // The server refused outright (e.g. scanner closed): drop it and say so.
          store.dequeue(item.key);
          store.addConflict({ key: item.key, name: item.name, verdict: 'invalid', scannedAt: item.scannedAt, detail: errMessage(err, 'Rejected by the server') });
          continue;
        }
        store.dequeue(item.key);
        store.applyTicket(res.ticket);
        if (res.verdict !== 'admit') {
          store.addConflict({
            key: item.key, name: res.ticket?.name ?? item.name, verdict: res.verdict, scannedAt: item.scannedAt,
            detail: res.previous ? usedText(res.previous) : VERDICT_TEXT[res.verdict].title,
          });
          signal('red');
        }
        setOnline(true);
      }
    } finally {
      flushing.current = false;
      rerender();
    }
  }, [eventId, device, store, rerender]);

  useEffect(() => {
    if (!store.ready) return;
    const poll = window.setInterval(async () => {
      await flushQueue();
      try {
        store.applyChanges(await fetchChanges(eventId, store.cursor, device));
        setOnline(true);
      } catch (err) {
        if (isNetworkError(err)) setOnline(false);
      }
      rerender();
    }, 4000);
    const refresh = window.setInterval(() => { void loadManifest(); }, 120_000);
    const back = () => { void flushQueue(); };
    window.addEventListener('online', back);
    return () => { clearInterval(poll); clearInterval(refresh); window.removeEventListener('online', back); };
  }, [store, store.ready, eventId, device, flushQueue, loadManifest, rerender]);

  // ── Keep the screen awake while scanning ───────────────────────────────────
  useEffect(() => {
    if (!started) return;
    let lock: { release(): Promise<void> } | null = null;
    const request = async () => {
      try {
        lock = await (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } })
          .wakeLock?.request('screen') ?? null;
      } catch { /* not supported or refused: the screen may sleep */ }
    };
    void request();
    const onVisible = () => { if (document.visibilityState === 'visible') void request(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); void lock?.release(); };
  }, [started]);

  // ── Showing a result ───────────────────────────────────────────────────────
  const closeResult = useCallback(async () => {
    window.clearTimeout(dismissTimer.current);
    const current = shownRef.current;
    const undoCount = pendingUndo.current;
    pendingUndo.current = 0;
    setShown(null);
    if (current?.ticket && undoCount > 0) await undoRef.current(current.ticket.id, undoCount);
  }, []);

  const show = useCallback((s: Shown, tone: VerdictTone, beep = true) => {
    window.clearTimeout(dismissTimer.current);
    setShown(s);
    if (beep) signal(tone);
    // Green clears itself so the queue keeps moving; amber and red wait for a tap.
    if (tone === 'green' && !s.checking) {
      const group = (s.ticket?.quantity ?? 1) > 1;
      dismissTimer.current = window.setTimeout(() => { void closeResult(); }, group ? 2600 : 1200);
    }
  }, [closeResult]);

  const fromServer = (res: DoorResult, offline = false): Shown => ({
    verdict: res.verdict, ticket: res.ticket, admitted: res.admitted, previous: res.previous,
    otherEvent: res.otherEvent, checking: false, offline,
  });

  // ── A scan ─────────────────────────────────────────────────────────────────
  const handleScan = useCallback(async (text: string) => {
    const now = Date.now();
    if (busyRef.current) return;
    if (text === lastTextRef.current.text && now - lastTextRef.current.at < 3000) return;
    const current = shownRef.current;
    // Amber and red stay until someone taps; a green result gives way to the next ticket.
    if (current && (current.checking || VERDICT_TONE[current.verdict] !== 'green')) return;
    lastTextRef.current = { text, at: now };
    if (current) await closeResult();
    busyRef.current = true;

    try {
      const local = store.judge(text);
      const scannedAt = store.now();
      if (local.verdict === 'already' && local.ticket?.id === justAdmitted.current.ticketId
        && now - justAdmitted.current.at < 15_000) return;

      if (local.unsure) {
        // The phone doesn't know this ticket: only the server can say.
        show({ verdict: 'admit', ticket: null, admitted: 0, previous: null, checking: true, offline: false }, 'green', false);
        try {
          const res = await postScan(eventId, { payload: text }, device);
          store.applyTicket(res.ticket);
          setOnline(true);
          show(fromServer(res), VERDICT_TONE[res.verdict]);
          if (res.verdict === 'admit' && res.ticket) {
            justAdmitted.current = { ticketId: res.ticket.id, at: Date.now() };
            setLastAdmit({ ticketId: res.ticket.id, count: res.admitted, name: res.ticket.name });
          }
        } catch (err) {
          if (isNetworkError(err)) setOnline(false);
          show({ ...local, admitted: 0, previous: null, checking: false, offline: isNetworkError(err) }, VERDICT_TONE[local.verdict]);
        }
        return;
      }

      // The phone's own verdict, on screen straight away.
      const ticket = local.ticket;
      if (local.verdict === 'admit' && ticket) {
        justAdmitted.current = { ticketId: ticket.id, at: now };
        store.admitLocally(ticket.id, local.count);
        setLastAdmit({ ticketId: ticket.id, count: local.count, name: ticket.name });
      }
      show({
        verdict: local.verdict, ticket: ticket ? store.ticket(ticket.id) : null, admitted: local.count,
        previous: null, checking: false, offline: !online,
      }, VERDICT_TONE[local.verdict]);
      rerender();

      if (local.verdict !== 'admit' || !ticket) {
        // Let the server log the refused scan too, without waiting on it.
        postScan(eventId, { payload: text }, device).catch(() => {});
        return;
      }

      try {
        const res = await postScan(eventId, { payload: text, count: local.count }, device);
        setOnline(true);
        store.applyTicket(res.ticket);
        if (res.verdict !== 'admit') {
          // Another door used it a moment ago, or it changed on the server.
          const s = fromServer(res);
          s.correction = 'The server says no: another door may have just used this ticket.';
          show(s, VERDICT_TONE[res.verdict]);
          setLastAdmit(null);
        } else if (res.admitted !== local.count && shownRef.current?.ticket?.id === ticket.id) {
          setShown((cur) => (cur ? { ...cur, admitted: res.admitted, ticket: res.ticket } : cur));
        }
      } catch (err) {
        if (isNetworkError(err)) {
          setOnline(false);
          store.enqueue({ payload: text, count: local.count, scannedAt, ticketId: ticket.id, name: ticket.name });
          setLastAdmit({ ticketId: ticket.id, count: local.count, name: ticket.name, queuedKey: store.queue[store.queue.length - 1]?.key });
        } else {
          store.undoLocally(ticket.id, local.count);
          setNotice(errMessage(err, 'The server refused that scan.'));
          setShown(null);
        }
      }
    } finally {
      busyRef.current = false;
      rerender();
    }
  }, [store, eventId, device, online, show, closeResult, rerender]);

  const camera = useQrCamera(started && !searchOpen, (text) => { void handleScan(text); });

  // ── Undo / fewer people ────────────────────────────────────────────────────
  async function undoAdmission(ticketId: number, count: number) {
    if (count <= 0) return;
    const queued = store.queue.find((q) => q.ticketId === ticketId);
    if (queued) {
      // Never reached the server: just change or drop the queued scan.
      if (queued.count <= count) store.dequeue(queued.key);
      else queued.count -= count;
      store.undoLocally(ticketId, count);
      setLastAdmit(null);
      rerender();
      return;
    }
    try {
      const res = await postUndo(eventId, { registrationId: ticketId, count }, device);
      store.applyTicket(res.ticket);
      store.setStats(res.stats);
      setLastAdmit((cur) => (cur && cur.ticketId === ticketId && cur.count > count ? { ...cur, count: cur.count - count } : null));
      setNotice(`Undone: ${count} ${count === 1 ? 'person' : 'people'} taken off ${res.ticket.name}’s ticket.`);
    } catch (err) {
      setNotice(errMessage(err, isNetworkError(err) ? 'No connection: undo needs the server.' : 'Undo didn’t work.'));
    }
    rerender();
  }

  undoRef.current = undoAdmission;

  function fewer() {
    const s = shownRef.current;
    if (!s?.ticket || s.admitted - pendingUndo.current <= 1) return;
    pendingUndo.current += 1;
    window.clearTimeout(dismissTimer.current);
    setShown({ ...s }); // re-render with the new count; stays open until tapped
  }

  function undoAll() {
    const s = shownRef.current;
    if (!s?.ticket) return;
    pendingUndo.current = s.admitted;
    void closeResult();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const event = store.event;

  if (!started) {
    return (
      <div className={styles.setup}>
        <Link to="/admin/scan" className={styles.setupBack}><FontAwesomeIcon icon={faArrowLeft} /> Events</Link>
        <h1 className={styles.setupTitle}>{event?.title ?? 'Door scanner'}</h1>
        {event && <p className={styles.setupMeta}>{new Date(event.startAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}{event.venueName ? ` · ${event.venueName}` : ''}</p>}
        {event?.liveTicketQr && <p className={styles.setupNote}>Live tickets are on: screenshots and email QR codes won’t scan.</p>}
        {loadError && <p className={styles.setupError} role="alert">{loadError}</p>}
        <label className={styles.setupLabel} htmlFor="door-device">Name this phone</label>
        <input
          id="door-device" className={styles.setupInput} value={deviceDraft} maxLength={60}
          placeholder="e.g. Main gate" onChange={(e) => setDeviceDraft(e.target.value)}
        />
        <p className={styles.setupHint}>Goes in the log with every scan, so you can tell the doors apart.</p>
        <button
          type="button" className={styles.startButton} disabled={!store.ready}
          onClick={() => { const d = deviceDraft.trim(); saveDeviceName(d); setDevice(d); unlockSound(); setStarted(true); }}
        >
          {store.ready ? `Start scanning · ${store.ticketCount} ticket${store.ticketCount === 1 ? '' : 's'} loaded` : 'Loading tickets…'}
        </button>
      </div>
    );
  }

  const tone = shown ? (shown.checking ? null : VERDICT_TONE[shown.verdict]) : null;
  const admittedNow = shown ? shown.admitted - pendingUndo.current : 0;

  return (
    <div className={styles.scanner}>
      <video ref={camera.videoRef} className={styles.video} playsInline muted />
      <div className={styles.frame} aria-hidden />

      <header className={styles.top}>
        <Link to="/admin/scan" className={styles.iconLink} aria-label="Back to events"><FontAwesomeIcon icon={faArrowLeft} /></Link>
        <div className={styles.topText}>
          <span className={styles.topTitle}>{event?.title}</span>
          <span className={styles.topCount}><strong>{store.stats.checkedIn}</strong> / {store.stats.expected} in</span>
        </div>
        <span className={`${styles.net} ${online ? styles.netOn : styles.netOff}`} title={online ? 'Online' : 'Offline: scans are saved and sent when the connection is back'}>
          <FontAwesomeIcon icon={faWifi} />
          {store.queue.length > 0 && <span className={styles.netQueue}>{store.queue.length}</span>}
        </span>
        {camera.torchSupported && (
          <button type="button" className={`${styles.iconButton} ${camera.torchOn ? styles.iconButtonOn : ''}`} onClick={() => { void camera.toggleTorch(); }} aria-pressed={camera.torchOn} aria-label="Flashlight">
            <FontAwesomeIcon icon={faBolt} />
          </button>
        )}
        <button type="button" className={styles.iconButton} onClick={() => { void loadManifest(); }} aria-label="Reload the ticket list">
          <FontAwesomeIcon icon={faRotate} />
        </button>
      </header>

      {!online && <div className={styles.offlineBar}>Offline. Scans are judged on this phone and sent when the connection is back.</div>}
      {store.conflicts.length > 0 && (
        <button type="button" className={styles.conflictBar} onClick={() => { setNotice(store.conflicts.map((c) => `${c.name ?? 'Unknown'} (${timeOf(c.scannedAt)}): ${c.detail}`).join('\n')); store.clearConflicts(); rerender(); }}>
          <FontAwesomeIcon icon={faCircleExclamation} /> {store.conflicts.length} offline {store.conflicts.length === 1 ? 'scan was' : 'scans were'} refused by the server. Tap to see.
        </button>
      )}

      {camera.error && <div className={styles.cameraError} role="alert">{camera.error}</div>}
      {!camera.error && !camera.running && <div className={styles.cameraHint}>Starting the camera…</div>}

      <footer className={styles.bottom}>
        {notice && (
          <div className={styles.notice} role="status">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice('')} aria-label="Dismiss"><FontAwesomeIcon icon={faXmark} /></button>
          </div>
        )}
        {lastAdmit && !shown && (
          <div className={styles.lastAdmit}>
            <span>Last in: <strong>{lastAdmit.name}</strong>{lastAdmit.count > 1 ? ` (${lastAdmit.count})` : ''}</span>
            <button type="button" onClick={() => { void undoAdmission(lastAdmit.ticketId, lastAdmit.count); }}>Undo</button>
          </div>
        )}
        <button type="button" className={styles.findButton} onClick={() => setSearchOpen(true)}>
          <FontAwesomeIcon icon={faMagnifyingGlass} /> Find by name, email or code
        </button>
        {camera.engine && <span className={styles.engine}>{device || 'This phone'} · {camera.engine === 'native' ? 'built-in decoder' : 'WebAssembly decoder'}</span>}
      </footer>

      {shown && (
        <div
          className={`${styles.result} ${tone ? styles[`result_${tone}`] : styles.result_checking}`}
          role="alertdialog" aria-live="assertive" aria-label={shown.checking ? 'Checking' : VERDICT_TEXT[shown.verdict].title}
          onClick={() => { if (!shown.checking) void closeResult(); }}
        >
          {shown.checking ? (
            <div className={styles.resultBody}><div className={styles.spinner} /><p className={styles.resultTitle}>Checking…</p></div>
          ) : (
            <div className={styles.resultBody}>
              <FontAwesomeIcon icon={TONE_ICON[tone!]} className={styles.resultIcon} />
              <p className={styles.resultTitle}>
                {shown.verdict === 'admit'
                  ? (shown.ticket && shown.ticket.quantity > 1 ? `Admit ${admittedNow}` : 'Admit')
                  : VERDICT_TEXT[shown.verdict].title}
              </p>
              {shown.ticket && <p className={styles.resultName}>{shown.ticket.name}</p>}
              {shown.ticket?.tier && <p className={styles.resultTier}>{shown.ticket.tier}</p>}
              {shown.ticket && shown.ticket.quantity > 1 && (
                <p className={styles.resultGroup}>
                  Group of {shown.ticket.quantity} · {Math.max(0, shown.ticket.checkedInCount - pendingUndo.current)} of {shown.ticket.quantity} now in
                </p>
              )}
              {shown.verdict !== 'admit' && <p className={styles.resultHint}>{VERDICT_TEXT[shown.verdict].hint}</p>}
              {shown.otherEvent && <p className={styles.resultHint}>It’s for: {shown.otherEvent}</p>}
              {shown.previous && <p className={styles.resultHint}>{usedText(shown.previous)}</p>}
              {shown.verdict === 'already' && !shown.previous && shown.ticket?.firstInAt && (
                <p className={styles.resultHint}>First in at {timeOf(shown.ticket.firstInAt)}</p>
              )}
              {shown.correction && <p className={styles.resultCorrection}>{shown.correction}</p>}
              {shown.offline && <p className={styles.resultOffline}>Offline: judged on this phone, will sync.</p>}

              {shown.verdict === 'admit' && shown.ticket && (
                <div className={styles.resultActions} onClick={(e) => e.stopPropagation()}>
                  {shown.ticket.quantity > 1 && admittedNow > 1 && (
                    <button type="button" onClick={fewer}><FontAwesomeIcon icon={faMinus} /> One fewer</button>
                  )}
                  <button type="button" onClick={undoAll}>Undo</button>
                </div>
              )}
              <p className={styles.resultTap}>{tone === 'green' ? 'Next ticket scans automatically' : 'Tap to scan the next ticket'}</p>
            </div>
          )}
        </div>
      )}

      {searchOpen && (
        <FindSheet
          store={store} eventId={eventId} device={device} online={online}
          onClose={() => setSearchOpen(false)}
          onAdmitted={(res) => {
            store.applyTicket(res.ticket);
            setSearchOpen(false);
            if (res.ticket) setLastAdmit({ ticketId: res.ticket.id, count: res.admitted, name: res.ticket.name });
            show(fromServer(res), VERDICT_TONE[res.verdict]);
            rerender();
          }}
        />
      )}
    </div>
  );
}

// ─── Manual lookup ───────────────────────────────────────────────────────────

function FindSheet({ store, eventId, device, online, onClose, onAdmitted }: {
  store: DoorStore; eventId: number; device: string; online: boolean;
  onClose: () => void; onAdmitted: (res: DoorResult) => void;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<(DoorTicket & { email?: string; verdict?: TicketVerdict })[]>([]);
  const [picked, setPicked] = useState<(DoorTicket & { email?: string; verdict?: TicketVerdict }) | null>(null);
  const [count, setCount] = useState(1);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    const t = window.setTimeout(async () => {
      if (online) {
        try { setHits(await searchTickets(eventId, term, device)); return; } catch { /* fall back to this phone's list */ }
      }
      setHits(store.searchByName(term));
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, online, eventId, device, store]);

  const verdictOf = (t: DoorTicket & { verdict?: TicketVerdict }) => t.verdict ?? (store.ticket(t.id) ? store.judgeTicket(t.id) : 'invalid');

  async function admit(override: boolean) {
    if (!picked) return;
    setBusy(true);
    setError('');
    try {
      onAdmitted(await postAdmit(eventId, { registrationId: picked.id, count, override, reason: override ? reason : undefined }, device));
    } catch (err) {
      setError(errMessage(err, isNetworkError(err) ? 'No connection: checking in by name needs the server.' : 'Check-in didn’t work.'));
    } finally {
      setBusy(false);
    }
  }

  const verdict = picked ? verdictOf(picked) : null;
  const remaining = picked ? picked.quantity - picked.checkedInCount : 0;

  return (
    <div className={styles.sheetBackdrop} onClick={onClose}>
      <div className={styles.sheet} role="dialog" aria-label="Find a ticket" onClick={(e) => e.stopPropagation()}>
        <div className={styles.sheetHead}>
          <h2>{picked ? picked.name : 'Find a ticket'}</h2>
          <button type="button" onClick={picked ? () => { setPicked(null); setError(''); } : onClose} aria-label={picked ? 'Back to results' : 'Close'}>
            <FontAwesomeIcon icon={picked ? faArrowLeft : faXmark} />
          </button>
        </div>

        {!picked && (
          <>
            <input
              className={styles.sheetSearch} autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              placeholder={online ? 'Name, email, phone or ticket code' : 'Name (offline: this phone’s list)'}
            />
            <ul className={styles.hits}>
              {hits.map((h) => {
                const v = verdictOf(h);
                return (
                  <li key={h.id}>
                    <button type="button" onClick={() => { setPicked(h); setCount(Math.max(1, h.quantity - h.checkedInCount)); setReason(''); }}>
                      <span className={styles.hitMain}>
                        <strong>{h.name}</strong>
                        <span>{[h.tier, h.email].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className={`${styles.hitBadge} ${styles[`badge_${VERDICT_TONE[v]}`]}`}>
                        {v === 'admit' ? `${h.checkedInCount}/${h.quantity} in` : VERDICT_TEXT[v].title}
                      </span>
                    </button>
                  </li>
                );
              })}
              {q.trim().length >= 2 && hits.length === 0 && <li className={styles.noHits}>No tickets match.</li>}
            </ul>
          </>
        )}

        {picked && verdict && (
          <div className={styles.detail}>
            <p className={styles.detailMeta}>
              {[picked.tier, picked.email, `${picked.checkedInCount} of ${picked.quantity} in`].filter(Boolean).join(' · ')}
            </p>
            <p className={`${styles.detailVerdict} ${styles[`badge_${VERDICT_TONE[verdict]}`]}`}>
              {verdict === 'admit' ? 'Valid ticket' : VERDICT_TEXT[verdict].title}
            </p>
            {verdict !== 'admit' && <p className={styles.detailHint}>{VERDICT_TEXT[verdict].hint}</p>}

            {remaining > 0 && (verdict === 'admit' || store.canSupervise) && (
              <div className={styles.stepper}>
                <span>People coming in</span>
                <button type="button" onClick={() => setCount((c) => Math.max(1, c - 1))} aria-label="One fewer">−</button>
                <strong>{count}</strong>
                <button type="button" onClick={() => setCount((c) => Math.min(remaining, c + 1))} aria-label="One more">+</button>
              </div>
            )}

            {verdict === 'admit' && remaining > 0 && (
              <button type="button" className={styles.admitButton} disabled={busy} onClick={() => { void admit(false); }}>
                Check in {count}
              </button>
            )}
            {verdict !== 'admit' && remaining > 0 && store.canSupervise && (
              <>
                <label className={styles.reasonLabel} htmlFor="override-reason">Reason for letting them in anyway</label>
                <input id="override-reason" className={styles.sheetSearch} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Paid at the box office" />
                <button type="button" className={styles.overrideButton} disabled={busy || reason.trim().length < 3} onClick={() => { void admit(true); }}>
                  Override and check in {count}
                </button>
              </>
            )}
            {verdict !== 'admit' && !store.canSupervise && (
              <p className={styles.detailHint}>Send them to the help desk: only a supervisor can let in a ticket that isn’t valid.</p>
            )}
            {error && <p className={styles.sheetError} role="alert">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
