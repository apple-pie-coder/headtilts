import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPostSeries, SeriesInfo } from '../services/posts';

export function SeriesNav({ slug }: { slug: string }) {
  const [series, setSeries] = useState<SeriesInfo | null>(null);

  useEffect(() => {
    fetchPostSeries(slug).then(setSeries).catch(() => {});
  }, [slug]);

  if (!series) return null;

  return (
    <div className="series-nav">
      <p className="series-nav-label">Part {series.currentPart} of {series.totalParts} in</p>
      <p className="series-nav-title">{series.name}</p>
      <div className="series-nav-links">
        {series.prev && (
          <Link to={`/${series.prev.slug}`} className="series-nav-btn">
            ← {series.prev.title}
          </Link>
        )}
        {series.next && (
          <Link to={`/${series.next.slug}`} className="series-nav-btn">
            {series.next.title} →
          </Link>
        )}
      </div>
      <p className="series-nav-progress">
        {series.currentPart} / {series.totalParts} parts
      </p>
    </div>
  );
}
