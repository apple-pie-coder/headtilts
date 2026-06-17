import { PaginatedResponse } from '@headtilts/shared';
import { apiClient } from './api';
import { Celebration } from '../types';

export interface CelebrationInput {
  name: string;
  type: string;
  month: number;
  day: number;
  year?: number | null;
  photo?: string | null;
  message?: string | null;
  isActive?: boolean;
}

export async function fetchCelebrations(
  page: number,
  limit: number,
  search?: string,
  type?: string,
): Promise<PaginatedResponse<Celebration>> {
  const response = await apiClient.get('/celebrations', {
    params: { page, limit, search: search || undefined, type: type || undefined },
  });
  return response.data.data;
}

export async function createCelebration(input: CelebrationInput): Promise<Celebration> {
  const response = await apiClient.post('/celebrations', input);
  return response.data.data;
}

export async function updateCelebration(id: number, input: Partial<CelebrationInput>): Promise<Celebration> {
  const response = await apiClient.put(`/celebrations/${id}`, input);
  return response.data.data;
}

export async function deleteCelebration(id: number): Promise<void> {
  await apiClient.delete(`/celebrations/${id}`);
}
