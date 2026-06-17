// Builds public post URLs from the admin-configured permalink structure.
// Until settings load we fall back to the legacy /posts/:slug route, which
// stays registered for backward compatibility.
let structure = '/posts/%postname%';

export function setPermalinkStructure(value: string | null | undefined) {
  if (value && value.trim()) structure = value.trim();
}

export function postPath(post: { id: number; slug: string; publishedAt?: string | null }): string {
  const date = post.publishedAt ? new Date(post.publishedAt) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');

  const path = structure
    .replace(/%year%/g, String(date.getUTCFullYear()))
    .replace(/%monthnum%/g, pad(date.getUTCMonth() + 1))
    .replace(/%day%/g, pad(date.getUTCDate()))
    .replace(/%postname%/g, post.slug)
    .replace(/%post_id%/g, String(post.id));

  if (path.includes('?')) return path;
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}
