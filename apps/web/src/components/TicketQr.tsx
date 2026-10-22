import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LIVE_QR_STEP_SECONDS, liveTicketKey, liveTicketPayload } from '@headtilts/shared';
import type { Booking } from '../services/events';
import './TicketQr.css';

/**
 * The QR code shown at the door.
 *
 * Static: the ticket code itself, the same as in the email.
 * Live: a code signed with a key derived from the ticket code, redrawn every
 * 15 seconds. The countdown bar and the ticking clock show door staff it's
 * running live, and a screenshot stops scanning within about a minute.
 */
export function TicketQr({ booking, clockOffset }: { booking: Booking; clockOffset: number }) {
  const live = booking.ticket?.live === true;
  const key = useMemo(() => (live ? liveTicketKey(booking.ticketCode) : ''), [live, booking.ticketCode]);
  const [now, setNow] = useState(() => Date.now() + clockOffset);
  const [big, setBig] = useState(false);

  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => setNow(Date.now() + clockOffset), 200);
    return () => window.clearInterval(t);
  }, [live, clockOffset]);

  const payload = live ? liveTicketPayload(booking.id, key, now) : booking.ticketCode;
  const progress = ((now / 1000) % LIVE_QR_STEP_SECONDS) / LIVE_QR_STEP_SECONDS;
  const clock = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Keep the screen on while the big ticket is up: the queue can be slow.
  useEffect(() => {
    if (!big) return;
    let lock: { release(): Promise<void> } | null = null;
    (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } })
      .wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setBig(false); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); void lock?.release(); };
  }, [big]);

  const admits = booking.quantity === 1 ? 'Admits 1' : `Admits ${booking.quantity}`;
  const inside = booking.checkedInCount > 0 ? ` · ${booking.checkedInCount} of ${booking.quantity} checked in` : '';

  return (
    <>
      <div className="ticket-qr">
        <QrCanvas text={payload} live={live} />
        {live && <LiveBar progress={progress} />}
        <p className="ticket-qr__caption">
          {live
            ? <><strong>Live ticket</strong> · {clock} · changes every {LIVE_QR_STEP_SECONDS} seconds. Screenshots won’t scan.</>
            : <>Show this at the door. Turn your screen brightness up.</>}
        </p>
        <p className="ticket-qr__admits">{[booking.tier, `${admits}${inside}`].filter(Boolean).join(' · ')}</p>
        <button type="button" className="ticket-qr__big" onClick={() => setBig(true)}>Show full screen</button>
      </div>

      {big && (
        <div className="ticket-qr-full" role="dialog" aria-modal="true" aria-label="Your ticket" onClick={() => setBig(false)}>
          <div className="ticket-qr-full__inner" onClick={(e) => e.stopPropagation()}>
            <p className="ticket-qr-full__event">{booking.event.title}</p>
            <p className="ticket-qr-full__name">{booking.name}</p>
            <QrCanvas text={payload} live={live} large />
            {live && <LiveBar progress={progress} />}
            <p className="ticket-qr-full__meta">
              {[booking.tier, admits].filter(Boolean).join(' · ')}
              {live && <> · <span className="ticket-qr-full__clock">{clock}</span></>}
            </p>
            <button type="button" className="ticket-qr-full__close" onClick={() => setBig(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}

function LiveBar({ progress }: { progress: number }) {
  return (
    <div className="ticket-qr__bar" aria-hidden>
      <span style={{ transform: `scaleX(${1 - progress})` }} />
    </div>
  );
}

function QrCanvas({ text, live, large = false }: { text: string; live: boolean; large?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    // Drawn at device resolution so the modules stay crisp on high-DPI screens.
    const css = large ? Math.min(window.innerWidth * 0.86, window.innerHeight * 0.6, 520) : 248;
    QRCode.toCanvas(ref.current, text, {
      width: Math.round(css * Math.min(window.devicePixelRatio || 1, 3)),
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    }).catch(() => {});
    // Width only: the CSS keeps it square and lets it shrink on narrow screens.
    ref.current.style.width = `${css}px`;
    ref.current.style.height = '';
  }, [text, large]);
  return (
    <div className={`ticket-qr__frame${live ? ' ticket-qr__frame--live' : ''}`}>
      <canvas ref={ref} role="img" aria-label={live ? 'Live ticket QR code' : 'Ticket QR code'} />
    </div>
  );
}
