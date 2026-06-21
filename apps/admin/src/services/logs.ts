import { apiClient } from './api';

export interface ActivityLog {
  id: number;
  timestamp: string;
  site: string;
  level: string;
  category: string;
  action: string;
  actorId: string | null;
  actorEmail: string | null;
  targetType: string | null;
  targetId: string | null;
  targetTitle: string | null;
  ip: string | null;
  userAgent: string | null;
  path: string | null;
  method: string | null;
  statusCode: number | null;
  duration: number | null;
  meta: Record<string, unknown> | null;
}

export interface LogFilters {
  page?: number;
  limit?: number;
  search?: string;
  site?: string;
  level?: string;
  category?: string;
  action?: string;
  method?: string;
  actorEmail?: string;
  ip?: string;
  from?: string;
  to?: string;
  statusMin?: number;
  statusMax?: number;
}

export interface LogsResponse {
  items: ActivityLog[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export async function fetchLogs(filters: LogFilters = {}): Promise<LogsResponse> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const res = await apiClient.get(`/logs?${params}`);
  return res.data.data as LogsResponse;
}

export async function purgeLogs(before?: string): Promise<{ deleted: number }> {
  const url = before ? `/logs?before=${encodeURIComponent(before)}` : '/logs';
  const res = await apiClient.delete(url);
  return res.data.data as { deleted: number };
}
