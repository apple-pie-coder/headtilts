import { apiClient } from './api';
import { Setting } from '../types';

export async function fetchSettings(): Promise<Setting[]> {
  const response = await apiClient.get('/settings');
  return response.data.data;
}

export async function updateSettings(updates: Record<string, string>): Promise<Setting[]> {
  const response = await apiClient.put('/settings', updates);
  return response.data.data;
}

/** Public, unauthenticated settings subset (site_title, site_logo, …) — usable on the login screen. */
export async function fetchPublicSettings(): Promise<Record<string, string>> {
  const response = await apiClient.get('/public/site-settings');
  return response.data.data;
}

/** Send a test email to the currently logged-in user to verify SMTP config. */
export async function sendTestEmail(): Promise<{ sent: boolean; to: string }> {
  const response = await apiClient.post('/settings/test-email');
  return response.data.data;
}
