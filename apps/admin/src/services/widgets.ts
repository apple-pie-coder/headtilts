import { apiClient } from './api';
import { Widget, WidgetZone, WidgetType } from '../types';

export interface WidgetInput {
  name: string;
  type: string;
  title?: string | null;
  description?: string | null;
  isActive?: boolean;
  config?: Record<string, unknown>;
}

export async function fetchWidgetTypes(): Promise<WidgetType[]> {
  const response = await apiClient.get('/widgets/types');
  return response.data.data;
}

export async function fetchWidgets(): Promise<Widget[]> {
  const response = await apiClient.get('/widgets');
  return response.data.data;
}

export async function fetchWidget(id: number): Promise<Widget> {
  const response = await apiClient.get(`/widgets/${id}`);
  return response.data.data;
}

export async function createWidget(input: WidgetInput): Promise<Widget> {
  const response = await apiClient.post('/widgets', input);
  return response.data.data;
}

export async function updateWidget(id: number, input: Partial<WidgetInput>): Promise<Widget> {
  const response = await apiClient.put(`/widgets/${id}`, input);
  return response.data.data;
}

export async function deleteWidget(id: number): Promise<void> {
  await apiClient.delete(`/widgets/${id}`);
}

export async function fetchWidgetZones(): Promise<WidgetZone[]> {
  const response = await apiClient.get('/widgets/zones');
  return response.data.data;
}

export async function updateZoneWidgets(zoneName: string, widgetIds: number[]): Promise<WidgetZone> {
  const response = await apiClient.put(`/widgets/zones/${zoneName}`, { widgetIds });
  return response.data.data;
}
