import { useState } from 'react';
import { PollWidget } from './PollWidget';
import './PollCarousel.css';

interface Props {
  slugs: string[];
  title?: string | null;
}

export function PollCarousel({ slugs, title }: Props) {
  const [index, setIndex] = useState(0);
  const total = slugs.length;

  if (total === 0) return null;
  if (total === 1) {
    return (
      <div className="widget">
        {title && <h3 className="widget-title">{title}</h3>}
        <PollWidget slug={slugs[0]} />
      </div>
    );
  }

  return (
    <div className="widget poll-carousel">
      {title && <h3 className="widget-title">{title}</h3>}

      <div className="poll-carousel-track">
        {slugs.map((slug, i) => (
          <div
            key={slug}
            className={`poll-carousel-slide ${i === index ? 'poll-carousel-slide--active' : ''}`}
            aria-hidden={i !== index}
          >
            <PollWidget slug={slug} />
          </div>
        ))}
      </div>

      <div className="poll-carousel-controls">
        <button
          className="poll-carousel-btn"
          onClick={() => setIndex((i) => (i - 1 + total) % total)}
          aria-label="Previous poll"
        >
          ‹
        </button>

        <div className="poll-carousel-dots">
          {slugs.map((_, i) => (
            <button
              key={i}
              className={`poll-carousel-dot ${i === index ? 'poll-carousel-dot--active' : ''}`}
              onClick={() => setIndex(i)}
              aria-label={`Go to poll ${i + 1}`}
            />
          ))}
        </div>

        <button
          className="poll-carousel-btn"
          onClick={() => setIndex((i) => (i + 1) % total)}
          aria-label="Next poll"
        >
          ›
        </button>
      </div>
    </div>
  );
}
