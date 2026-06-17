import { apiClient } from './api';
import { ContactSubmission } from '../types';

export interface ContactListResult {
  items: ContactSubmission[];
  unread: number;
  pagination: { page: number; limit: number; total: number; pages: number };
}

export async function fetchSubmissions(page: number, limit: number, unreadOnly = false): Promise<ContactListResult> {
  const response = await apiClient.get('/contact-submissions', {
    params: { page, limit, unread: unreadOnly || undefined },
  });
  return response.data.data;
}

export async function markSubmissionRead(id: number, isRead: boolean): Promise<ContactSubmission> {
  const response = await apiClient.put(`/contact-submissions/${id}/read`, { isRead });
  return response.data.data;
}

export async function deleteSubmission(id: number): Promise<void> {
  await apiClient.delete(`/contact-submissions/${id}`);
}
