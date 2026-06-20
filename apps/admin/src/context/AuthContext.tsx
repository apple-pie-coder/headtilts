import { createContext, useState, useEffect, ReactNode } from 'react';
import { AxiosError } from 'axios';
import { AuthContextType, SetupInput, User } from '../types';
import { apiClient } from '../services/api';
import { setupAdmin } from '../services/auth';

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUser();
  }, []);

  // Listen for token refresh events from the API interceptor
  useEffect(() => {
    function handleUserRefreshed(e: Event) {
      const freshUser = (e as CustomEvent).detail?.user;
      if (freshUser) setUser(freshUser);
    }
    window.addEventListener('auth:userRefreshed', handleUserRefreshed);
    return () => window.removeEventListener('auth:userRefreshed', handleUserRefreshed);
  }, []);

  async function loadUser() {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const response = await apiClient.get('/auth/me');
      setUser(response.data.data);
      setError(null);
    } catch {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(identifier: string, password: string): Promise<{ mfaRequired: true; mfaToken: string } | void> {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.post('/auth/login', { identifier, password });
      const data = response.data.data;

      if (data.mfaRequired) {
        return { mfaRequired: true as const, mfaToken: data.mfaToken as string };
      }

      localStorage.setItem('accessToken', data.accessToken);
      if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
      setUser(data.user);
    } catch (err: unknown) {
      const message = (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || 'Login failed';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function completeMfaLogin(mfaToken: string, code: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.post('/auth/mfa/verify', { mfaToken, code });
      const { accessToken, refreshToken, user: userData } = response.data.data;
      localStorage.setItem('accessToken', accessToken);
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
      setUser(userData);
    } catch (err: unknown) {
      const message = (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || 'Invalid code';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function completeMfaBackupLogin(mfaToken: string, backupCode: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.post('/auth/mfa/verify-backup', { mfaToken, backupCode });
      const { accessToken, refreshToken, user: userData } = response.data.data;
      localStorage.setItem('accessToken', accessToken);
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
      setUser(userData);
    } catch (err: unknown) {
      const message = (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || 'Invalid backup code';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function setup(input: SetupInput) {
    setLoading(true);
    setError(null);
    try {
      const { accessToken, refreshToken, user: userData } = await setupAdmin(input);
      localStorage.setItem('accessToken', accessToken);
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
      setUser(userData);
    } catch (err: unknown) {
      const message = (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || 'Setup failed';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    setLoading(true);
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Continue logout even if API call fails
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setUser(null);
      setLoading(false);
    }
  }

  function hasPermission(permission: string): boolean {
    if (!user) return false;
    const permissions = user.roles.flatMap((role) => role.permissions?.map((p) => `${p.module}_${p.action}`) || []);
    return permissions.includes(permission);
  }

  const value: AuthContextType = {
    user,
    loading,
    error,
    login,
    completeMfaLogin,
    completeMfaBackupLogin,
    setup,
    logout,
    isAuthenticated: !!user,
    hasPermission,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
