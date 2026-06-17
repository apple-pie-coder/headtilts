import { get } from './api';
import { TodaysCelebrations } from '../types';

export function fetchTodaysCelebrations(): Promise<TodaysCelebrations> {
  return get('/public/celebrations/today');
}
