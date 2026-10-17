import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * "Back to top" for long pages. It only appears once the reader has scrolled
 * about a screen down on a page that is more than two screens tall, and its
 * ring fills as they read. Clicking scrolls up (instantly if they prefer
 * reduced motion) and moves keyboard focus to the top of the page.
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const { pathname } = useLocation();

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      const long = doc.scrollHeight > window.innerHeight * 2;
      setVisible(long && window.scrollY > window.innerHeight * 0.9);
      setProgress(scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pathname]);

  function toTop() {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    // Keyboard and screen-reader users should land at the top too.
    const target = document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('main') ?? document.body;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }

  const r = 20;
  const circ = 2 * Math.PI * r;
  return (
    <button
      type="button"
      className={`back-to-top${visible ? ' back-to-top--shown' : ''}`}
      onClick={toTop}
      aria-label="Back to top"
      title="Back to top"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
    >
      <svg viewBox="0 0 48 48" className="back-to-top-ring" aria-hidden="true">
        <circle cx="24" cy="24" r={r} className="back-to-top-track" />
        <circle cx="24" cy="24" r={r} className="back-to-top-fill" strokeDasharray={circ} strokeDashoffset={circ * (1 - progress)} />
      </svg>
      <svg viewBox="0 0 24 24" className="back-to-top-arrow" aria-hidden="true">
        <path d="M12 5l-7 7m7-7l7 7M12 5v14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
