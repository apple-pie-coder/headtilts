import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Breadcrumb } from '../components/Breadcrumb';
import { useLayout } from '../context/LayoutContext';
import { resolveMediaUrl } from '../services/api';
import { fetchEvent, registerForEvent, verifyEventPayment, eventIcalUrl, googleCalendarUrl } from '../services/events';
import { EventFull, EventCustomField, EventRegistrationResult } from '../types';
import './EventDetailPage.css';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const TYPE_LABELS: Record<string, string> = {
  in_person: 'In Person', online: 'Online', hybrid: 'Hybrid',
};
const AGENDA_ICONS: Record<string, string> = {
  keynote: '🎤', session: '📢', break: '☕', networking: '🤝',
};

function formatDateTime(iso: string, tz?: string) {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: tz,
  });
}

function formatTime(iso: string, tz?: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: tz });
}

function seatsLeft(ev: EventFull): { count: number; isSoldOut: boolean } | null {
  if (!ev.maxAttendees || !ev.showAttendeesCount) return null;
  const taken = ev._count.registrations;
  return { count: ev.maxAttendees - taken, isSoldOut: taken >= ev.maxAttendees };
}

function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay'));
    document.head.appendChild(script);
  });
}

type RegStep = 'form' | 'paying' | 'done';

export default function EventDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { setShowSidebar } = useLayout();
  const [event, setEvent]   = useState<EventFull | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [regStep, setRegStep]       = useState<RegStep>('form');
  const [tierId, setTierId]         = useState<number | null>(null);
  const [qty, setQty]               = useState(1);
  const [name, setName]             = useState('');
  const [email, setEmail]           = useState('');
  const [phone, setPhone]           = useState('');
  const [customData, setCustomData] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [regError, setRegError]     = useState<string | null>(null);
  const [ticketCode, setTicketCode] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShowSidebar(false);
    if (slug) load(slug);
  }, [slug]);

  async function load(s: string) {
    try {
      const ev = await fetchEvent(s);
      setEvent(ev);
      if (ev.ticketTiers.length > 0) setTierId(ev.ticketTiers[0].id);
    } catch {
      setError('Event not found');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    if (!event) return;
    if (!name.trim() || !email.trim()) { setRegError('Name and email are required'); return; }
    setRegError(null);
    setSubmitting(true);

    try {
      const result: EventRegistrationResult = await registerForEvent(event.slug, {
        name: name.trim(), email: email.trim(),
        phone: phone.trim() || undefined,
        ticketTierId: tierId ?? undefined,
        quantity: qty,
        customData: Object.keys(customData).length ? customData : undefined,
      });

      if (!result.requiresPayment) {
        setTicketCode(result.registration.ticketCode);
        setRegStep('done');
        return;
      }

      setRegStep('paying');
      await loadRazorpay();

      const options = {
        key: result.keyId,
        amount: result.amount,
        currency: result.currency ?? 'INR',
        name: event.title,
        description: `Registration for ${event.title}`,
        order_id: result.orderId,
        prefill: { name: name.trim(), email: email.trim(), contact: phone.trim() },
        theme: { color: '#0071e3' },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await verifyEventPayment(event.slug, {
              registrationId: result.registration.id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setTicketCode(result.registration.ticketCode);
            setRegStep('done');
          } catch {
            setRegError('Payment verified but confirmation failed. Please contact support with your ticket code.');
            setRegStep('form');
          }
        },
        modal: {
          ondismiss: () => { setRegStep('form'); setRegError('Payment cancelled.'); },
        },
      };
      new window.Razorpay(options).open();
    } catch (e) {
      setRegError((e as Error).message ?? 'Registration failed. Please try again.');
      setRegStep('form');
    } finally {
      setSubmitting(false);
    }
  }

  function renderCustomField(field: EventCustomField) {
    const value = customData[field.label] ?? '';
    const set = (v: unknown) => setCustomData((prev) => ({ ...prev, [field.label]: v }));
    if (field.fieldType === 'checkbox') {
      return (
        <label key={field.id} className="event-reg__check-label">
          <input type="checkbox" checked={!!value} onChange={(e) => set(e.target.checked)} />
          {field.label}{field.required && ' *'}
        </label>
      );
    }
    if (field.fieldType === 'select') {
      return (
        <div key={field.id} className="event-reg__field">
          <label className="event-reg__label">{field.label}{field.required && ' *'}</label>
          <select className="event-reg__input" value={String(value)} onChange={(e) => set(e.target.value)}>
            <option value="">— Select —</option>
            {(field.options ?? []).map((opt) => <option key={opt}>{opt}</option>)}
          </select>
        </div>
      );
    }
    if (field.fieldType === 'textarea') {
      return (
        <div key={field.id} className="event-reg__field">
          <label className="event-reg__label">{field.label}{field.required && ' *'}</label>
          <textarea className="event-reg__input event-reg__textarea" rows={3} value={String(value)} onChange={(e) => set(e.target.value)} />
        </div>
      );
    }
    return (
      <div key={field.id} className="event-reg__field">
        <label className="event-reg__label">{field.label}{field.required && ' *'}</label>
        <input className="event-reg__input" type="text" value={String(value)} onChange={(e) => set(e.target.value)} />
      </div>
    );
  }

  if (loading) return (
    <div className="event-detail-loading">
      <div className="event-detail-spinner" />
    </div>
  );

  if (error || !event) return (
    <div className="event-detail-error">{error ?? 'Event not found'}</div>
  );

  const seats = seatsLeft(event);
  const isClosed = event.status === 'cancelled' || event.status === 'postponed';
  const now = new Date();
  const isDeadlinePassed = event.registrationDeadline ? now > new Date(event.registrationDeadline) : false;
  const isSoldOut = seats?.isSoldOut ?? false;
  const canRegister = event.isRegistrationRequired && !isClosed && !isDeadlinePassed && !isSoldOut;

  const selectedTier = event.ticketTiers.find((t) => t.id === tierId) ?? null;
  const isFree = !selectedTier || selectedTier.price === 0;

  const location = event.type === 'online'
    ? null
    : [event.venueName, event.venueAddress, event.venueCity, event.venueState, event.venueCountry].filter(Boolean).join(', ');

  return (
    <>
      <Breadcrumb crumbs={[{ label: 'Home', href: '/' }, { label: 'Events', href: '/events' }, { label: event.title }]} />

      {event.bannerImage && (
        <div className="event-detail-banner">
          <img src={resolveMediaUrl(event.bannerImage)} alt={event.title} className="event-detail-banner__img" />
        </div>
      )}

      <div className="event-detail-page">
        <div className="event-detail-body">
          <div className="event-detail-main">

            <div className="event-detail-quickinfo">
              <span className={`event-detail-type event-detail-type--${event.type}`}>
                {TYPE_LABELS[event.type] ?? event.type}
              </span>
              {isClosed && (
                <span className="event-detail-status-badge">
                  {event.status === 'cancelled' ? 'Cancelled' : 'Postponed'}
                </span>
              )}
              {seats && !seats.isSoldOut && seats.count <= 20 && (
                <span className="event-detail-seats-warn">{seats.count} seats left</span>
              )}
              {isSoldOut && <span className="event-detail-sold-out">Sold Out</span>}
            </div>

            <h1 className="event-detail-title">{event.title}</h1>

            <div className="event-detail-metarow">
              <div className="event-detail-meta-item">
                <strong>{formatDateTime(event.startAt, event.timezone)}</strong>
                {' – '}{formatDateTime(event.endAt, event.timezone)}
              </div>
              {location && <div className="event-detail-meta-item">{location}</div>}
              {(event.type === 'online' || event.type === 'hybrid') && (
                <div className="event-detail-meta-item">Online event</div>
              )}
              {seats && event.showAttendeesCount && (
                <div className="event-detail-meta-item">
                  {event._count.registrations} attending
                  {event.maxAttendees ? ` / ${event.maxAttendees} capacity` : ''}
                </div>
              )}
            </div>

            {event.description && (
              <div
                className="event-detail-description rich-content"
                dangerouslySetInnerHTML={{ __html: event.description }}
              />
            )}

            {event.speakers.length > 0 && (
              <section className="event-detail-section">
                <h2 className="event-detail-section-title">Speakers</h2>
                <div className="event-speakers">
                  {event.speakers.map((sp) => (
                    <div key={sp.id} className="event-speaker">
                      {sp.photo ? (
                        <img src={resolveMediaUrl(sp.photo)} alt={sp.name} className="event-speaker__photo" />
                      ) : (
                        <div className="event-speaker__photo event-speaker__photo--placeholder" aria-hidden>S</div>
                      )}
                      <div>
                        <strong className="event-speaker__name">{sp.name}</strong>
                        {sp.designation && (
                          <span className="event-speaker__role">
                            {sp.designation}{sp.company ? ` · ${sp.company}` : ''}
                          </span>
                        )}
                        {sp.bio && <p className="event-speaker__bio">{sp.bio}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {event.agendaItems.length > 0 && (
              <section className="event-detail-section">
                <h2 className="event-detail-section-title">Schedule</h2>
                <div className="event-agenda">
                  {event.agendaItems.map((item) => (
                    <div key={item.id} className={`event-agenda__item event-agenda__item--${item.type}`}>
                      <div className="event-agenda__time">
                        {formatTime(item.startsAt, event.timezone)} – {formatTime(item.endsAt, event.timezone)}
                      </div>
                      <div className="event-agenda__body">
                        <span className="event-agenda__icon">{AGENDA_ICONS[item.type] ?? '·'}</span>
                        <div>
                          <strong className="event-agenda__title">{item.title}</strong>
                          {item.description && <p className="event-agenda__desc">{item.description}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {event.venueMapEmbed && (
              <section className="event-detail-section">
                <h2 className="event-detail-section-title">Location</h2>
                <div className="event-detail-map" dangerouslySetInnerHTML={{ __html: event.venueMapEmbed }} />
              </section>
            )}

            {event.streamUrl && event.streamPlatform === 'youtube' && (
              <section className="event-detail-section">
                <h2 className="event-detail-section-title">Livestream</h2>
                <div className="event-detail-stream">
                  <iframe
                    src={event.streamUrl.replace('watch?v=', 'embed/')}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="event-detail-stream__frame"
                    title="Livestream"
                  />
                </div>
              </section>
            )}

            <div className="event-detail-calendar-links">
              <a href={googleCalendarUrl(event)} target="_blank" rel="noreferrer" className="event-detail-cal-btn">
                Google Calendar
              </a>
              <a href={eventIcalUrl(event.slug)} download className="event-detail-cal-btn">
                Download .ics
              </a>
            </div>

            {event.showAttendeesNames && event.attendees && event.attendees.length > 0 && (
              <section className="event-detail-section">
                <h2 className="event-detail-section-title">Attendees</h2>
                <div className="event-attendees">
                  {event.attendees.map((a, i) => (
                    <span key={i} className="event-attendee">{a.name}</span>
                  ))}
                </div>
              </section>
            )}
          </div>

          {event.isRegistrationRequired && (
            <aside className="event-reg" ref={formRef}>
              {regStep === 'done' ? (
                <div className="event-reg__success">
                  <div className="event-reg__success-icon">🎉</div>
                  <h3 className="event-reg__success-title">You're registered!</h3>
                  <p className="event-reg__success-body">
                    A confirmation email with your ticket has been sent.
                  </p>
                  {ticketCode && (
                    <p className="event-reg__ticket-code">
                      Ticket: <code>{ticketCode}</code>
                    </p>
                  )}
                  <div className="event-detail-calendar-links" style={{ justifyContent: 'center', marginTop: '1rem' }}>
                    <a href={googleCalendarUrl(event)} target="_blank" rel="noreferrer" className="event-detail-cal-btn">
                      Google Calendar
                    </a>
                    <a href={eventIcalUrl(event.slug)} download className="event-detail-cal-btn">.ics</a>
                  </div>
                </div>
              ) : (
                <>
                  <h3 className="event-reg__title">
                    {isClosed ? (event.status === 'cancelled' ? 'Event Cancelled' : 'Event Postponed') :
                     isSoldOut ? 'Sold Out' :
                     isDeadlinePassed ? 'Registration Closed' :
                     'Register'}
                  </h3>

                  {!canRegister ? (
                    <p className="event-reg__closed-msg">
                      {isClosed ? 'This event is no longer taking registrations.' :
                       isSoldOut ? 'This event is fully booked.' :
                       'Registration for this event has closed.'}
                    </p>
                  ) : (
                    <>
                      {event.ticketTiers.length > 0 && (
                        <div className="event-reg__field">
                          <label className="event-reg__label">Ticket type</label>
                          <div className="event-reg__tiers">
                            {event.ticketTiers.map((tier) => {
                              const isTierSoldOut = tier.quantity !== null && tier.soldCount >= tier.quantity;
                              return (
                                <label
                                  key={tier.id}
                                  className={`event-reg__tier${tierId === tier.id ? ' selected' : ''}${isTierSoldOut ? ' sold-out' : ''}`}
                                >
                                  <input
                                    type="radio" name="tier" value={tier.id}
                                    checked={tierId === tier.id}
                                    onChange={() => !isTierSoldOut && setTierId(tier.id)}
                                    disabled={isTierSoldOut}
                                  />
                                  <span className="event-reg__tier-name">{tier.name}</span>
                                  <span className="event-reg__tier-price">
                                    {tier.price === 0 ? 'Free' : `₹${(tier.price / 100).toLocaleString('en-IN')}`}
                                    {isTierSoldOut && ' (Sold Out)'}
                                  </span>
                                  {tier.description && <span className="event-reg__tier-desc">{tier.description}</span>}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {selectedTier && selectedTier.perOrderMax > 1 && (
                        <div className="event-reg__field">
                          <label className="event-reg__label">Quantity</label>
                          <select className="event-reg__input" value={qty} onChange={(e) => setQty(Number(e.target.value))}>
                            {Array.from(
                              { length: selectedTier.perOrderMax - selectedTier.perOrderMin + 1 },
                              (_, i) => i + selectedTier.perOrderMin,
                            ).map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                      )}

                      <div className="event-reg__field">
                        <label className="event-reg__label">Full Name *</label>
                        <input className="event-reg__input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                      </div>
                      <div className="event-reg__field">
                        <label className="event-reg__label">Email *</label>
                        <input className="event-reg__input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                      </div>
                      <div className="event-reg__field">
                        <label className="event-reg__label">Phone (optional)</label>
                        <input className="event-reg__input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" />
                      </div>

                      {event.customFields.map(renderCustomField)}

                      {regError && <p className="event-reg__error">{regError}</p>}

                      <button
                        className="event-reg__submit"
                        onClick={handleRegister}
                        disabled={submitting || regStep === 'paying'}
                      >
                        {submitting || regStep === 'paying' ? 'Processing…' :
                         isFree ? 'Register Free' :
                         `Pay ₹${(((selectedTier?.price ?? 0) * qty) / 100).toLocaleString('en-IN')}`}
                      </button>

                      {event.requireApproval && (
                        <p className="event-reg__note">Registration is subject to approval by the organiser.</p>
                      )}
                    </>
                  )}
                </>
              )}
            </aside>
          )}
        </div>
      </div>
    </>
  );
}
