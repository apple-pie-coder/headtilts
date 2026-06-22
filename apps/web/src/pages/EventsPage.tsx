import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Breadcrumb } from '../components/Breadcrumb';
import { useLayout } from '../context/LayoutContext';
import { resolveMediaUrl } from '../services/api';
import { fetchEvents, eventIcalUrl } from '../services/events';
import { EventSummary } from '../types';

const TYPE_LABELS: Record<string, string> = {
  in_person: 'In Person', online: 'Online', hybrid: 'Hybrid',
};

function formatDate(iso: string, tz?: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: tz,
  });
}

function formatTime(iso: string, tz?: string) {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', timeZone: tz,
  });
}

function seatsLeft(ev: EventSummary): string | null {
  if (!ev.maxAttendees || !ev.showAttendeesCount) return null;
  const taken = ev._count.registrations;
  const left = ev.maxAttendees - taken;
  if (left <= 0) return 'Sold out';
  if (left <= 10) return `${left} seats left`;
  return null;
}

function minPrice(ev: EventSummary): string {
  const prices = ev.ticketTiers.filter((t) => t.price > 0).map((t) => t.price);
  if (!prices.length) return ev.isRegistrationRequired ? 'Free' : '';
  const min = Math.min(...prices);
  return `₹${(min / 100).toLocaleString('en-IN')}`;
}

export default function EventsPage() {
  const { setShowSidebar } = useLayout();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [timeframe, setTimeframe] = useState<'upcoming' | 'past'>('upcoming');
  const [type, setType]     = useState('');
  const [loading, setLoading] = useState(true);
  const limit = 12;

  useEffect(() => { setShowSidebar(false); }, []);
  useEffect(() => { load(); }, [page, timeframe, type]);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchEvents({ page, limit, timeframe, type: type || undefined });
      setEvents(data.items);
      setTotal(data.pagination.total);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  const pages = Math.ceil(total / limit);

  return (
    <>
      <Breadcrumb crumbs={[{ label: 'Home', href: '/' }, { label: 'Events' }]} />

      <div className="events-page">
        <header className="events-page__header">
          <h1 className="events-page__title">Events</h1>
          <a
            href={eventIcalUrl()}
            className="events-page__ical-btn"
            title="Subscribe to iCal feed"
          >
            📅 Subscribe to Calendar
          </a>
        </header>

        <div className="events-page__filters">
          <div className="events-page__tabs">
            <button
              className={`events-page__tab${timeframe === 'upcoming' ? ' active' : ''}`}
              onClick={() => { setTimeframe('upcoming'); setPage(1); }}
            >Upcoming</button>
            <button
              className={`events-page__tab${timeframe === 'past' ? ' active' : ''}`}
              onClick={() => { setTimeframe('past'); setPage(1); }}
            >Past</button>
          </div>
          <select
            className="events-page__type-filter"
            value={type}
            onChange={(e) => { setType(e.target.value); setPage(1); }}
          >
            <option value="">All types</option>
            <option value="in_person">In Person</option>
            <option value="online">Online</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>

        {loading ? (
          <p className="events-page__loading">Loading events…</p>
        ) : events.length === 0 ? (
          <p className="events-page__empty">No {timeframe === 'upcoming' ? 'upcoming' : 'past'} events.</p>
        ) : (
          <div className="events-grid">
            {events.map((ev) => {
              const seats = seatsLeft(ev);
              const price = minPrice(ev);
              const location = ev.type === 'online'
                ? 'Online'
                : [ev.venueName, ev.venueCity].filter(Boolean).join(', ') || '';
              return (
                <Link key={ev.id} to={`/events/${ev.slug}`} className="event-card">
                  {ev.bannerImage || ev.featuredImage ? (
                    <img
                      className="event-card__img"
                      src={resolveMediaUrl(ev.bannerImage ?? ev.featuredImage!)}
                      alt={ev.title}
                      loading="lazy"
                    />
                  ) : (
                    <div className="event-card__img event-card__img--placeholder">🗓️</div>
                  )}
                  <div className="event-card__body">
                    <div className="event-card__meta">
                      <span className={`event-card__type event-card__type--${ev.type}`}>
                        {TYPE_LABELS[ev.type] ?? ev.type}
                      </span>
                      {seats && <span className="event-card__seats">{seats}</span>}
                    </div>
                    <h2 className="event-card__title">{ev.title}</h2>
                    {ev.excerpt && <p className="event-card__excerpt">{ev.excerpt}</p>}
                    <div className="event-card__footer">
                      <div className="event-card__date">
                        <span className="event-card__date-day">{formatDate(ev.startAt, ev.timezone)}</span>
                        <span className="event-card__date-time">{formatTime(ev.startAt, ev.timezone)}</span>
                      </div>
                      {location && <span className="event-card__location">📍 {location}</span>}
                      {price && <span className="event-card__price">{price}</span>}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {pages > 1 && (
          <div className="events-page__pagination">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>← Previous</button>
            <span>{page} / {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
          </div>
        )}
      </div>
    </>
  );
}
