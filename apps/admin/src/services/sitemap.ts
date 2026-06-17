import { apiClient } from './api';
import { SitemapEntry } from '../types';

export interface SitemapInput {
  url: string;
  priority?: number;
  changefreq?: string | null;
  lastmod?: string | null;
}

export async function fetchSitemapEntries(): Promise<SitemapEntry[]> {
  const response = await apiClient.get('/sitemap');
  return response.data.data;
}

export async function createSitemapEntry(input: SitemapInput): Promise<SitemapEntry> {
  const response = await apiClient.post('/sitemap', input);
  return response.data.data;
}

export async function updateSitemapEntry(id: number, input: Partial<SitemapInput>): Promise<SitemapEntry> {
  const response = await apiClient.put(`/sitemap/${id}`, input);
  return response.data.data;
}

export async function deleteSitemapEntry(id: number): Promise<void> {
  await apiClient.delete(`/sitemap/${id}`);
}
