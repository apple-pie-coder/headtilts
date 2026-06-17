import { apiClient } from './api';
import { User } from '../types';

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  bio?: string;
  avatar?: string | null;
  currentPassword?: string;
  password?: string;
}

export async function fetchMe(): Promise<User> {
  const response = await apiClient.get('/users/me');
  return response.data.data;
}

export async function updateMe(input: UpdateProfileInput): Promise<User> {
  const response = await apiClient.put('/users/me', input);
  return response.data.data;
}
