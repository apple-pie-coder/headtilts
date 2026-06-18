import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resolveMediaUrl } from '../services/api';
import { searchPosts, SearchResult } from '../services/posts';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { applySeo, resetSeo } from '../utils/seo';
import styles from './SearchPage.module.css';

export function SearchPage() {
  const { site_title } = useSiteSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') || '';
  const page = Math.max(1, Number(searchParams.get('page') || '1'));

  const [inputValue, setInputValue] = useState(q);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    applySeo({
      title: q ? `Search: "${q}" — ${site_title}` : `Search — ${site_title}`,
      description: q ? `Results for "${q}".` : 'Search posts.',
      ogType: 'website',
    });
    return () => resetSeo(site_title);
  }, [q, site_title]);

  useEffect(() => {
    if (!q) { setResult(null); return; }
    setLoading(true);
    searchPosts(q, page)
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }, [q, page]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed) setSearchParams({ q: trimmed });
    else setSearchParams({});
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Search</h1>

      <form className={styles.searchForm} onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          className={styles.searchInput}
          type="search"
          placeholder="Search posts…"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          autoFocus
        />
        <button className={styles.searchBtn} type="submit">Search</button>
      </form>

      {loading && <p className={styles.status}>Searching…</p>}

      {!loading && q && result && result.items.length === 0 && (
        <p className={styles.status}>No results for <strong>"{q}"</strong>.</p>
      )}

      {!loading && result && result.items.length > 0 && (
        <>
          <p className={styles.meta}>
            {result.pagination.total} result{result.pagination.total !== 1 ? 's' : ''} for <strong>"{q}"</strong>
          </p>

          <ul className={styles.results}>
            {result.items.map((post) => (
              <li key={post.id} className={styles.result}>
                {post.featuredImage && (
                  <Link to={`/posts/${post.slug}`} className={styles.thumb}>
                    <img src={resolveMediaUrl(post.featuredImage)} alt={post.title} loading="lazy" />
                  </Link>
                )}
                <div className={styles.info}>
                  <Link className={styles.title} to={`/posts/${post.slug}`}>{post.title}</Link>
                  {post.excerpt && <p className={styles.excerpt}>{post.excerpt}</p>}
                  <div className={styles.byline}>
                    {post.publishedAt && (
                      <time dateTime={post.publishedAt}>
                        {new Date(post.publishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                      </time>
                    )}
                    {post.author && (
                      <span> · {[post.author.firstName, post.author.lastName].filter(Boolean).join(' ') || post.author.username}</span>
                    )}
                    {post.categories.length > 0 && (
                      <span> · {post.categories.map((c) => c.category.name).join(', ')}</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {result.pagination.pages > 1 && (
            <div className={styles.pagination}>
              <button
                className={styles.pageBtn}
                disabled={page <= 1}
                onClick={() => setSearchParams({ q, page: String(page - 1) })}
              >
                Previous
              </button>
              <span className={styles.pageInfo}>Page {page} of {result.pagination.pages}</span>
              <button
                className={styles.pageBtn}
                disabled={page >= result.pagination.pages}
                onClick={() => setSearchParams({ q, page: String(page + 1) })}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
