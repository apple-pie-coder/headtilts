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
import EventsPage from './pages/EventsPage';
import EventDetailPage from './pages/EventDetailPage';
import { SearchPage } from './pages/SearchPage';
import { RedirectGate } from './components/RedirectGate';
import StatusPage from './pages/StatusPage';

export default function App() {
  return (
    <ThemeProvider>
    <Router>
      <Routes>
        {/* Fully independent — no site header/footer, no settings providers */}
        <Route path="/status" element={<StatusPage />} />

        {/* All other public routes wrapped in the full site layout */}
        <Route path="*" element={
          <SiteSettingsProvider>
          <LayoutProvider>
            <RedirectGate>
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
                <Route path="/search" element={<SearchPage />} />
                <Route path="/polls" element={<PollsListPage />} />
                <Route path="/polls/:slug" element={<PollPage />} />
                <Route path="/events" element={<EventsPage />} />
                <Route path="/events/:slug" element={<EventDetailPage />} />
                <Route path="*" element={<PermalinkPage />} />
              </Routes>
            </SiteLayout>
            </RedirectGate>
          </LayoutProvider>
          </SiteSettingsProvider>
        } />
      </Routes>
    </Router>
    </ThemeProvider>
  );
}
