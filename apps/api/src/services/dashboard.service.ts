import { PERMISSIONS } from '@headtilts/shared';
import { prisma } from '../config/database';
import { getUpcomingCelebrations } from './celebrations.service';

/**
 * Admin dashboard numbers. Each section is filled only when the caller holds the
 * permission that guards the same data elsewhere; otherwise it is empty/zero and
 * its query is skipped. (Any signed-in user can call this, subscribers included.)
 */
export async function getDashboardStats(permissions: string[]) {
  const can = (p: string) => permissions.includes(p);
  const when = <T>(allowed: boolean, query: () => Promise<T>, empty: T): Promise<T> => (allowed ? query() : Promise.resolve(empty));
  const posts = can(PERMISSIONS.POST_READ);
  const media = can(PERMISSIONS.MEDIA_READ);
  const users = can(PERMISSIONS.USER_READ);
  const comments = can(PERMISSIONS.COMMENT_READ);

  const [
    postStatusCounts,
    pageCount,
    mediaAgg,
    categoryCount,
    tagCount,
    userCount,
    activeUserCount,
    recentPosts,
    recentMedia,
    pendingCommentsCount,
    recentComments,
    recentUsers,
    upcomingCelebrations,
  ] = await Promise.all([
    when(posts, () => prisma.post.groupBy({ by: ['status'], where: { type: 'post' }, _count: { id: true } }), []),
    when(can(PERMISSIONS.PAGE_READ), () => prisma.post.count({ where: { type: 'page', status: { not: 'trash' } } }), 0),
    when(media, () => prisma.media.aggregate({ _count: { id: true }, _sum: { size: true } }), { _count: { id: 0 }, _sum: { size: 0 } }),
    when(can(PERMISSIONS.CATEGORY_READ), () => prisma.category.count(), 0),
    when(can(PERMISSIONS.TAG_READ), () => prisma.tag.count(), 0),
    when(users, () => prisma.user.count(), 0),
    when(users, () => prisma.user.count({ where: { isActive: true } }), 0),
    when(posts, () => prisma.post.findMany({
      where: { type: 'post', status: { not: 'trash' } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        publishedAt: true,
        updatedAt: true,
        author: { select: { id: true, username: true, firstName: true, lastName: true } },
      },
    }), []),
    when(media, () => prisma.media.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, filename: true, originalName: true, url: true, mimeType: true, size: true, createdAt: true },
    }), []),
    when(comments, () => prisma.comment.count({ where: { status: 'pending' } }), 0),
    when(comments, () => prisma.comment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        authorName: true,
        content: true,
        status: true,
        createdAt: true,
        post: { select: { id: true, title: true, slug: true } },
      },
    }), []),
    when(users, () => prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, username: true, firstName: true, lastName: true, email: true, avatar: true, createdAt: true },
    }), []),
    when(can(PERMISSIONS.CELEBRATION_READ), () => getUpcomingCelebrations(5), [] as Awaited<ReturnType<typeof getUpcomingCelebrations>>),
  ]);

  const postCounts: Record<string, number> = { published: 0, draft: 0, scheduled: 0, trash: 0 };
  let postTotal = 0;
  for (const row of postStatusCounts) {
    postCounts[row.status] = row._count.id;
    postTotal += row._count.id;
  }
  postCounts.total = postTotal;

  return {
    posts: postCounts,
    pages: { count: pageCount },
    media: { count: mediaAgg._count.id, totalSize: mediaAgg._sum.size ?? 0 },
    categories: { count: categoryCount },
    tags: { count: tagCount },
    users: { count: userCount, active: activeUserCount },
    recentPosts,
    recentMedia,
    comments: { pending: pendingCommentsCount, recent: recentComments },
    recentUsers,
    upcomingCelebrations,
  };
}
