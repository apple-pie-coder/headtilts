import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass, faXmark } from '@fortawesome/free-solid-svg-icons';
import { searchAll, SearchGrouped } from '../services/search';
import { resolveMediaUrl } from '../services/api';
import styles from './SearchBar.module.css';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function SearchBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const onSearchPage = location.pathname === '/search';

  const [open, setOpen] = useState(onSearchPage);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchGrouped | null>(null);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebounce(query, 300);

  // Open/close when route changes
  useEffect(() => {
    if (onSearchPage) setOpen(true);
  }, [onSearchPage]);

  // Focus input when opened
  useEffect(() => {
    if (open) inputRef.current?.focus();
    else {
      setQuery('');
      setResult(null);
    }
  }, [open]);

  // Fetch results
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setResult(null);
      return;
    }
    setLoading(true);
    searchAll(debouncedQuery)
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }, [debouncedQuery]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        if (!onSearchPage) setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onSearchPage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
      if (!onSearchPage) setOpen(false);
    }
    if (e.key === 'Escape') {
      if (!onSearchPage) setOpen(false);
    }
  }, [query, navigate, onSearchPage]);

  function closeAndNav(to: string) {
    if (!onSearchPage) setOpen(false);
    navigate(to);
  }

  const hasResults = result && (
    result.grouped.posts.total > 0 ||
    result.grouped.pages.total > 0 ||
    result.grouped.tags.total > 0 ||
    result.grouped.categories.total > 0 ||
    result.grouped.polls.total > 0
  );

  const showDropdown = open && !onSearchPage && (loading || hasResults || (debouncedQuery.length >= 2 && result !== null));

  return (
    <div className={styles.wrap} ref={wrapRef}>
      {!open && (
        <button
          type="button"
          className={styles.iconBtn}
          aria-label="Open search"
          onClick={() => setOpen(true)}
        >
          <FontAwesomeIcon icon={faMagnifyingGlass} />
        </button>
      )}

      {open && (
        <div className={styles.inputWrap}>
          <FontAwesomeIcon icon={faMagnifyingGlass} className={styles.searchIcon} />
          <input
            ref={inputRef}
            type="search"
            className={styles.input}
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Search"
          />
          {!onSearchPage && (
            <button
              type="button"
              className={styles.closeBtn}
              aria-label="Close search"
              onClick={() => setOpen(false)}
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          )}
        </div>
      )}

      {showDropdown && (
        <div className={styles.dropdown} role="dialog" aria-label="Search results">
          {loading && <p className={styles.loading}>Searching…</p>}

          {!loading && result && (
            <>
              {result.grouped.posts.total > 0 && (
                <div className={styles.section}>
                  <div className={styles.sectionHead}>Posts</div>
                  {result.grouped.posts.items.map((post) => (
                    <button
                      key={post.id}
                      type="button"
                      className={styles.item}
                      onClick={() => closeAndNav(`/posts/${post.slug}`)}
                    >
                      {post.featuredImage && (
                        <img
                          src={resolveMediaUrl(post.featuredImage)}
                          alt=""
                          className={styles.thumb}
                        />
                      )}
                      <span className={styles.itemContent}>
                        <span className={styles.itemTitle}>{post.title}</span>
                        {post.publishedAt && (
                          <span className={styles.itemMeta}>
                            {new Date(post.publishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {result.grouped.pages.total > 0 && (
                <div className={styles.section}>
                  <div className={styles.sectionHead}>Pages</div>
                  {result.grouped.pages.items.map((page) => (
                    <button
                      key={page.id}
                      type="button"
                      className={styles.item}
                      onClick={() => closeAndNav(`/pages/${page.slug}`)}
                    >
                      <span className={styles.itemContent}>
                        <span className={styles.itemTitle}>{page.title}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {result.grouped.tags.total > 0 && (
                <div className={styles.section}>
                  <div className={styles.sectionHead}>Tags</div>
                  <div className={styles.pillRow}>
                    {result.grouped.tags.items.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        className={styles.pill}
                        onClick={() => closeAndNav(`/tag/${tag.slug}`)}
                      >
                        {tag.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {result.grouped.categories.total > 0 && (
                <div className={styles.section}>
                  <div className={styles.sectionHead}>Categories</div>
                  <div className={styles.pillRow}>
                    {result.grouped.categories.items.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        className={styles.pill}
                        onClick={() => closeAndNav(`/category/${cat.slug}`)}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {result.grouped.polls.total > 0 && (
                <div className={styles.section}>
                  <div className={styles.sectionHead}>Polls</div>
                  {result.grouped.polls.items.map((poll) => (
                    <button
                      key={poll.id}
                      type="button"
                      className={styles.item}
                      onClick={() => closeAndNav(`/polls/${poll.slug}`)}
                    >
                      <span className={styles.itemContent}>
                        <span className={styles.itemTitle}>{poll.title}</span>
                        <span className={styles.itemMeta}>{poll.totalVotes} votes</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {hasResults && (
                <div className={styles.seeAll}>
                  <Link to={`/search?q=${encodeURIComponent(query)}`} onClick={() => setOpen(false)}>
                    See all {result.total} results for "{query}" →
                  </Link>
                </div>
              )}

              {!hasResults && debouncedQuery.length >= 2 && (
                <p className={styles.noResults}>No results for "{query}"</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
