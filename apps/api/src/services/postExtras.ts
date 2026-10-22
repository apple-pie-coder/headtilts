import { Prisma } from '@prisma/client';
import {
  ARTICLE_TYPES, QNA_SUBJECTS, REVIEW_RATING_MAX, REVIEW_SUBJECTS, STREAMING_SERVICES,
  detectStreamingService, youtubeId,
} from '@headtilts/shared';
import type { ArticleType, StreamingLinks } from '@headtilts/shared';
import { ValidationError } from '../utils/errors';

/**
 * Validation and persistence for the parts of a post that live beside the
 * core fields: editorial type, featured video, music review and SEO analysis.
 */

export interface ReviewInput {
  subjectType?: string;
  subjectTitle?: string;
  artist?: string;
  releaseDate?: string | null;
  label?: string | null;
  genre?: string | null;
  coverImage?: string | null;
  rating?: number | null;
  verdict?: string | null;
  highlights?: string[] | null;
  tracklist?: { title: string; duration?: string | null }[] | null;
  streaming?: Record<string, string> | null;
}

export interface SeoInput {
  focusKeyword?: string | null;
  seoScore?: number | null;
  readabilityScore?: number | null;
}

export interface PostExtrasInput {
  /** CSS object-position for the featured image, e.g. "50% 30%". */
  featuredImageFocus?: string | null;
  articleType?: string;
  videoUrl?: string | null;
  /** Object = save, null = remove, undefined = leave untouched. */
  review?: ReviewInput | null;
  /** Same convention as review. */
  qna?: QnaInput | null;
  seo?: SeoInput;
}

export interface QnaInput {
  subject?: string;
  subjectType?: string;
  sessionDate?: string | null;
  host?: string | null;
  items?: { question?: string; askedBy?: string | null; answer?: string; answeredBy?: string | null }[];
}

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/\s+/g, ' ');
  return t ? t.slice(0, max) : null;
};

export function normalizeArticleType(value: unknown): ArticleType | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string' && (ARTICLE_TYPES as readonly string[]).includes(value)) return value as ArticleType;
  throw new ValidationError(`Post type must be one of: ${ARTICLE_TYPES.join(', ')}`);
}

/** "x% y%" with both values clamped to 0–100; null resets to centre. */
export function normalizeFocus(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const m = typeof value === 'string' ? value.trim().match(/^(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%$/) : null;
  if (!m) throw new ValidationError('Image focus must look like "50% 30%"');
  const clamp = (n: string) => Math.round(Math.min(100, Math.max(0, Number(n))));
  const focus = `${clamp(m[1])}% ${clamp(m[2])}%`;
  return focus === '50% 50%' ? null : focus;
}

export function normalizeVideoUrl(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !youtubeId(value)) {
    throw new ValidationError('Featured video must be a YouTube link');
  }
  return value.trim().slice(0, 500);
}

function normalizeStreaming(value: unknown): StreamingLinks | null {
  if (!value || typeof value !== 'object') return null;
  const out: StreamingLinks = {};
  for (const { key, label } of STREAMING_SERVICES) {
    const url = (value as Record<string, unknown>)[key];
    if (typeof url !== 'string' || !url.trim()) continue;
    const detected = detectStreamingService(url);
    // A YouTube Music field may hold a plain YouTube link and vice versa.
    const ok = detected === key || (key === 'youtubeMusic' && detected === 'youtube') || (key === 'youtube' && detected === 'youtubeMusic');
    if (!ok) throw new ValidationError(`That doesn't look like a ${label} link`);
    out[key] = url.trim().slice(0, 500);
  }
  return Object.keys(out).length ? out : null;
}

export function normalizeReview(value: unknown): Prisma.ReviewUncheckedCreateInput | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'object') throw new ValidationError('Invalid review');
  const r = value as ReviewInput;

  const subjectType = (REVIEW_SUBJECTS as readonly string[]).includes(r.subjectType ?? '') ? r.subjectType! : 'album';
  // Drafts may be incomplete; assertPublishable() enforces the essentials on publish.
  const subjectTitle = text(r.subjectTitle, 255) ?? '';
  const artist = text(r.artist, 255) ?? '';

  let rating: number | null = null;
  if (r.rating !== null && r.rating !== undefined && (r.rating as unknown) !== '') {
    const n = Number(r.rating);
    if (!Number.isFinite(n) || n < 0 || n > REVIEW_RATING_MAX) {
      throw new ValidationError(`Rating must be between 0 and ${REVIEW_RATING_MAX}`);
    }
    rating = Math.round(n * 2) / 2;
  }

  let releaseDate: Date | null = null;
  if (r.releaseDate) {
    const d = new Date(r.releaseDate);
    if (Number.isNaN(d.getTime())) throw new ValidationError('Release date is not a valid date');
    releaseDate = d;
  }

  const highlights = Array.isArray(r.highlights)
    ? r.highlights.map((h) => text(h, 200)).filter((h): h is string => !!h).slice(0, 20)
    : [];
  const tracklist = Array.isArray(r.tracklist)
    ? r.tracklist
        .map((t) => ({ title: text(t?.title, 200), duration: text(t?.duration, 10) }))
        .filter((t): t is { title: string; duration: string | null } => !!t.title)
        .slice(0, 80)
    : [];

  return {
    postId: 0, // set by the caller
    subjectType,
    subjectTitle,
    artist,
    releaseDate,
    label: text(r.label, 255),
    genre: text(r.genre, 120),
    coverImage: text(r.coverImage, 500),
    rating,
    verdict: text(r.verdict, 300),
    highlights: highlights.length ? highlights : Prisma.DbNull,
    tracklist: tracklist.length ? tracklist : Prisma.DbNull,
    streaming: normalizeStreaming(r.streaming) ?? Prisma.DbNull,
  };
}

// Answers can run long and keep their paragraphs, so only trim the ends.
const longText = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function normalizeQna(value: unknown): Prisma.QnaSessionUncheckedCreateInput | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'object') throw new ValidationError('Invalid Q&A');
  const q = value as QnaInput;
  let sessionDate: Date | null = null;
  if (q.sessionDate) {
    const d = new Date(q.sessionDate);
    if (Number.isNaN(d.getTime())) throw new ValidationError('Session date is not a valid date');
    sessionDate = d;
  }
  const items = (Array.isArray(q.items) ? q.items : [])
    .map((i) => ({
      question: longText(i?.question, 2_000),
      askedBy: text(i?.askedBy, 120),
      answer: longText(i?.answer, 20_000),
      answeredBy: text(i?.answeredBy, 120),
    }))
    // Drop rows the editor left completely empty.
    .filter((i) => i.question || i.answer)
    .slice(0, 200);
  return {
    postId: 0, // set by the caller
    subject: text(q.subject, 255) ?? '',
    subjectType: (QNA_SUBJECTS as readonly string[]).includes(q.subjectType ?? '') ? q.subjectType! : 'band',
    sessionDate,
    host: text(q.host, 255),
    items,
  };
}

const score = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || !Number.isFinite(n) ? null : Math.max(0, Math.min(100, Math.round(n)));
};

/** Validate everything up front so a bad review never leaves a half-saved post. */
export function prepareExtras(input: PostExtrasInput) {
  return {
    featuredImageFocus: normalizeFocus(input.featuredImageFocus),
    articleType: normalizeArticleType(input.articleType),
    videoUrl: normalizeVideoUrl(input.videoUrl),
    review: normalizeReview(input.review),
    qna: normalizeQna(input.qna),
    seo: input.seo && typeof input.seo === 'object'
      ? {
          focusKeyword: text(input.seo.focusKeyword, 191),
          seoScore: score(input.seo.seoScore),
          readabilityScore: score(input.seo.readabilityScore),
        }
      : undefined,
  };
}

export type PreparedExtras = ReturnType<typeof prepareExtras>;

/** A published or scheduled review must say what it reviews (Review markup needs it). */
export function assertPublishable(extras: PreparedExtras, articleType: string, status: string): void {
  if (status !== 'published' && status !== 'scheduled') return;
  if (articleType === 'review' && extras.review && (!extras.review.artist || !extras.review.subjectTitle)) {
    throw new ValidationError('Add the artist and the album or track title before publishing a review');
  }
  if (articleType === 'qna' && extras.qna) {
    const items = extras.qna.items as { question: string; answer: string }[];
    if (!extras.qna.subject) throw new ValidationError('Add who is answering before publishing a Q&A');
    if (!items.some((i) => i.question && i.answer)) throw new ValidationError('Add at least one answered question before publishing a Q&A');
  }
}

/** Write the review and SEO rows for a post inside the caller's transaction. */
export async function saveExtras(tx: Prisma.TransactionClient, postId: number, extras: PreparedExtras): Promise<void> {
  if (extras.review === null) {
    await tx.review.deleteMany({ where: { postId } });
  } else if (extras.review) {
    const { postId: _ignored, ...data } = extras.review;
    await tx.review.upsert({ where: { postId }, create: { ...data, postId }, update: data });
  }
  if (extras.qna === null) {
    await tx.qnaSession.deleteMany({ where: { postId } });
  } else if (extras.qna) {
    const { postId: _ignored, ...data } = extras.qna;
    await tx.qnaSession.upsert({ where: { postId }, create: { ...data, postId }, update: data });
  }
  if (extras.seo) {
    await tx.seoMetadata.upsert({ where: { postId }, create: { postId, ...extras.seo }, update: extras.seo });
  }
}
