import { apiClient } from './api';

export type Granularity = 'day' | 'week' | 'month';

export interface OverviewStats {
  totalCalls: number;
  last24hCalls: number;
  successCount: number;
  errorCount: number;
  errorRate: number;
  avgDurationMs: number;
  activeApiKeys: number;
}

export interface CallsOverTimePoint {
  date: string;
  total: number;
  errors: number;
}

export interface CallsPerKey {
  apiKeyId: number;
  name: string;
  prefix: string;
  calls: number;
  avgDurationMs: number;
}

export interface TopEndpoint {
  endpoint: string;
  method: string;
  calls: number;
  avgDurationMs: number;
}

export interface ErrorRateEndpoint {
  endpoint: string;
  errorCount: number;
}

export interface PeakHour {
  hour: number;
  calls: number;
}

export async function fetchOverview(): Promise<OverviewStats> {
  const res = await apiClient.get('/api-analytics/overview');
  return res.data.data;
}

export async function fetchCallsOverTime(granularity: Granularity = 'day'): Promise<CallsOverTimePoint[]> {
  const res = await apiClient.get('/api-analytics/calls-over-time', { params: { granularity } });
  return res.data.data;
}

export async function fetchCallsPerKey(): Promise<CallsPerKey[]> {
  const res = await apiClient.get('/api-analytics/calls-per-key');
  return res.data.data;
}

export async function fetchTopEndpoints(): Promise<TopEndpoint[]> {
  const res = await apiClient.get('/api-analytics/top-endpoints');
  return res.data.data;
}

export async function fetchErrorRates(): Promise<ErrorRateEndpoint[]> {
  const res = await apiClient.get('/api-analytics/error-rates');
  return res.data.data;
}

export async function fetchPeakHours(): Promise<PeakHour[]> {
  const res = await apiClient.get('/api-analytics/peak-hours');
  return res.data.data;
}

export function exportCsvUrl(fromDate?: string): string {
  const base = apiClient.defaults.baseURL ?? '/api';
  const params = fromDate ? `?from=${encodeURIComponent(fromDate)}` : '';
  return `${base}/api-analytics/export${params}`;
}
