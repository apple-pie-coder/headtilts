import { ValidationError } from './errors';

/**
 * The picked icon's shape, stored so the public site can draw it without the
 * icon library: JSON { w, h, d } where d is SVG path data. Validated strictly
 * because it is rendered on public pages.
 */
export function normalizeIconSvg(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  let v: unknown = value;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { throw new ValidationError('Invalid icon'); }
  }
  const { w, h, d } = (v ?? {}) as { w?: unknown; h?: unknown; d?: unknown };
  const dim = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= 2048;
  if (!dim(w) || !dim(h) || typeof d !== 'string' || d.length > 20_000 || !/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s+-]+$/.test(d)) {
    throw new ValidationError('Invalid icon');
  }
  return JSON.stringify({ w, h, d });
}

/** A Font Awesome class name such as "fa-solid fa-guitar"; anything else is dropped. */
export function normalizeIconName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v.length <= 100 && /^fa-[a-z]+( fa-[a-z0-9-]+)+$/.test(v) ? v : null;
}
