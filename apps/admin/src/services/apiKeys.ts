import { apiClient } from './api';

export interface ApiKey {
  id: number;
  name: string;
  prefix: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface ApiKeyCreated extends ApiKey {
  rawKey: string;
}

export interface ApiKeyInput {
  name: string;
  scopes: string[];
  expiresAt?: string | null;
}

export async function fetchApiKeys(): Promise<ApiKey[]> {
  const res = await apiClient.get<{ data: ApiKey[] }>('/api-keys');
  return res.data.data;
}

export async function fetchScopes(): Promise<string[]> {
  const res = await apiClient.get<{ data: string[] }>('/api-keys/scopes');
  return res.data.data;
}

export async function createApiKey(input: ApiKeyInput): Promise<ApiKeyCreated> {
  const res = await apiClient.post<{ data: ApiKeyCreated }>('/api-keys', input);
  return res.data.data;
}

export async function updateApiKey(id: number, input: Partial<ApiKeyInput>): Promise<ApiKey> {
  const res = await apiClient.patch<{ data: ApiKey }>(`/api-keys/${id}`, input);
  return res.data.data;
}

export async function deleteApiKey(id: number): Promise<void> {
  await apiClient.delete(`/api-keys/${id}`);
}
