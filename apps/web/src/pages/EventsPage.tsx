import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Breadcrumb } from '../components/Breadcrumb';
import { useLayout } from '../context/LayoutContext';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { applySeo, resetSeo } from '../utils/seo';
import { resolveMediaUrl } from '../services/api';
import { fetchEvents, eventIcalUrl } from '../services/events';
import { EventSummary } from '../types';
import './EventsPage.css';

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
  const { site_title } = useSiteSettings();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [timeframe, setTimeframe] = useState<'upcoming' | 'past'>('upcoming');
  const [type, setType]     = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const limit = 12;

  useEffect(() => {
    setShowSidebar(false);
    return () => setShowSidebar(true);
  }, [setShowSidebar]);

  useEffect(() => {
    applySeo({
      title: `Events — ${site_title}`,
      description: 'Browse upcoming and past events.',
      ogType: 'website',
    });
    return () => resetSeo(site_title);
  }, [site_title]);

  useEffect(() => { load(); }, [page, timeframe, type]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await fetchEvents({ page, limit, timeframe, type: type || undefined });
      setEvents(data.items);
      setTotal(data.pagination.total);
    } catch {
      setError('Failed to load events');
    } finally {
      setLoading(false);
    }
  }

  const pages = Math.ceil(total / limit);

  return (
    <div className="events-list-page">
      <Breadcrumb crumbs={[{ label: 'Home', href: '/' }, { label: 'Events' }]} />

      <div className="events-list-header">
        <h1 className="events-list-title">Events</h1>
        <p className="events-list-subtitle">Browse upcoming events and register your spot.</p>
      </div>

      <div className="events-list-controls">
        <div className="events-list-tabs">
          <button
            className={`events-list-tab${timeframe === 'upcoming' ? ' active' : ''}`}
            onClick={() => { setTimeframe('upcoming'); setPage(1); }}
          >Upcoming</button>
          <button
            className={`events-list-tab${timeframe === 'past' ? ' active' : ''}`}
            onClick={() => { setTimeframe('past'); setPage(1); }}
          >Past</button>
        </div>
        <div className="events-list-controls-right">
          <select
            className="events-list-filter"
            value={type}
            onChange={(e) => { setType(e.target.value); setPage(1); }}
          >
            <option value="">All types</option>
            <option value="in_person">In Person</option>
            <option value="online">Online</option>
            <option value="hybrid">Hybrid</option>
          </select>
          <a href={eventIcalUrl()} className="events-list-ical" title="Subscribe via iCal">
            Subscribe to Calendar
          </a>
        </div>
      </div>

      {loading && (
        <div className="events-list-loading">
          <div className="events-list-spinner" />
        </div>
      )}

      {error && <p className="events-list-empty" style={{ color: '#c0392b' }}>{error}</p>}

      {!loading && !error && events.length === 0 && (
        <p className="events-list-empty">
          No {timeframe === 'upcoming' ? 'upcoming' : 'past'} events at the moment. Check back soon.
        </p>
      )}

      {!loading && !error && events.length > 0 && (
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
                  <div className="event-card__img event-card__img--placeholder" aria-hidden>—</div>
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
                    <span className="event-card__date-day">{formatDate(ev.startAt, ev.timezone)}</span>
                    <span className="event-card__date-time">{formatTime(ev.startAt, ev.timezone)}</span>
                    {location && <span className="event-card__location">{location}</span>}
                    {price && <span className="event-card__price">{price}</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="events-list-pagination">
          <button
            className="events-list-pagination-btn"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >Previous</button>
          <span className="events-list-pagination-info">Page {page} of {pages}</span>
          <button
            className="events-list-pagination-btn"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >Next</button>
        </div>
      )}
    </div>
  );
}
