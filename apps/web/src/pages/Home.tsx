import { useSearchParams } from 'react-router-dom';
import { PermalinkPage } from './PermalinkPage';
import { PostsArchive } from './PostsArchive';
import { PostFeed } from '../components/PostFeed';
import { FrontPageHero } from '../components/FrontPageHero';
import { WidgetZone } from '../components/WidgetZone';

export function HomePage() {
  const [searchParams] = useSearchParams();

  // "Plain" permalink structure (/?p=123) routes through the resolver
  if (searchParams.get('p')) {
    return <PermalinkPage />;
  }

  // Search results keep the classic list/grid + pagination
  if (searchParams.get('search')) {
    return <PostsArchive title="Latest" />;
  }

  return (
    <>
      <FrontPageHero />
      <WidgetZone zone="front-page-featured" className="front-page-featured" />
      <PostFeed />
    </>
  );
}
