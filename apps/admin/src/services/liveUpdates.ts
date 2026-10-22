import { apiClient } from './api';
import { LiveUpdate } from '../types';

export interface LiveUpdateInput {
  headline?: string | null;
  format?: 'html' | 'text';
  body?: string;
  image?: string | null;
  pinned?: boolean;
}

export interface LiveFeed {
  liveEndedAt: string | null;
  updates: LiveUpdate[];
}

export async function fetchLiveUpdates(postId: number): Promise<LiveFeed> {
  const response = await apiClient.get(`/posts/${postId}/live-updates`);
  return response.data.data;
}

export async function createLiveUpdate(postId: number, input: LiveUpdateInput): Promise<LiveUpdate> {
  const response = await apiClient.post(`/posts/${postId}/live-updates`, input);
  return response.data.data;
}

export async function updateLiveUpdate(postId: number, id: number, input: LiveUpdateInput): Promise<LiveUpdate> {
  const response = await apiClient.put(`/posts/${postId}/live-updates/${id}`, input);
  return response.data.data;
}

export async function deleteLiveUpdate(postId: number, id: number): Promise<void> {
  await apiClient.delete(`/posts/${postId}/live-updates/${id}`);
}

export async function setLiveCoverage(postId: number, ended: boolean): Promise<{ liveEndedAt: string | null }> {
  const response = await apiClient.put(`/posts/${postId}/live-coverage`, { ended });
  return response.data.data;
}
