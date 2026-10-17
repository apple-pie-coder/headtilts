import { useSearchParams } from 'react-router-dom';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { PermalinkPage } from './PermalinkPage';
import { PostsArchive } from './PostsArchive';
import { FrontPage } from '../components/FrontPage';
import { PageDetail } from './PageDetail';

export function HomePage() {
  const [searchParams] = useSearchParams();
  const { front_page_display, front_page_slug } = useSiteSettings();

  // "Plain" permalink structure (/?p=123) routes through the resolver
  if (searchParams.get('p')) {
    return <PermalinkPage />;
  }

  // Search results keep the classic list/grid + pagination
  if (searchParams.get('search')) {
    return <PostsArchive title="Latest" />;
  }

  // Admin configured a static page as the front page
  if (front_page_display === 'page' && front_page_slug) {
    return <PageDetail slug={front_page_slug} />;
  }

  // Built in Admin → Front page.
  return <FrontPage />;
}
