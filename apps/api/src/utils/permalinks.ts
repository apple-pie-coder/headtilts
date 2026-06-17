import { prisma } from '../config/database';

export const DEFAULT_STRUCTURE = '/%postname%/';

interface PermalinkPost {
  id: number;
  slug: string;
  publishedAt: Date | null;
}

let cachedStructure: { value: string; loadedAt: number } | null = null;
const CACHE_TTL_MS = 30 * 1000;

export async function getPermalinkStructure(): Promise<string> {
  if (cachedStructure && Date.now() - cachedStructure.loadedAt < CACHE_TTL_MS) {
    return cachedStructure.value;
  }
  const row = await prisma.setting.findUnique({ where: { key: 'permalink_structure' } });
  const value = row?.value?.trim() || DEFAULT_STRUCTURE;
  cachedStructure = { value, loadedAt: Date.now() };
  return value;
}

/** Build the public path for a post from the configured permalink structure. */
export function buildPostPath(structure: string, post: PermalinkPost): string {
  const date = post.publishedAt ?? new Date();
  const pad = (n: number) => String(n).padStart(2, '0');

  const path = structure
    .replace(/%year%/g, String(date.getUTCFullYear()))
    .replace(/%monthnum%/g, pad(date.getUTCMonth() + 1))
    .replace(/%day%/g, pad(date.getUTCDate()))
    .replace(/%postname%/g, post.slug)
    .replace(/%post_id%/g, String(post.id));

  // Normalize: no trailing slash (except the query-string "plain" style)
  if (path.includes('?')) return path;
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

interface ResolvedPermalink {
  slug?: string;
  id?: number;
}

/**
 * Match a request path against the permalink structure and extract the
 * post slug or id. Returns null when the path doesn't fit the structure.
 */
export function matchPostPath(structure: string, rawPath: string): ResolvedPermalink | null {
  // "Plain" style: /?p=123
  if (structure.includes('?')) {
    const match = /[?&]p=(\d+)/.exec(rawPath);
    return match ? { id: Number(match[1]) } : null;
  }

  const path = rawPath.split('?')[0].replace(/\/+$/, '') || '/';
  const normalized = structure.replace(/\/+$/, '') || '/';

  // Escape regex specials, then swap tokens for capture groups
  let pattern = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  pattern = pattern
    .replace(/%year%/g, '(\\d{4})')
    .replace(/%monthnum%/g, '(\\d{1,2})')
    .replace(/%day%/g, '(\\d{1,2})')
    .replace(/%postname%/g, '(?<slug>[a-z0-9-]+)')
    .replace(/%post_id%/g, '(?<id>\\d+)');

  const match = new RegExp(`^${pattern}$`, 'i').exec(path);
  if (!match) return null;

  const slug = match.groups?.slug;
  const id = match.groups?.id ? Number(match.groups.id) : undefined;
  if (!slug && !id) return null;
  return { slug, id };
}
