import { PaginatedResponse } from '@headtilts/shared';
import { apiClient } from './api';
import { Media, MediaFolder } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const API_ORIGIN = API_URL.replace(/\/api\/?$/, '');

export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) {
    return '';
  }
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}

export interface UploadConfig {
  allowedMime: string[];
  maxBytes: number;
  maxFiles: number;
  format: 'original' | 'webp' | 'avif';
}

export interface UploadResult {
  uploaded: Media[];
  duplicates: Media[];
  errors: { name: string; message: string }[];
}

export async function fetchUploadConfig(): Promise<UploadConfig> {
  const response = await apiClient.get('/media/upload-config');
  return response.data.data;
}

export async function fetchMedia(
  page: number,
  limit: number,
  search?: string,
  folderId?: number | null,
): Promise<PaginatedResponse<Media>> {
  const response = await apiClient.get('/media', {
    params: {
      page,
      limit,
      search: search || undefined,
      folderId: folderId === null ? 'null' : folderId,
    },
  });
  return response.data.data;
}

export async function getMedia(id: number): Promise<Media> {
  const response = await apiClient.get(`/media/${id}`);
  return response.data.data;
}

export async function uploadMediaBatch(
  files: File[],
  folderId: number | null,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  if (folderId != null) formData.append('folderId', String(folderId));

  const response = await apiClient.post('/media', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (onProgress && event.total) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    },
  });
  return response.data.data;
}

// Single-file convenience used by the media picker modal.
export async function uploadMedia(file: File, onProgress?: (percent: number) => void): Promise<Media> {
  const result = await uploadMediaBatch([file], null, onProgress);
  if (result.errors.length > 0) throw new Error(result.errors[0].message);
  const media = result.uploaded[0] ?? result.duplicates[0];
  if (!media) throw new Error('Upload failed');
  return media;
}

export async function replaceMedia(id: number, file: File, onProgress?: (percent: number) => void): Promise<Media> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post(`/media/${id}/replace`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (onProgress && event.total) onProgress(Math.round((event.loaded / event.total) * 100));
    },
  });
  return response.data.data;
}

export interface UpdateMediaInput {
  altText?: string | null;
  title?: string | null;
  caption?: string | null;
  description?: string | null;
  originalName?: string;
  folderId?: number | null;
}

export async function updateMedia(id: number, input: UpdateMediaInput): Promise<Media> {
  const response = await apiClient.put(`/media/${id}`, input);
  return response.data.data;
}

export async function deleteMedia(id: number): Promise<void> {
  await apiClient.delete(`/media/${id}`);
}

export async function bulkDeleteMedia(ids: number[]): Promise<number> {
  const response = await apiClient.post('/media/bulk-delete', { ids });
  return response.data.data.count;
}

export async function fetchFolders(): Promise<MediaFolder[]> {
  const response = await apiClient.get('/media/folders');
  return response.data.data;
}

export async function createFolder(name: string): Promise<MediaFolder> {
  const response = await apiClient.post('/media/folders', { name });
  return response.data.data;
}

export async function deleteFolder(id: number): Promise<void> {
  await apiClient.delete(`/media/folders/${id}`);
}

export async function fetchMediaUsage(id: number): Promise<{ count: number; posts: { id: number; title: string; slug: string; status: string; type: string }[] }> {
  const response = await apiClient.get(`/media/${id}/usage`);
  return response.data.data;
}
