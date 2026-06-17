import { PaginatedResponse } from '@headtilts/shared';
import { apiClient } from './api';
import { Tag } from '../types';

export interface CreateTagInput {
  name: string;
  slug?: string;
  description?: string;
}

export interface UpdateTagInput {
  name?: string;
  slug?: string;
  description?: string;
}

export async function fetchTags(page: number, limit: number, search?: string): Promise<PaginatedResponse<Tag>> {
  const response = await apiClient.get('/tags', { params: { page, limit, search: search || undefined } });
  return response.data.data;
}

export async function createTag(input: CreateTagInput): Promise<Tag> {
  const response = await apiClient.post('/tags', input);
  return response.data.data;
}

export async function updateTag(id: number, input: UpdateTagInput): Promise<Tag> {
  const response = await apiClient.put(`/tags/${id}`, input);
  return response.data.data;
}

export async function deleteTag(id: number): Promise<void> {
  await apiClient.delete(`/tags/${id}`);
}
