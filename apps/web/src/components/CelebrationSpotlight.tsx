import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { resolveMediaUrl } from '../services/api';
import { fetchTodaysCelebrations } from '../services/celebrations';
import { Celebration } from '../types';

const ROTATE_MS = 6000;
const CONFETTI_COLORS = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff924c'];

// Pre-computed confetti pieces (stable across re-renders so they don't restart).
function useConfetti(count: number) {
  return useMemo(
    () =>
      Array.from({ length: count }, () => ({
        left: Math.random() * 100,
        delay: Math.random() * 4,
        duration: 3 + Math.random() * 3,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        size: 6 + Math.random() * 6,
        rotate: Math.random() * 360,
        round: Math.random() > 0.6,
      })),
    [count],
  );
}

function CelebrationSlide({ item }: { item: Celebration }) {
  const isBirthday = item.type === 'birthday';
  const currentYear = new Date().getFullYear();
  const age = item.year ? currentYear - item.year : null;

  const eyebrow = isBirthday ? 'Happy Birthday' : 'In Loving Memory';
  const meta = isBirthday
    ? age != null ? `Celebrating ${age} years` : ''
    : age != null ? `${age} years on` : 'Forever remembered';
  const message =
    item.message ||
    (isBirthday
      ? 'Wishing a true original a very happy birthday.'
      : 'Remembering a life — and music — that lives on.');

  return (
    <div className={`celebration-slide celebration-slide--${item.type}`}>
      <div className="celebration-photo-wrap">
        {item.photo ? (
          <img className="celebration-photo" src={resolveMediaUrl(item.photo)} alt={item.name} />
        ) : (
          <div className="celebration-photo celebration-photo--placeholder" aria-hidden>
            {isBirthday ? '🎂' : '🕯️'}
          </div>
        )}
        {!isBirthday && (
          /* SVG candle with a flickering flame */
          <svg className="celebration-candle" viewBox="0 0 40 70" aria-hidden>
            <g className="celebration-flame">
              <ellipse cx="20" cy="14" rx="6" ry="11" className="celebration-flame-outer" />
              <ellipse cx="20" cy="17" rx="3" ry="6.5" className="celebration-flame-inner" />
            </g>
            <rect x="14" y="26" width="12" height="38" rx="3" className="celebration-candle-body" />
            <rect x="19" y="20" width="2" height="7" className="celebration-wick" />
          </svg>
        )}
      </div>

      <div className="celebration-eyebrow">
        <span className="celebration-eyebrow-emoji">{isBirthday ? '🎂' : '🕯️'}</span> {eyebrow}
      </div>
      <h2 className="celebration-name">{item.name}</h2>
      {meta && <div className="celebration-meta">{meta}</div>}
      <p className="celebration-message">{message}</p>
    </div>
  );
}

export function CelebrationSpotlight() {
  const [items, setItems] = useState<Celebration[]>([]);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const dateRef = useRef<string>('');

  // Fetch today's celebrations once; gate on the per-day "seen" flag.
  useEffect(() => {
    let cancelled = false;
    fetchTodaysCelebrations()
      .then(({ date, items }) => {
        if (cancelled || items.length === 0) return;
        const key = `celebration-seen-${date}`;
        if (localStorage.getItem(key)) return;
        dateRef.current = date;
        setItems(items);
        setOpen(true);
        // Mark seen as soon as we show it → once per visitor per day.
        try { localStorage.setItem(key, '1'); } catch { /* ignore */ }
      })
      .catch(() => { /* never block the site on this */ });
    return () => { cancelled = true; };
  }, []);

  const hasMultiple = items.length > 1;

  // Auto-advance the carousel
  useEffect(() => {
    if (!open || !hasMultiple || paused) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [open, hasMultiple, paused, items.length]);

  // Keyboard: Esc to close, arrows to navigate
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
      else if (e.key === 'ArrowRight' && hasMultiple) setIndex((i) => (i + 1) % items.length);
      else if (e.key === 'ArrowLeft' && hasMultiple) setIndex((i) => (i - 1 + items.length) % items.length);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, hasMultiple, items.length]);

  const current = items[index];
  const confetti = useConfetti(48);

  if (!open || !current) return null;

  const isBirthday = current.type === 'birthday';

  return createPortal(
    <div className="celebration-overlay" role="dialog" aria-modal="true" aria-label="Today's celebration" onClick={() => setOpen(false)}>
      <div
        className={`celebration-card celebration-card--${current.type}`}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Animated layers */}
        {isBirthday ? (
          <div className="celebration-confetti-layer" aria-hidden>
            {confetti.map((c, i) => (
              <span
                key={i}
                className={`celebration-confetti${c.round ? ' celebration-confetti--round' : ''}`}
                style={{
                  left: `${c.left}%`,
                  width: `${c.size}px`,
                  height: `${c.size}px`,
                  background: c.color,
                  animationDelay: `${c.delay}s`,
                  animationDuration: `${c.duration}s`,
                  ['--rot' as string]: `${c.rotate}deg`,
                }}
              />
            ))}
          </div>
        ) : (
          <div className="celebration-ember-layer" aria-hidden>
            {Array.from({ length: 14 }).map((_, i) => (
              <span
                key={i}
                className="celebration-ember"
                style={{
                  left: `${10 + Math.random() * 80}%`,
                  animationDelay: `${Math.random() * 5}s`,
                  animationDuration: `${4 + Math.random() * 4}s`,
                }}
              />
            ))}
          </div>
        )}

        <button className="celebration-close" onClick={() => setOpen(false)} aria-label="Close">
          <FontAwesomeIcon icon={faXmark} />
        </button>

        {/* Slide */}
        <CelebrationSlide key={current.id} item={current} />

        {/* Carousel controls */}
        {hasMultiple && (
          <>
            <button
              className="celebration-nav celebration-nav--prev"
              onClick={() => setIndex((i) => (i - 1 + items.length) % items.length)}
              aria-label="Previous"
            >
              <FontAwesomeIcon icon={faChevronLeft} />
            </button>
            <button
              className="celebration-nav celebration-nav--next"
              onClick={() => setIndex((i) => (i + 1) % items.length)}
              aria-label="Next"
            >
              <FontAwesomeIcon icon={faChevronRight} />
            </button>
            <div className="celebration-dots">
              {items.map((it, i) => (
                <button
                  key={it.id}
                  className={`celebration-dot${i === index ? ' active' : ''}`}
                  onClick={() => setIndex(i)}
                  aria-label={`Show ${it.name}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
