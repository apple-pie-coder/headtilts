import { apiClient } from './api';

export interface Redirect {
  id: number;
  fromPath: string;
  toPath: string;
  type: number;
  hits: number;
  createdAt: string;
  updatedAt: string;
}

export async function fetchRedirects(): Promise<Redirect[]> {
  const response = await apiClient.get('/redirects');
  return response.data.data;
}

export async function createRedirect(fromPath: string, toPath: string, type: number): Promise<Redirect> {
  const response = await apiClient.post('/redirects', { fromPath, toPath, type });
  return response.data.data;
}

export async function updateRedirect(id: number, data: { fromPath?: string; toPath?: string; type?: number }): Promise<Redirect> {
  const response = await apiClient.put(`/redirects/${id}`, data);
  return response.data.data;
}

export async function deleteRedirect(id: number): Promise<void> {
  await apiClient.delete(`/redirects/${id}`);
}
