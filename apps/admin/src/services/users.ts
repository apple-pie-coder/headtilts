import { PaginatedResponse } from '@headtilts/shared';
import { apiClient } from './api';
import { Role, User } from '../types';

export interface CreateUserInput {
  email: string;
  username: string;
  password: string;
  firstName?: string;
  lastName?: string;
  roleIds?: number[];
}

export interface UpdateUserInput {
  email?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string | null;
  isActive?: boolean;
  roleIds?: number[];
}

export async function fetchUsers(page: number, limit: number, search?: string): Promise<PaginatedResponse<User>> {
  const response = await apiClient.get('/users', { params: { page, limit, search: search || undefined } });
  return response.data.data;
}

export async function fetchUser(id: string): Promise<User> {
  const response = await apiClient.get(`/users/${id}`);
  return response.data.data;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const response = await apiClient.post('/users', input);
  return response.data.data;
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  const response = await apiClient.put(`/users/${id}`, input);
  return response.data.data;
}

export async function deleteUser(id: string): Promise<void> {
  await apiClient.delete(`/users/${id}`);
}

export async function fetchRoles(): Promise<Role[]> {
  const response = await apiClient.get('/roles');
  return response.data.data;
}
