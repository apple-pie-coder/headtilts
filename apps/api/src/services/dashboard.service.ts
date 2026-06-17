import { prisma } from '../config/database';
import { getUpcomingCelebrations } from './celebrations.service';

export async function getDashboardStats() {
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
    prisma.post.groupBy({ by: ['status'], where: { type: 'post' }, _count: { id: true } }),
    prisma.post.count({ where: { type: 'page', status: { not: 'trash' } } }),
    prisma.media.aggregate({ _count: { id: true }, _sum: { size: true } }),
    prisma.category.count(),
    prisma.tag.count(),
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.post.findMany({
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
    }),
    prisma.media.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, filename: true, originalName: true, url: true, mimeType: true, size: true, createdAt: true },
    }),
    prisma.comment.count({ where: { status: 'pending' } }),
    prisma.comment.findMany({
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
    }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, username: true, firstName: true, lastName: true, email: true, avatar: true, createdAt: true },
    }),
    getUpcomingCelebrations(5),
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
