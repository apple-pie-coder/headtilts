import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { SiteSettingsProvider } from './context/SiteSettingsContext';
import { LayoutProvider } from './context/LayoutContext';
import { SiteLayout } from './components/SiteLayout';
import { HomePage } from './pages/Home';
import { PostDetailPage } from './pages/PostDetail';
import { PageDetailPage } from './pages/PageDetail';
import { CategoryArchivePage } from './pages/CategoryArchive';
import { TagArchivePage } from './pages/TagArchive';
import { PermalinkPage } from './pages/PermalinkPage';
import { PreviewPage } from './pages/PreviewPage';
import { DateArchivePage } from './pages/DateArchive';
import { AuthorPage } from './pages/AuthorPage';
import PollPage from './pages/PollPage';
import PollsListPage from './pages/PollsListPage';

export default function App() {
  return (
    <ThemeProvider>
    <SiteSettingsProvider>
    <LayoutProvider>
    <Router>
      <SiteLayout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/posts/:slug" element={<PostDetailPage />} />
          <Route path="/pages/:slug" element={<PageDetailPage />} />
          <Route path="/categories/:slug" element={<CategoryArchivePage />} />
          <Route path="/tags/:slug" element={<TagArchivePage />} />
          <Route path="/preview/:id" element={<PreviewPage />} />
          <Route path="/date/:year" element={<DateArchivePage />} />
          <Route path="/date/:year/:month" element={<DateArchivePage />} />
          <Route path="/date/:year/:month/:day" element={<DateArchivePage />} />
          <Route path="/authors/:username" element={<AuthorPage />} />
          <Route path="/polls" element={<PollsListPage />} />
          <Route path="/polls/:slug" element={<PollPage />} />
          {/* Catch-all: resolves permalink-structure URLs to posts, else 404 */}
          <Route path="*" element={<PermalinkPage />} />
        </Routes>
      </SiteLayout>
    </Router>
    </LayoutProvider>
    </SiteSettingsProvider>
    </ThemeProvider>
  );
}
