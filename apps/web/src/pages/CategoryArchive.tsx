import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { PostCard } from '../components/PostCard';
import { fetchPosts } from '../services/posts';
import { fetchCategories } from '../services/taxonomy';
import { useLayout } from '../context/LayoutContext';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { applySeo, resetSeo } from '../utils/seo';
import { Category, Pagination, PostSummary } from '../types';

const PAGE_SIZE = 10;

export function CategoryArchivePage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') || 1);

  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { setShowSidebar } = useLayout();
  const { site_title } = useSiteSettings();

  useEffect(() => {
    const name = category?.name || slug || 'Category';
    applySeo({
      title: `${name} — ${site_title}`,
      description: category?.description || `Browse posts filed under the ${name} category.`,
      ogType: 'website',
    });
    return () => resetSeo(site_title);
  }, [category, slug, site_title]);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    Promise.all([
      fetchPosts({ page, limit: PAGE_SIZE, category: slug }),
      fetchCategories(),
    ])
      .then(([result, cats]) => {
        setPosts(result.items);
        setPagination(result.pagination);
        const cat = cats.find((c) => c.slug === slug) ?? null;
        setCategory(cat);
        setShowSidebar(Boolean(cat?.showSidebar));
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));

    return () => setShowSidebar(false);
  }, [slug, page, setShowSidebar]);

  return (
    <div>
      <div className="page-hero">
        <p className="archive-label">Category</p>
        <h1 className="page-title">{category?.name || slug}</h1>
        {category?.description && <p className="archive-description">{category.description}</p>}
      </div>

      {error && <div className="alert-error">{error}</div>}
      {loading ? (
        <div className="loading-msg">Loading…</div>
      ) : posts.length === 0 ? (
        <div className="empty-msg">No posts in this category.</div>
      ) : (
        <div className="post-grid">
          {posts.map((post) => <PostCard key={post.id} post={post} />)}
        </div>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="pagination">
          {page > 1 && (
            <button className="page-btn" onClick={() => setSearchParams({ page: String(page - 1) })}><FontAwesomeIcon icon={faArrowLeft} /> Previous</button>
          )}
          <span className="page-info">Page {page} of {pagination.pages}</span>
          {page < pagination.pages && (
            <button className="page-btn" onClick={() => setSearchParams({ page: String(page + 1) })}>Next <FontAwesomeIcon icon={faArrowRight} /></button>
          )}
        </div>
      )}
    </div>
  );
}
