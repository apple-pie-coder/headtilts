import { get } from './api';
import { CalendarMonth, Category, Menu, PublicWidgetZone, SiteSettings, Tag } from '../types';

export function fetchCategories(): Promise<Category[]> {
  return get('/public/categories');
}

export function fetchTags(): Promise<Tag[]> {
  return get('/public/tags');
}

export function fetchMenu(location: string): Promise<Menu> {
  return get(`/public/menus/${location}`);
}

export function fetchWidgetZone(zone: string): Promise<PublicWidgetZone> {
  return get(`/public/widgets/${zone}`);
}

export function fetchSiteSettings(): Promise<SiteSettings> {
  return get('/public/site-settings');
}

export function fetchCalendar(year?: number, month?: number): Promise<CalendarMonth> {
  const params: Record<string, number | undefined> = { year, month };
  return get('/public/calendar', params);
}
