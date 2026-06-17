import { apiClient } from './api';

export interface SetupStatus {
  needsSetup: boolean;
}

export interface SetupInput {
  email: string;
  username: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export async function fetchSetupStatus(): Promise<SetupStatus> {
  const response = await apiClient.get('/auth/setup-status');
  return response.data.data;
}

export async function setupAdmin(input: SetupInput) {
  const response = await apiClient.post('/auth/setup', input);
  return response.data.data;
}

export async function requestPasswordReset(email: string): Promise<void> {
  await apiClient.post('/auth/forgot-password', { email });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await apiClient.post('/auth/reset-password', { token, password });
}
