import type { FrontPageLayout, FrontPageSection } from '@headtilts/shared';
import { apiClient } from './api';

export interface FrontPageVersionInfo { id: string; at: string; by: string | null; label?: string; sections: number }

export interface FrontPageEditorState {
  published: { layout: FrontPageLayout; at: string | null; by: string | null; isDefault: boolean };
  draft: { layout: FrontPageLayout; at: string; by: string | null } | null;
  history: FrontPageVersionInfo[];
}

export type ResolvedSection = FrontPageSection & { data?: unknown };

export async function fetchFrontPage(): Promise<FrontPageEditorState> {
  return (await apiClient.get('/front-page')).data.data;
}

/** Stories etc. for each section of an unsaved layout, for the live preview. */
export async function resolveFrontPage(layout: FrontPageLayout): Promise<ResolvedSection[]> {
  return (await apiClient.post('/front-page/resolve', { layout })).data.data.sections;
}

export async function saveFrontPageDraft(layout: FrontPageLayout): Promise<{ at: string; by: string | null }> {
  return (await apiClient.put('/front-page/draft', { layout })).data.data;
}

export async function discardFrontPageDraft(): Promise<void> {
  await apiClient.delete('/front-page/draft');
}

export async function publishFrontPage(layout: FrontPageLayout): Promise<{ at: string; by: string | null; layout: FrontPageLayout }> {
  return (await apiClient.post('/front-page/publish', { layout })).data.data;
}

export async function fetchFrontPageVersion(id: string): Promise<{ layout: FrontPageLayout; at: string; by: string | null }> {
  return (await apiClient.get(`/front-page/history/${encodeURIComponent(id)}`)).data.data;
}
