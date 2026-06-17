import { PaginatedResponse } from '@headtilts/shared';
import { apiClient } from './api';
import { Category } from '../types';

export interface CreateCategoryInput {
  name: string;
  slug?: string;
  description?: string;
  parentId?: number | null;
  icon?: string;
  showSidebar?: boolean;
}

export interface UpdateCategoryInput {
  name?: string;
  slug?: string;
  description?: string;
  parentId?: number | null;
  icon?: string;
  showSidebar?: boolean;
}

export async function fetchCategories(
  page: number,
  limit: number,
  search?: string
): Promise<PaginatedResponse<Category>> {
  const response = await apiClient.get('/categories', { params: { page, limit, search: search || undefined } });
  return response.data.data;
}

export async function createCategory(input: CreateCategoryInput): Promise<Category> {
  const response = await apiClient.post('/categories', input);
  return response.data.data;
}

export async function updateCategory(id: number, input: UpdateCategoryInput): Promise<Category> {
  const response = await apiClient.put(`/categories/${id}`, input);
  return response.data.data;
}

export async function deleteCategory(id: number): Promise<void> {
  await apiClient.delete(`/categories/${id}`);
}
