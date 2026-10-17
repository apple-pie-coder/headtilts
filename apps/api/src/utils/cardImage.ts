import { youtubeId } from '@headtilts/shared';
import { prisma } from '../config/database';

/**
 * Half the archive has no featured image. For listings and social cards, fall
 * back to the first image in the post's text, then its YouTube thumbnail, so
 * cards show a real picture instead of an empty block. Nothing is written back.
 */
export function imageFromContent(content: string | null | undefined, videoUrl?: string | null): string | null {
  if (content) {
    const img = content.match(/<img[^>]+src="([^"]+)"/i)?.[1];
    if (img && (img.startsWith('/uploads/') || img.startsWith('https://'))) return img;
  }
  const yt = (videoUrl && youtubeId(videoUrl))
    || (content ? youtubeId(content.match(/https:\/\/(?:www\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)[\w-]{11}[^"'\s<]*/i)?.[0] ?? '') : null);
  return yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null;
}

/** Fill featuredImage for the posts in a listing that have none (one extra query). */
export async function withCardImages<T extends { id: number; featuredImage: string | null }>(posts: T[]): Promise<(T & { imageFallback?: boolean })[]> {
  const missing = posts.filter((p) => !p.featuredImage).map((p) => p.id);
  if (!missing.length) return posts;
  const rows = await prisma.post.findMany({ where: { id: { in: missing } }, select: { id: true, content: true, videoUrl: true } });
  const found = new Map(rows.map((r) => [r.id, imageFromContent(r.content, r.videoUrl)]));
  return posts.map((p) => {
    const img = p.featuredImage ? null : found.get(p.id);
    return img ? { ...p, featuredImage: img, imageFallback: true } : p;
  });
}
