import { useEffect, useState } from 'react';
import { Booking, cancelRegistration, fetchBooking } from '../services/events';
import { TicketQr } from './TicketQr';

const STATUS: Record<Booking['status'], string> = {
  confirmed: 'Confirmed',
  pending: 'Waiting for approval',
  waitlisted: 'On the waitlist',
  cancelled: 'Cancelled',
};

// The last copy of each ticket opened on this phone, for when the signal
// drops in the queue: the QR (live ones included) still works offline.
const savedKey = (code: string) => `ht-ticket:${code.toLowerCase()}`;

function savedBooking(code: string): { booking: Booking; clockOffset: number } | null {
  try {
    const raw = localStorage.getItem(savedKey(code));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveBooking(code: string, value: { booking: Booking; clockOffset: number }) {
  try { localStorage.setItem(savedKey(code), JSON.stringify(value)); } catch { /* not saved: fine online */ }
}

/**
 * "Your booking", opened from the link in a registration email
 * (/events/<slug>?ticket=<code>): the ticket QR for the door, the booking,
 * and cancelling.
 */
export function BookingPanel({ ticketCode, eventSlug }: { ticketCode: string; eventSlug: string }) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [justCancelled, setJustCancelled] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    fetchBooking(ticketCode)
      .then((res) => {
        if (res.booking.event.slug !== eventSlug) { setError('That booking is for a different event.'); return; }
        setBooking(res.booking);
        setClockOffset(res.clockOffset);
        setOffline(false);
        saveBooking(ticketCode, res);
      })
      .catch((e: Error) => {
        const saved = savedBooking(ticketCode);
        // Offline (fetch threw a TypeError): fall back to the copy on this phone.
        if (saved && saved.booking.event.slug === eventSlug && e instanceof TypeError) {
          setBooking(saved.booking);
          setClockOffset(saved.clockOffset);
          setOffline(true);
        } else {
          setError('We couldn’t find that booking. Check the link in your email.');
        }
      });
  }, [ticketCode, eventSlug]);

  async function cancel() {
    setBusy(true);
    setError('');
    try {
      const cancelled = await cancelRegistration(ticketCode);
      setBooking(cancelled);
      saveBooking(ticketCode, { booking: cancelled, clockOffset });
      setJustCancelled(true);
      setConfirming(false);
    } catch (e) {
      setError((e as Error).message || 'Cancelling didn’t work. Please try again or reply to your confirmation email.');
    } finally {
      setBusy(false);
    }
  }

  if (!booking && !error) return null;

  return (
    <section className="booking-panel" aria-labelledby="booking-title">
      <h2 id="booking-title" className="booking-panel__title">Your booking</h2>
      {booking && (
        <>
          {booking.ticket && <TicketQr booking={booking} clockOffset={clockOffset} />}
          {offline && <p className="booking-panel__note" role="status">No connection: this is the copy of your ticket saved on this phone.</p>}
          <dl className="booking-panel__facts">
            <div><dt>Name</dt><dd>{booking.name}</dd></div>
            <div><dt>{booking.quantity === 1 ? 'Ticket' : 'Tickets'}</dt><dd>{booking.quantity}</dd></div>
            <div><dt>Status</dt><dd><span className={`booking-panel__status booking-panel__status--${booking.status}`}>{STATUS[booking.status]}</span></dd></div>
            {booking.tier && <div><dt>Ticket type</dt><dd>{booking.tier}</dd></div>}
            <div><dt>Ticket code</dt><dd><code>{booking.ticketCode}</code></dd></div>
          </dl>
          {justCancelled && (
            <p className="booking-panel__note" role="status">Done: your registration is cancelled. We’ve emailed you a confirmation.</p>
          )}
          {booking.canCancel && !confirming && (
            <button type="button" className="booking-panel__cancel" onClick={() => setConfirming(true)}>
              {booking.status === 'waitlisted' ? 'Leave the waitlist' : 'Cancel my registration'}
            </button>
          )}
          {booking.canCancel && confirming && (
            <div className="booking-panel__confirm" role="alertdialog" aria-label="Confirm cancellation">
              <p>Cancel {booking.quantity === 1 ? 'your ticket' : `all ${booking.quantity} tickets`} for this event? This can’t be undone.</p>
              <div className="booking-panel__actions">
                <button type="button" className="booking-panel__cancel booking-panel__cancel--danger" onClick={cancel} disabled={busy}>
                  {busy ? 'Cancelling…' : 'Yes, cancel'}
                </button>
                <button type="button" className="booking-panel__keep" onClick={() => setConfirming(false)} disabled={busy}>Keep my booking</button>
              </div>
            </div>
          )}
          {!booking.canCancel && booking.status !== 'cancelled' && (
            <p className="booking-panel__note">The event has started, so this booking can no longer be cancelled online.</p>
          )}
        </>
      )}
      {error && <p className="booking-panel__error" role="alert">{error}</p>}
    </section>
  );
}
