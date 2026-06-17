import { apiClient } from './api';
import { DashboardStats } from '../types';

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const response = await apiClient.get('/dashboard/stats');
  return response.data.data as DashboardStats;
}
