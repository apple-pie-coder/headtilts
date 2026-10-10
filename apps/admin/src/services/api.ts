import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Session model: the refresh token lives only in an HttpOnly cookie set by the
// API (requested with `X-Auth-Transport: cookie`), and the short-lived access
// token lives only in memory. Neither is ever written to localStorage, so a
// script injected into the page cannot read or exfiltrate them.
const AUTH_TRANSPORT_HEADERS = { 'X-Auth-Transport': 'cookie' };

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

// Remove tokens persisted by earlier versions of the admin.
try {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
} catch {
  // storage unavailable — nothing to clean up
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    ...AUTH_TRANSPORT_HEADERS,
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

let refreshPromise: Promise<{ accessToken: string; user: unknown }> | null = null;

/**
 * Exchanges the refresh cookie for a new access token (the cookie is rotated
 * server-side). Concurrent callers share one request.
 */
export function refreshSession(): Promise<{ accessToken: string; user: unknown }> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_URL}/auth/refresh`, {}, { withCredentials: true, headers: AUTH_TRANSPORT_HEADERS })
      .then(({ data }) => {
        accessToken = data.data.accessToken as string;
        // Notify AuthContext to update user state with fresh permissions
        window.dispatchEvent(new CustomEvent('auth:userRefreshed', { detail: { user: data.data.user } }));
        return { accessToken: accessToken, user: data.data.user };
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Endpoints whose 401 means "bad credentials", not "session expired".
const NO_REFRESH_PATHS = ['/auth/login', '/auth/refresh', '/auth/setup', '/auth/logout', '/auth/mfa/verify',
  '/auth/forgot-password', '/auth/reset-password'];

function redirectToLogin(): void {
  if (!window.location.pathname.startsWith('/admin/login')) {
    window.location.href = '/admin/login';
  }
}

// Response interceptor for token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const path = originalRequest?.url ?? '';

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !NO_REFRESH_PATHS.some((p) => path.startsWith(p))
    ) {
      originalRequest._retry = true;
      try {
        const { accessToken: newAccess } = await refreshSession();
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
        return apiClient(originalRequest);
      } catch (refreshErr) {
        accessToken = null;
        redirectToLogin();
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);
