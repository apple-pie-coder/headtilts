import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resolveMediaUrl } from '../services/api';
import {
  searchAll,
  searchType as searchTypeApi,
  SearchGrouped,
  SearchPaged,
  PostResult,
  PageResult,
  TagResult,
  CategoryResult,
  PollResult,
  SearchType,
} from '../services/search';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { applySeo, resetSeo } from '../utils/seo';
import styles from './SearchPage.module.css';

type ActiveType = SearchType;

const TYPE_LABELS: { key: SearchType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'posts', label: 'Posts' },
  { key: 'pages', label: 'Pages' },
  { key: 'tags', label: 'Tags' },
  { key: 'categories', label: 'Categories' },
  { key: 'polls', label: 'Polls' },
];

// ── Result cards ──────────────────────────────────────────────────────────────

function PostCard({ post }: { post: PostResult }) {
  return (
    <li className={styles.result}>
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
            <span className={styles.cats}>
              {post.categories.map((c) => (
                <Link key={c.category.slug} to={`/category/${c.category.slug}`} className={styles.catChip}>
                  {c.category.name}
                </Link>
              ))}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function PageCard({ page }: { page: PageResult }) {
  return (
    <li className={styles.result}>
      <div className={styles.info}>
        <Link className={styles.title} to={`/pages/${page.slug}`}>{page.title}</Link>
        {page.excerpt && <p className={styles.excerpt}>{page.excerpt}</p>}
        <div className={styles.byline}>
          <span className={styles.typeBadge}>Page</span>
        </div>
      </div>
    </li>
  );
}

function TagCard({ tag }: { tag: TagResult }) {
  return (
    <li className={styles.result}>
      <div className={styles.info}>
        <Link className={styles.title} to={`/tag/${tag.slug}`}>{tag.name}</Link>
        {tag.description && <p className={styles.excerpt}>{tag.description}</p>}
        <div className={styles.byline}>
          <span className={styles.typeBadge}>Tag</span>
          <span> · {tag.postCount} post{tag.postCount !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </li>
  );
}

function CategoryCard({ cat }: { cat: CategoryResult }) {
  return (
    <li className={styles.result}>
      <div className={styles.info}>
        <Link className={styles.title} to={`/category/${cat.slug}`}>{cat.name}</Link>
        {cat.description && <p className={styles.excerpt}>{cat.description}</p>}
        <div className={styles.byline}>
          <span className={styles.typeBadge}>Category</span>
          <span> · {cat.postCount} post{cat.postCount !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </li>
  );
}

function PollCard({ poll }: { poll: PollResult }) {
  return (
    <li className={styles.result}>
      <div className={styles.info}>
        <Link className={styles.title} to={`/polls/${poll.slug}`}>{poll.title}</Link>
        <p className={styles.excerpt}>{poll.question}</p>
        <div className={styles.byline}>
          <span className={`${styles.typeBadge} ${styles[`poll_${poll.status}`] || ''}`}>
            {poll.status.charAt(0).toUpperCase() + poll.status.slice(1)}
          </span>
          <span> · {poll.totalVotes} vote{poll.totalVotes !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </li>
  );
}

// ── Grouped section ───────────────────────────────────────────────────────────

function GroupedSection({
  label,
  total,
  children,
  onViewAll,
}: {
  label: string;
  total: number;
  children: React.ReactNode;
  onViewAll: () => void;
}) {
  if (total === 0) return null;
  return (
    <section className={styles.group}>
      <div className={styles.groupHeader}>
        <h2 className={styles.groupTitle}>{label}</h2>
        {total > 4 && (
          <button type="button" className={styles.viewAllBtn} onClick={onViewAll}>
            View all {total} →
          </button>
        )}
      </div>
      <ul className={styles.results}>{children}</ul>
    </section>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function SearchPage() {
  const { site_title } = useSiteSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') || '';
  const typeParam = searchParams.get('type') || 'all';
  const page = Math.max(1, Number(searchParams.get('page') || '1'));

  const activeType: ActiveType = ['posts', 'pages', 'tags', 'categories', 'polls'].includes(typeParam)
    ? (typeParam as ActiveType)
    : 'all';

  const [inputValue, setInputValue] = useState(q);
  const [groupedResult, setGroupedResult] = useState<SearchGrouped | null>(null);
  const [pagedResult, setPagedResult] = useState<SearchPaged | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    applySeo({
      title: q ? `Search: "${q}" — ${site_title}` : `Search — ${site_title}`,
      description: q ? `Results for "${q}".` : 'Search posts, pages, tags, categories and polls.',
      ogType: 'website',
    });
    return () => resetSeo(site_title);
  }, [q, site_title]);

  useEffect(() => {
    setInputValue(q);
    if (!q) {
      setGroupedResult(null);
      setPagedResult(null);
      return;
    }
    setLoading(true);
    if (activeType === 'all') {
      searchAll(q)
        .then((r) => { setGroupedResult(r); setPagedResult(null); })
        .catch(() => { setGroupedResult(null); setPagedResult(null); })
        .finally(() => setLoading(false));
    } else {
      searchTypeApi(q, activeType, page)
        .then((r) => { setPagedResult(r); setGroupedResult(null); })
        .catch(() => { setPagedResult(null); setGroupedResult(null); })
        .finally(() => setLoading(false));
    }
  }, [q, activeType, page]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed) setSearchParams({ q: trimmed });
    else setSearchParams({});
  }

  function switchType(type: ActiveType) {
    const next: Record<string, string> = { q };
    if (type !== 'all') next.type = type;
    setSearchParams(next);
  }

  const grouped = groupedResult?.grouped;
  const totalAll = groupedResult?.total ?? 0;

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Search</h1>

      <form className={styles.searchForm} onSubmit={handleSubmit}>
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search posts, pages, tags…"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          autoFocus
        />
        <button className={styles.searchBtn} type="submit">Search</button>
      </form>

      {q && (
        <div className={styles.tabs} role="tablist">
          {TYPE_LABELS.map(({ key, label }) => {
            let count: number | undefined;
            if (groupedResult) {
              if (key === 'all') count = totalAll;
              else count = groupedResult.grouped[key]?.total;
            }
            // Hide tabs with 0 results (except 'all' which shows the empty state)
            if (groupedResult && key !== 'all' && (count ?? 0) === 0) return null;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeType === key}
                className={`${styles.tab}${activeType === key ? ` ${styles.tabActive}` : ''}`}
                onClick={() => switchType(key)}
              >
                {label}
                {count !== undefined && count > 0 && (
                  <span className={styles.tabCount}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {loading && <p className={styles.status}>Searching…</p>}

      {/* All / grouped view */}
      {!loading && activeType === 'all' && grouped && (
        <>
          {totalAll === 0 && q && (
            <p className={styles.status}>No results for <strong>"{q}"</strong>.</p>
          )}

          {totalAll > 0 && (
            <>
              <p className={styles.meta}>
                {totalAll} result{totalAll !== 1 ? 's' : ''} for <strong>"{q}"</strong>
              </p>

              <GroupedSection label="Posts" total={grouped.posts.total} onViewAll={() => switchType('posts')}>
                {grouped.posts.items.map((p) => <PostCard key={p.id} post={p} />)}
              </GroupedSection>

              <GroupedSection label="Pages" total={grouped.pages.total} onViewAll={() => switchType('pages')}>
                {grouped.pages.items.map((p) => <PageCard key={p.id} page={p} />)}
              </GroupedSection>

              <GroupedSection label="Tags" total={grouped.tags.total} onViewAll={() => switchType('tags')}>
                {grouped.tags.items.map((t) => <TagCard key={t.id} tag={t} />)}
              </GroupedSection>

              <GroupedSection label="Categories" total={grouped.categories.total} onViewAll={() => switchType('categories')}>
                {grouped.categories.items.map((c) => <CategoryCard key={c.id} cat={c} />)}
              </GroupedSection>

              <GroupedSection label="Polls" total={grouped.polls.total} onViewAll={() => switchType('polls')}>
                {grouped.polls.items.map((p) => <PollCard key={p.id} poll={p} />)}
              </GroupedSection>
            </>
          )}
        </>
      )}

      {/* Specific type / paginated view */}
      {!loading && activeType !== 'all' && pagedResult && (
        <>
          {pagedResult.items.length === 0 && (
            <p className={styles.status}>No {activeType} results for <strong>"{q}"</strong>.</p>
          )}

          {pagedResult.items.length > 0 && (
            <>
              <p className={styles.meta}>
                {pagedResult.pagination.total} {activeType} result{pagedResult.pagination.total !== 1 ? 's' : ''} for <strong>"{q}"</strong>
              </p>

              <ul className={styles.results}>
                {activeType === 'posts' && pagedResult.items.map((item) => (
                  <PostCard key={item.id} post={item as PostResult} />
                ))}
                {activeType === 'pages' && pagedResult.items.map((item) => (
                  <PageCard key={item.id} page={item as PageResult} />
                ))}
                {activeType === 'tags' && pagedResult.items.map((item) => (
                  <TagCard key={item.id} tag={item as TagResult} />
                ))}
                {activeType === 'categories' && pagedResult.items.map((item) => (
                  <CategoryCard key={item.id} cat={item as CategoryResult} />
                ))}
                {activeType === 'polls' && pagedResult.items.map((item) => (
                  <PollCard key={item.id} poll={item as PollResult} />
                ))}
              </ul>

              {pagedResult.pagination.pages > 1 && (
                <div className={styles.pagination}>
                  <button
                    className={styles.pageBtn}
                    disabled={page <= 1}
                    onClick={() => setSearchParams({ q, type: activeType, page: String(page - 1) })}
                  >
                    Previous
                  </button>
                  <span className={styles.pageInfo}>Page {page} of {pagedResult.pagination.pages}</span>
                  <button
                    className={styles.pageBtn}
                    disabled={page >= pagedResult.pagination.pages}
                    onClick={() => setSearchParams({ q, type: activeType, page: String(page + 1) })}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
