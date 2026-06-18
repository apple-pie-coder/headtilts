import { useSearchParams } from 'react-router-dom';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { PermalinkPage } from './PermalinkPage';
import { PostsArchive } from './PostsArchive';
import { PostFeed } from '../components/PostFeed';
import { FrontPageHero } from '../components/FrontPageHero';
import { WidgetZone } from '../components/WidgetZone';
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

  return (
    <>
      <FrontPageHero />
      <WidgetZone zone="front-page-featured" className="front-page-featured" />
      <PostFeed />
    </>
  );
}
