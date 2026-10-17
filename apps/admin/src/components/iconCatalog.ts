// Every free Font Awesome solid and brand icon, flattened for the icon picker.
// The data comes from the `virtual:fa-catalog` build plugin (see vite.config.ts)
// and this module is imported lazily, so it only downloads when an editor
// actually opens the picker.
import { SOLID as RAW_SOLID, BRANDS as RAW_BRANDS } from 'virtual:fa-catalog';

export interface CatalogIcon {
  /** Class name stored on the category, e.g. "fa-solid fa-guitar". */
  className: string;
  name: string;
  style: 'solid' | 'brands';
  /** Lower-case name plus aliases, for search. */
  terms: string;
  w: number;
  h: number;
  d: string;
}

const withClass = (i: Omit<CatalogIcon, 'className'>): CatalogIcon => ({ ...i, className: `fa-${i.style} fa-${i.name}` });

export const SOLID = RAW_SOLID.map(withClass);
export const BRANDS = RAW_BRANDS.map(withClass);

// Shown first: icons that fit a music & culture site's sections.
const SUGGESTED_NAMES = [
  'newspaper', 'star', 'microphone', 'microphone-lines', 'guitar', 'drum', 'music', 'headphones', 'compact-disc',
  'record-vinyl', 'radio', 'podcast', 'video', 'camera', 'ticket', 'calendar-days', 'pen-nib', 'comments',
  'square-poll-vertical', 'chart-line', 'trophy', 'fire', 'bolt', 'skull', 'users', 'heart', 'globe', 'folder',
  'tag', 'circle-info',
];
export const SUGGESTED = SUGGESTED_NAMES
  .map((n) => SOLID.find((i) => i.name === n))
  .filter((i): i is CatalogIcon => !!i);
