import { prisma } from '../config/database';
import { ValidationError, NotFoundError } from '../utils/errors';
import { slugify } from '@headtilts/shared';

const OPTION_SELECT = {
  id: true,
  text: true,
  order: true,
  _count: { select: { votes: true } },
} as const;

const POLL_SELECT = {
  id: true,
  title: true,
  question: true,
  slug: true,
  description: true,
  status: true,
  voteMode: true,
  resultVisibility: true,
  voterRestriction: true,
  allowVoteChange: true,
  showSidebar: true,
  startsAt: true,
  endsAt: true,
  featuredImage: true,
  postId: true,
  createdAt: true,
  updatedAt: true,
  options: { select: OPTION_SELECT, orderBy: { order: 'asc' as const } },
  _count: { select: { votes: true } },
} as const;

export interface PollInput {
  title: string;
  question: string;
  slug?: string;
  description?: string;
  status?: string;
  voteMode?: string;
  resultVisibility?: string;
  voterRestriction?: string;
  allowVoteChange?: boolean;
  showSidebar?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  featuredImage?: string | null;
  postId?: number | null;
  options: { id?: number; text: string; order: number }[];
}

export async function listPolls(page = 1, limit = 20, search?: string, status?: string) {
  const where = {
    ...(search ? { OR: [{ title: { contains: search } }, { question: { contains: search } }] } : {}),
    ...(status ? { status } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.poll.findMany({
      where,
      select: POLL_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.poll.count({ where }),
  ]);
  return { items, total };
}

export async function getPoll(idOrSlug: string | number) {
  const where = typeof idOrSlug === 'number' || /^\d+$/.test(String(idOrSlug))
    ? { id: Number(idOrSlug) }
    : { slug: String(idOrSlug) };
  const poll = await prisma.poll.findFirst({ where, select: POLL_SELECT });
  if (!poll) throw new NotFoundError('Poll not found');
  return poll;
}

export async function createPoll(input: PollInput) {
  const slug = input.slug
    ? input.slug.trim().toLowerCase().replace(/\s+/g, '-')
    : slugify(input.title);
  const existing = await prisma.poll.findUnique({ where: { slug } });
  if (existing) throw new ValidationError(`Slug "${slug}" is already in use`);

  return prisma.poll.create({
    data: {
      title: input.title.trim(),
      question: input.question.trim(),
      slug,
      description: input.description?.trim() || null,
      status: input.status || 'draft',
      voteMode: input.voteMode || 'single',
      resultVisibility: input.resultVisibility || 'after_vote',
      voterRestriction: input.voterRestriction || 'anonymous',
      allowVoteChange: input.allowVoteChange ?? false,
      showSidebar: input.showSidebar ?? false,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      featuredImage: input.featuredImage || null,
      postId: input.postId || null,
      options: {
        create: input.options.map((o) => ({ text: o.text.trim(), order: o.order })),
      },
    },
    select: POLL_SELECT,
  });
}

export async function updatePoll(id: number, input: Partial<PollInput>) {
  const poll = await prisma.poll.findUnique({ where: { id } });
  if (!poll) throw new NotFoundError('Poll not found');

  if (input.slug && input.slug !== poll.slug) {
    const existing = await prisma.poll.findFirst({ where: { slug: input.slug, NOT: { id } } });
    if (existing) throw new ValidationError(`Slug "${input.slug}" is already in use`);
  }

  // Sync options: upsert existing (by id), delete removed, create new
  if (input.options) {
    const incomingIds = input.options.filter((o) => o.id).map((o) => o.id!);
    await prisma.pollOption.deleteMany({ where: { pollId: id, id: { notIn: incomingIds } } });
    for (const opt of input.options) {
      if (opt.id) {
        await prisma.pollOption.update({ where: { id: opt.id }, data: { text: opt.text.trim(), order: opt.order } });
      } else {
        await prisma.pollOption.create({ data: { pollId: id, text: opt.text.trim(), order: opt.order } });
      }
    }
  }

  return prisma.poll.update({
    where: { id },
    data: {
      ...(input.title && { title: input.title.trim() }),
      ...(input.question && { question: input.question.trim() }),
      ...(input.slug && { slug: input.slug }),
      ...(input.description !== undefined && { description: input.description?.trim() || null }),
      ...(input.status && { status: input.status }),
      ...(input.voteMode && { voteMode: input.voteMode }),
      ...(input.resultVisibility && { resultVisibility: input.resultVisibility }),
      ...(input.voterRestriction && { voterRestriction: input.voterRestriction }),
      ...(input.allowVoteChange !== undefined && { allowVoteChange: input.allowVoteChange }),
      ...(input.showSidebar !== undefined && { showSidebar: input.showSidebar }),
      ...(input.startsAt !== undefined && { startsAt: input.startsAt ? new Date(input.startsAt) : null }),
      ...(input.endsAt !== undefined && { endsAt: input.endsAt ? new Date(input.endsAt) : null }),
      ...(input.featuredImage !== undefined && { featuredImage: input.featuredImage || null }),
      ...(input.postId !== undefined && { postId: input.postId || null }),
    },
    select: POLL_SELECT,
  });
}

export async function deletePoll(id: number) {
  const poll = await prisma.poll.findUnique({ where: { id } });
  if (!poll) throw new NotFoundError('Poll not found');
  await prisma.poll.delete({ where: { id } });
}

export async function resetVotes(id: number) {
  const poll = await prisma.poll.findUnique({ where: { id } });
  if (!poll) throw new NotFoundError('Poll not found');
  await prisma.pollVote.deleteMany({ where: { pollId: id } });
  return getPoll(id);
}

const MAX_VOTERS_PER_IP = 10;

export async function submitVote(
  pollId: number,
  optionIds: number[],
  voterIdentifier: string,
  ipAddress?: string,
  userId?: string,
) {
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: { options: { select: { id: true } } },
  });
  if (!poll) throw new NotFoundError('Poll not found');

  // Auto-close if endsAt has passed
  const now = new Date();
  if (poll.status !== 'open' || (poll.endsAt && poll.endsAt < now)) {
    throw new ValidationError('This poll is not currently accepting votes');
  }

  // Validate options belong to this poll
  const validIds = new Set(poll.options.map((o) => o.id));
  for (const oid of optionIds) {
    if (!validIds.has(oid)) throw new ValidationError(`Option ${oid} does not belong to this poll`);
  }
  if (poll.voteMode === 'single' && optionIds.length !== 1) {
    throw new ValidationError('This poll only allows one choice');
  }
  if (optionIds.length === 0) throw new ValidationError('At least one option must be selected');

  // Check existing votes for this voter
  const existingVotes = await prisma.pollVote.findMany({
    where: { pollId, voterIdentifier },
  });

  if (existingVotes.length > 0) {
    if (!poll.allowVoteChange) throw new ValidationError('You have already voted on this poll');
  } else if (ipAddress) {
    // voterIdentifier is chosen by the browser, so on its own it doesn't stop
    // ballot stuffing. Cap how many distinct voters one network address can
    // add to a poll (generous enough for a shared office / household).
    const votersFromIp = await prisma.pollVote.groupBy({
      by: ['voterIdentifier'],
      where: { pollId, ipAddress },
    });
    if (votersFromIp.length >= MAX_VOTERS_PER_IP) {
      throw new ValidationError('Too many votes have been cast from your network on this poll');
    }
  }

  // Replace any previous votes and record the new ones atomically.
  await prisma.$transaction([
    prisma.pollVote.deleteMany({ where: { pollId, voterIdentifier } }),
    prisma.pollVote.createMany({
      data: optionIds.map((optionId) => ({
        pollId,
        optionId,
        voterIdentifier,
        ipAddress: ipAddress || null,
        userId: userId || null,
      })),
    }),
  ]);

  return getPublicPollWithResults(poll.slug, voterIdentifier);
}

export async function getPublicPoll(slug: string, voterIdentifier?: string) {
  const poll = await prisma.poll.findUnique({
    where: { slug },
    select: {
      ...POLL_SELECT,
      options: {
        select: { ...OPTION_SELECT },
        orderBy: { order: 'asc' as const },
      },
    },
  });
  if (!poll) throw new NotFoundError('Poll not found');

  // Auto-open/close by schedule
  const now = new Date();
  if (poll.status === 'scheduled' && poll.startsAt && poll.startsAt <= now) {
    await prisma.poll.update({ where: { id: poll.id }, data: { status: 'open' } });
    poll.status = 'open';
  }
  if (poll.status === 'open' && poll.endsAt && poll.endsAt < now) {
    await prisma.poll.update({ where: { id: poll.id }, data: { status: 'closed' } });
    poll.status = 'closed';
  }

  const hasVoted = voterIdentifier
    ? (await prisma.pollVote.count({ where: { pollId: poll.id, voterIdentifier } })) > 0
    : false;

  const myOptionIds = voterIdentifier
    ? (await prisma.pollVote.findMany({ where: { pollId: poll.id, voterIdentifier }, select: { optionId: true } })).map((v) => v.optionId)
    : [];

  const totalVotes = await prisma.pollVote.count({ where: { pollId: poll.id } });

  const showResults =
    poll.resultVisibility === 'always' ||
    (poll.resultVisibility === 'after_vote' && hasVoted) ||
    (poll.resultVisibility === 'before_vote') ||
    (poll.resultVisibility === 'after_close' && poll.status === 'closed');

  const options = poll.options.map((opt) => ({
    id: opt.id,
    text: opt.text,
    order: opt.order,
    votes: showResults ? opt._count.votes : null,
    percentage: showResults && totalVotes > 0 ? Math.round((opt._count.votes / totalVotes) * 100) : null,
    isMyVote: myOptionIds.includes(opt.id),
  }));

  return {
    id: poll.id,
    title: poll.title,
    question: poll.question,
    slug: poll.slug,
    description: poll.description,
    status: poll.status,
    voteMode: poll.voteMode,
    resultVisibility: poll.resultVisibility,
    voterRestriction: poll.voterRestriction,
    allowVoteChange: poll.allowVoteChange,
    startsAt: poll.startsAt,
    endsAt: poll.endsAt,
    featuredImage: poll.featuredImage,
    showSidebar: poll.showSidebar,
    totalVotes,
    hasVoted,
    showResults,
    options,
  };
}

async function getPublicPollWithResults(slug: string, voterIdentifier: string) {
  return getPublicPoll(slug, voterIdentifier);
}

export async function getPollAnalytics() {
  const [allPolls, totalVotes, rawVotesOverTime] = await Promise.all([
    prisma.poll.findMany({
      select: {
        id: true, title: true, status: true, slug: true, createdAt: true,
        _count: { select: { votes: true } },
        options: {
          select: { id: true, text: true, order: true, _count: { select: { votes: true } } },
          orderBy: { order: 'asc' as const },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.pollVote.count(),
    prisma.$queryRaw<{ date: string; votes: bigint }[]>`
      SELECT DATE(createdAt) as date, COUNT(*) as votes
      FROM PollVote
      WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(createdAt)
      ORDER BY date ASC
    `,
  ]);

  const statusCounts = allPolls.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});

  const pollBreakdown = allPolls.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    slug: p.slug,
    totalVotes: p._count.votes,
    options: p.options.map((o) => ({
      id: o.id,
      text: o.text,
      votes: o._count.votes,
      percentage: p._count.votes > 0 ? Math.round((o._count.votes / p._count.votes) * 100) : 0,
    })),
  }));

  const mostVoted = [...pollBreakdown].sort((a, b) => b.totalVotes - a.totalVotes)[0] ?? null;

  return {
    overview: {
      total: allPolls.length,
      open: statusCounts['open'] ?? 0,
      closed: statusCounts['closed'] ?? 0,
      draft: statusCounts['draft'] ?? 0,
      scheduled: statusCounts['scheduled'] ?? 0,
      totalVotes,
      mostVotedTitle: mostVoted?.title ?? null,
      mostVotedCount: mostVoted?.totalVotes ?? 0,
    },
    pollBreakdown,
    votesOverTime: rawVotesOverTime.map((r) => ({
      date: String(r.date).slice(0, 10),
      votes: Number(r.votes),
    })),
  };
}

export async function exportVotesCsv(id: number): Promise<string> {
  const poll = await prisma.poll.findUnique({
    where: { id },
    include: {
      options: { include: { _count: { select: { votes: true } } } },
      _count: { select: { votes: true } },
    },
  });
  if (!poll) throw new NotFoundError('Poll not found');

  const totalVotes = poll._count.votes;
  const lines = [
    `"Poll","${poll.title.replace(/"/g, '""')}"`,
    `"Question","${poll.question.replace(/"/g, '""')}"`,
    `"Status","${poll.status}"`,
    `"Total Votes","${totalVotes}"`,
    '',
    '"Option","Votes","Percentage"',
    ...poll.options
      .sort((a, b) => a.order - b.order)
      .map((opt) => {
        const pct = totalVotes > 0 ? ((opt._count.votes / totalVotes) * 100).toFixed(1) : '0.0';
        return `"${opt.text.replace(/"/g, '""')}","${opt._count.votes}","${pct}%"`;
      }),
  ];
  return lines.join('\n');
}
