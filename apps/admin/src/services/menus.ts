import { apiClient } from './api';
import { Menu, MenuSummary } from '../types';

export interface MenuInput {
  name: string;
  location: string;
  description?: string;
}

export interface MenuItemDraftInput {
  title: string;
  url?: string;
  postId?: number;
  categoryId?: number;
  tagId?: number;
  depth: number;
  position: number;
  isVisible: boolean;
}

export async function fetchMenus(): Promise<MenuSummary[]> {
  const response = await apiClient.get('/menus');
  return response.data.data;
}

export async function fetchMenu(id: number): Promise<Menu> {
  const response = await apiClient.get(`/menus/${id}`);
  return response.data.data;
}

export async function createMenu(input: MenuInput): Promise<Menu> {
  const response = await apiClient.post('/menus', input);
  return response.data.data;
}

export async function updateMenu(id: number, input: Partial<MenuInput>): Promise<Menu> {
  const response = await apiClient.put(`/menus/${id}`, input);
  return response.data.data;
}

export async function saveMenuItems(menuId: number, items: MenuItemDraftInput[]): Promise<Menu> {
  const response = await apiClient.put(`/menus/${menuId}/items`, { items });
  return response.data.data;
}

export async function deleteMenu(id: number): Promise<void> {
  await apiClient.delete(`/menus/${id}`);
}
