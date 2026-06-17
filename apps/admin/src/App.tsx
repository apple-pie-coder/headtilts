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
import ContactSubmissionsPage from './pages/ContactSubmissions';
import CommentsPage from './pages/Comments';
import DashboardPage from './pages/Dashboard';
import UsersPage from './pages/Users';
import CategoriesPage from './pages/Categories';
import TagsPage from './pages/Tags';
import CelebrationsPage from './pages/Celebrations';
import PostsPage from './pages/Posts';
import PagesPage from './pages/Pages';
import PostEditorPage from './pages/PostEditor';
import MediaPage from './pages/Media';
import SettingsPage from './pages/Settings';
import MenusPage from './pages/Menus';
import MenuEditorPage from './pages/MenuEditor';
import RolesPage from './pages/Roles';
import ProfilePage from './pages/Profile';
import SitemapPage from './pages/Sitemap';
import WidgetsPage from './pages/Widgets';

function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
    <ToastProvider>
    <ConfirmProvider>
    <NotificationProvider>
      <Router>
        <Routes>
          <Route path="/admin/setup" element={<SetupPage />} />
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
            path="/admin/settings"
            element={
              <ProtectedRoute requiredPermission={PERMISSIONS.SETTING_READ}>
                <SettingsPage />
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
