import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendarDays, faLocationDot, faTicket } from '@fortawesome/free-solid-svg-icons';
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

// ── Carousel ────────────────────────────────────────────────────────────────

interface CarouselCfg {
  autoplay: boolean;
  interval: number;
  pauseOnHover: boolean;
  loop: boolean;
  showArrows: boolean;
  showDots: boolean;
  count: number;
  transition: 'slide' | 'fade';
}

function useCarouselCfg(): CarouselCfg {
  const s = useSiteSettings();
  return {
    autoplay:     s.event_carousel_autoplay     !== 'false',
    interval:     Math.max(1, Number(s.event_carousel_interval) || 5),
    pauseOnHover: s.event_carousel_pause_on_hover !== 'false',
    loop:         s.event_carousel_loop          !== 'false',
    showArrows:   s.event_carousel_show_arrows   !== 'false',
    showDots:     s.event_carousel_show_dots     !== 'false',
    count:        Math.min(10, Math.max(1, Number(s.event_carousel_count) || 5)),
    transition:   s.event_carousel_transition === 'fade' ? 'fade' : 'slide',
  };
}

function CarouselSlide({ ev }: { ev: EventSummary }) {
  const img = ev.bannerImage ?? ev.featuredImage;
  const location =
    ev.type === 'online'
      ? 'Online'
      : [ev.venueName, ev.venueCity].filter(Boolean).join(', ');
  const prices = ev.ticketTiers.filter((t) => t.price > 0).map((t) => t.price);
  const priceLabel = prices.length
    ? `from ₹${(Math.min(...prices) / 100).toLocaleString('en-IN')}`
    : ev.isRegistrationRequired
    ? 'Free'
    : '';

  return (
    <Link to={`/events/${ev.slug}`} className="efh-slide-link">
      {img ? (
        <img className="efh-slide-image" src={resolveMediaUrl(img)} alt={ev.title} />
      ) : (
        <span className="efh-slide-image efh-slide-image--placeholder" />
      )}
      <div className="efh-slide-overlay" />
      <div className="efh-slide-content">
        <span className="efh-slide-type">{TYPE_LABELS[ev.type] ?? ev.type}</span>
        <h2 className="efh-slide-title">{ev.title}</h2>
        {ev.excerpt && <p className="efh-slide-excerpt">{ev.excerpt}</p>}
        <div className="efh-slide-meta">
          <span className="efh-chip efh-chip--date">
            <FontAwesomeIcon icon={faCalendarDays} />
            {formatDate(ev.startAt, ev.timezone)} · {formatTime(ev.startAt, ev.timezone)}
          </span>
          {location && (
            <span className="efh-chip efh-chip--place">
              <FontAwesomeIcon icon={faLocationDot} />
              {location}
            </span>
          )}
          {priceLabel && (
            <span className="efh-chip efh-chip--price">
              <FontAwesomeIcon icon={faTicket} />
              {priceLabel}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function EventCarousel({ events: allEvents }: { events: EventSummary[] }) {
  const cfg = useCarouselCfg();
  const events = allEvents.slice(0, cfg.count);
  const n = events.length;

  const [current, setCurrent] = useState(0);
  const [instant, setInstant] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const paused = cfg.pauseOnHover && hovered;

  const go = useCallback(
    (idx: number) => {
      if (n <= 1) return;
      const next = cfg.loop ? ((idx % n) + n) % n : Math.max(0, Math.min(idx, n - 1));
      // For slide transition wrapping (jump > 1 step), snap without animation
      const isWrap = cfg.loop && cfg.transition === 'slide' && Math.abs(next - idx) > 1;
      if (isWrap) {
        setInstant(true);
        setCurrent(next);
        requestAnimationFrame(() => requestAnimationFrame(() => setInstant(false)));
      } else {
        setCurrent(next);
      }
      setResetKey((k) => k + 1);
    },
    [n, cfg.loop, cfg.transition],
  );

  useEffect(() => {
    if (!cfg.autoplay || paused || n <= 1) return;
    const timer = setInterval(
      () =>
        setCurrent((c) => {
          const next = c + 1;
          return next >= n ? (cfg.loop ? 0 : c) : next;
        }),
      cfg.interval * 1000,
    );
    return () => clearInterval(timer);
    // resetKey restarts the timer after manual navigation
  }, [cfg.autoplay, cfg.interval, cfg.loop, paused, n, resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!n) return null;

  const canPrev = cfg.loop || current > 0;
  const canNext = cfg.loop || current < n - 1;

  return (
    <section className="efh-hero">
      <div
        className={`efh-carousel efh-carousel--${cfg.transition}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {cfg.transition === 'slide' ? (
          <div
            className={`efh-carousel-track${instant ? ' efh-no-transition' : ''}`}
            style={{ transform: `translateX(-${current * 100}%)` }}
          >
            {events.map((ev) => (
              <div key={ev.id} className="efh-carousel-pane">
                <CarouselSlide ev={ev} />
              </div>
            ))}
          </div>
        ) : (
          <div className="efh-carousel-track">
            {events.map((ev, i) => (
              <div
                key={ev.id}
                className={`efh-carousel-pane${i === current ? ' efh-carousel-pane--active' : ''}`}
              >
                <CarouselSlide ev={ev} />
              </div>
            ))}
          </div>
        )}

        {cfg.showArrows && n > 1 && (
          <>
            <button
              className="efh-carousel-arrow efh-carousel-arrow--prev"
              onClick={() => go(current - 1)}
              disabled={!canPrev}
              aria-label="Previous event"
            >
              ‹
            </button>
            <button
              className="efh-carousel-arrow efh-carousel-arrow--next"
              onClick={() => go(current + 1)}
              disabled={!canNext}
              aria-label="Next event"
            >
              ›
            </button>
          </>
        )}

        {cfg.showDots && n > 1 && (
          <div className="efh-carousel-dots">
            {events.map((_, i) => (
              <button
                key={i}
                className={`efh-carousel-dot${i === current ? ' efh-carousel-dot--active' : ''}`}
                onClick={() => go(i)}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const { setShowSidebar } = useLayout();
  const settings = useSiteSettings();
  const { site_title } = settings;
  const carouselCount = Math.min(10, Math.max(1, Number(settings.event_carousel_count) || 5));

  const [featured, setFeatured]         = useState<EventSummary[]>([]);
  const [featuredLoaded, setFeaturedLoaded] = useState(false);
  const [events, setEvents]             = useState<EventSummary[]>([]);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);
  const [timeframe, setTimeframe]       = useState<'upcoming' | 'past'>('upcoming');
  const [type, setType]                 = useState('');
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
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

  useEffect(() => {
    fetchEvents({ featured: true, timeframe: 'upcoming', limit: 10 })
      .then((res) => setFeatured(res.items))
      .catch(() => setFeatured([]))
      .finally(() => setFeaturedLoaded(true));
  }, []);

  // Derive the IDs shown in the carousel — these get excluded from the list below.
  // Only relevant for upcoming; past events are never in the featured carousel.
  const carouselIds = timeframe === 'upcoming'
    ? featured.slice(0, carouselCount).map((e) => e.id)
    : [];
  const carouselIdsKey = carouselIds.join(',');

  useEffect(() => {
    if (!featuredLoaded) return;
    load();
  }, [page, timeframe, type, carouselIdsKey, featuredLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await fetchEvents({
        page, limit, timeframe,
        type: type || undefined,
        excludeIds: carouselIds.length ? carouselIds : undefined,
      });
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
    <>
      <Breadcrumb crumbs={[{ label: 'Home', href: '/' }, { label: 'Events' }]} />

      <EventCarousel events={featured} />

      <div className="events-list-page">
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
              const location =
                ev.type === 'online'
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
    </>
  );
}
