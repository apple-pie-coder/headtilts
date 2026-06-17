import { apiClient } from './api';
import { Role } from '../types';

export interface RoleInput {
  name: string;
  description?: string;
  permissionIds: number[];
}

export async function fetchRoles(): Promise<Role[]> {
  const response = await apiClient.get('/roles');
  return response.data.data;
}

export async function fetchRole(id: number): Promise<Role> {
  const response = await apiClient.get(`/roles/${id}`);
  return response.data.data;
}

export async function createRole(input: RoleInput): Promise<Role> {
  const response = await apiClient.post('/roles', input);
  return response.data.data;
}

export async function updateRole(id: number, input: Partial<RoleInput>): Promise<Role> {
  const response = await apiClient.put(`/roles/${id}`, input);
  return response.data.data;
}

export async function deleteRole(id: number): Promise<void> {
  await apiClient.delete(`/roles/${id}`);
}

export async function fetchPermissions(): Promise<Record<string, PermissionEntry[]>> {
  const response = await apiClient.get('/roles/permissions');
  return response.data.data;
}

export interface PermissionEntry {
  id: number;
  module: string;
  action: string;
  description: string | null;
}
