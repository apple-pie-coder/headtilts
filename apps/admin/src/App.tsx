import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { PERMISSIONS } from '@headtilts/shared';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { NotificationProvider } from './context/NotificationContext';
import { ConfirmProvider } from './components/ConfirmDialog';
import { ToastProvider } from './components/ToastContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import LoginPage from './pages/Login';
import ForgotPasswordPage from './pages/ForgotPassword';
import ResetPasswordPage from './pages/ResetPassword';
import SetupPage from './pages/Setup';
import WizardPage from './pages/Wizard';
import ContactSubmissionsPage from './pages/ContactSubmissions';
import CommentsPage from './pages/Comments';
import DashboardPage from './pages/Dashboard';
import UsersPage from './pages/Users';
import CategoriesPage from './pages/Categories';
import TagsPage from './pages/Tags';
import CelebrationsPage from './pages/Celebrations';
import PollsPage from './pages/Polls';
import PollEditorPage from './pages/PollEditor';
import EventsPage from './pages/Events';
import EventEditorPage from './pages/EventEditor';
import EventRegistrationsPage from './pages/EventRegistrations';
import PostsPage from './pages/Posts';
import PagesPage from './pages/Pages';
import PostEditorPage from './pages/PostEditor';
import MediaPage from './pages/Media';
import SettingsPage from './pages/Settings';
import ApiKeysPage from './pages/ApiKeys';
import ApiAnalyticsPage from './pages/ApiAnalytics';
import AnalyticsPage from './pages/Analytics';
import MenusPage from './pages/Menus';
import MenuEditorPage from './pages/MenuEditor';
import RolesPage from './pages/Roles';
import ProfilePage from './pages/Profile';
import SitemapPage from './pages/Sitemap';
import RedirectsPage from './pages/Redirects';
import BackupsPage from './pages/Backups';
import WidgetsPage from './pages/Widgets';
import LogsPage from './pages/Logs';
import HealthPage from './pages/Health';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const MEDIA_URL = import.meta.env.VITE_MEDIA_URL || import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://localhost:3000';

function resolveUrl(url: string) {
  return url.startsWith('http') ? url : `${MEDIA_URL}${url}`;
}

function useFaviconFromSettings() {
  useEffect(() => {
    fetch(`${API_URL}/public/site-settings`)
      .then((r) => r.json())
      .then((json) => {
        const data = json?.data ?? {};
        const raw = data.admin_favicon || data.site_favicon;
        if (!raw) return;
        const href = resolveUrl(raw);
        let el = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (!el) {
          el = document.createElement('link');
          el.setAttribute('rel', 'icon');
          document.head.appendChild(el);
        }
        el.setAttribute('href', href);
      })
      .catch(() => {});
  }, []);
}

function App() {
  useFaviconFromSettings();
  return (
    <ThemeProvider>
    <AuthProvider>
    <ToastProvider>
    <ConfirmProvider>
    <NotificationProvider>
      <Router>
        <Routes>
          <Route path="/admin/setup" element={<SetupPage />} />
          <Route path="/admin/wizard" element={<ProtectedRoute><WizardPage /></ProtectedRoute>} />
          <Route path="/admin/login" element={<LoginPage />} />
          <Route path="/admin/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/admin/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.USER_READ}>
                <UsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/roles"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.ROLE_READ}>
                <RolesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/posts"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.POST_READ}>
                <PostsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/posts/new"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.POST_CREATE}>
                <PostEditorPage contentType="post" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/posts/:id/edit"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.POST_EDIT}>
                <PostEditorPage contentType="post" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/pages"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.POST_READ}>
                <PagesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/pages/new"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.POST_CREATE}>
                <PostEditorPage contentType="page" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/pages/:id/edit"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.POST_EDIT}>
                <PostEditorPage contentType="page" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/media"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.MEDIA_READ}>
                <MediaPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/categories"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.CATEGORY_READ}>
                <CategoriesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/tags"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.TAG_READ}>
                <TagsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/celebrations"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.CELEBRATION_READ}>
                <CelebrationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/polls"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.POLL_READ}>
                <PollsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/polls/new"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.POLL_CREATE}>
                <PollEditorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/polls/:id/edit"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.POLL_EDIT}>
                <PollEditorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/events"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.EVENT_READ}>
                <EventsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/events/new"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.EVENT_CREATE}>
                <EventEditorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/events/:id/edit"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.EVENT_EDIT}>
                <EventEditorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/events/:id/registrations"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.EVENT_MANAGE_REGISTRATIONS}>
                <EventRegistrationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/menus"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.MENU_READ}>
                <MenusPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/menus/:id"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.MENU_EDIT}>
                <MenuEditorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/widgets"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.WIDGET_READ}>
                <WidgetsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/sitemap"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.SEO_READ}>
                <SitemapPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/redirects"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.SETTING_READ}>
                <RedirectsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/backups"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.SYSTEM_BACKUP}>
                <BackupsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.SETTING_READ}>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route path="/admin/api-keys" element={<ApiKeysPage />} />
          <Route
            path="/admin/analytics"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.POST_READ}>
                <AnalyticsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/api-analytics"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.API_ANALYTICS_VIEW}>
                <ApiAnalyticsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/contact"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.SETTING_READ}>
                <ContactSubmissionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/comments"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.COMMENT_READ}>
                <CommentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/logs"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.LOG_READ}>
                <LogsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/health"
            element={
              <ProtectedRoute>
                <HealthPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Router>
    </NotificationProvider>
    </ConfirmProvider>
    </ToastProvider>
    </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
