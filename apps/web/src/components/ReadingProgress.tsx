import { useEffect, useState, RefObject } from 'react';

export function ReadingProgress({ targetRef }: { targetRef: RefObject<HTMLElement | null> }) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const update = () => {
      const el = targetRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      if (total <= 0) { setPct(0); return; }
      setPct(Math.min(100, Math.max(0, (-rect.top / total) * 100)));
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
    return () => window.removeEventListener('scroll', update);
  }, [targetRef]);

  if (pct <= 0 || pct >= 100) return null;

  return (
    <div
      className="reading-progress"
      style={{ width: `${pct}%` }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Reading progress"
    />
  );
}
