import { useEffect, useState } from 'react';
import { Booking, cancelRegistration, fetchBooking } from '../services/events';

const STATUS: Record<Booking['status'], string> = {
  confirmed: 'Confirmed',
  pending: 'Waiting for approval',
  waitlisted: 'On the waitlist',
  cancelled: 'Cancelled',
};

/**
 * "Your booking", opened from the link in a registration email
 * (/events/<slug>?ticket=<code>): shows the booking and lets the person cancel.
 */
export function BookingPanel({ ticketCode, eventSlug }: { ticketCode: string; eventSlug: string }) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [justCancelled, setJustCancelled] = useState(false);

  useEffect(() => {
    fetchBooking(ticketCode)
      .then((b) => (b.event.slug === eventSlug ? setBooking(b) : setError('That booking is for a different event.')))
      .catch(() => setError('We couldn’t find that booking. Check the link in your email.'));
  }, [ticketCode, eventSlug]);

  async function cancel() {
    setBusy(true);
    setError('');
    try {
      setBooking(await cancelRegistration(ticketCode));
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
          <dl className="booking-panel__facts">
            <div><dt>Name</dt><dd>{booking.name}</dd></div>
            <div><dt>{booking.quantity === 1 ? 'Ticket' : 'Tickets'}</dt><dd>{booking.quantity}</dd></div>
            <div><dt>Status</dt><dd><span className={`booking-panel__status booking-panel__status--${booking.status}`}>{STATUS[booking.status]}</span></dd></div>
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
