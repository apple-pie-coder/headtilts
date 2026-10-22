/** Fields a public post listing returns (cards, archives, front page). */
export const postPublicSelect = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  type: true,
  parentId: true,
  publishedAt: true,
  updatedAt: true,
  featuredImage: true,
  featuredImageFocus: true,
  template: true,
  isFeatured: true,
  showSidebar: true,
  author: { select: { id: true, username: true, firstName: true, lastName: true, avatar: true, bio: true } },
  coAuthors: { select: { user: { select: { id: true, username: true, firstName: true, lastName: true, avatar: true, bio: true } } }, orderBy: { order: 'asc' as const } },
  categories: { select: { category: { select: { id: true, name: true, slug: true, icon: true, iconSvg: true } } } },
  tags: { select: { tag: { select: { id: true, name: true, slug: true } } } },
  articleType: true,
  // Cards show a LIVE badge only while coverage is open.
  liveEndedAt: true,
  // Cards show the verdict at a glance; the full review comes with the post itself.
  review: { select: { subjectType: true, subjectTitle: true, artist: true, rating: true, coverImage: true } },
} as const;
