import { useEffect } from 'react';
import { REVIEW_RATING_MAX, youtubeId } from '@headtilts/shared';
import { resolveMediaUrl } from '../services/api';
import type { Author, PostFull } from '../types';

/**
 * schema.org JSON-LD for a post, chosen by its editorial type:
 *   article → Article, news → NewsArticle, review → Review (of a MusicAlbum or
 *   MusicRecording). Every post also gets a BreadcrumbList, and a VideoObject
 *   when it has a featured YouTube video.
 */

type Json = Record<string, unknown>;

interface Context {
  siteTitle: string;
  siteLogo?: string | null;
  origin: string;
  url: string;
  authors: Author[];
}

const abs = (origin: string, path: string | null | undefined) => {
  if (!path) return undefined;
  const resolved = resolveMediaUrl(path);
  return /^https?:\/\//.test(resolved) ? resolved : `${origin}${resolved.startsWith('/') ? '' : '/'}${resolved}`;
};

const personName = (a: Author) => [a.firstName, a.lastName].filter(Boolean).join(' ') || a.username;
const textOnly = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export function postJsonLd(post: PostFull, ctx: Context): Json[] {
  const description = post.metaDescription || post.excerpt || textOnly(post.content).slice(0, 200) || undefined;
  const image = [abs(ctx.origin, post.ogImage || post.featuredImage)].filter(Boolean);
  const author = ctx.authors.map((a) => ({ '@type': 'Person', name: personName(a), url: `${ctx.origin}/authors/${a.username}` }));
  const publisher = {
    '@type': 'Organization',
    name: ctx.siteTitle,
    url: ctx.origin,
    ...(ctx.siteLogo ? { logo: { '@type': 'ImageObject', url: abs(ctx.origin, ctx.siteLogo) } } : {}),
  };
  const category = post.categories[0]?.category;
  const vid = post.videoUrl ? youtubeId(post.videoUrl) : null;
  const video: Json | undefined = vid ? {
    '@type': 'VideoObject',
    name: post.title,
    description: description ?? post.title,
    thumbnailUrl: [`https://i.ytimg.com/vi/${vid}/hqdefault.jpg`],
    uploadDate: post.publishedAt ?? post.updatedAt,
    embedUrl: `https://www.youtube-nocookie.com/embed/${vid}`,
    contentUrl: `https://www.youtube.com/watch?v=${vid}`,
  } : undefined;

  const common = {
    '@context': 'https://schema.org',
    url: ctx.url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': ctx.url },
    datePublished: post.publishedAt ?? undefined,
    dateModified: post.updatedAt,
    author,
    publisher,
    ...(image.length ? { image } : {}),
    ...(description ? { description } : {}),
    ...(video ? { video } : {}),
  };

  const r = post.review;
  let main: Json;
  if (post.articleType === 'review' && r && r.artist && r.subjectTitle) {
    const isTrack = r.subjectType === 'single';
    const item: Json = {
      '@type': isTrack ? 'MusicRecording' : 'MusicAlbum',
      name: r.subjectTitle,
      byArtist: { '@type': 'MusicGroup', name: r.artist },
      ...(r.releaseDate ? { datePublished: r.releaseDate.slice(0, 10) } : {}),
      ...(r.genre ? { genre: r.genre } : {}),
      ...(abs(ctx.origin, r.coverImage || post.featuredImage) ? { image: abs(ctx.origin, r.coverImage || post.featuredImage) } : {}),
      ...(!isTrack ? { albumReleaseType: `https://schema.org/${r.subjectType === 'ep' ? 'EPRelease' : 'AlbumRelease'}` } : {}),
      ...(!isTrack && r.tracklist?.length ? {
        numTracks: r.tracklist.length,
        track: {
          '@type': 'ItemList',
          numberOfItems: r.tracklist.length,
          itemListElement: r.tracklist.map((t, i) => ({
            '@type': 'ListItem', position: i + 1, item: { '@type': 'MusicRecording', name: t.title },
          })),
        },
      } : {}),
      ...(r.streaming ? { sameAs: Object.values(r.streaming) } : {}),
    };
    main = {
      ...common,
      '@type': 'Review',
      name: post.title,
      headline: post.title.slice(0, 110),
      itemReviewed: item,
      ...(r.rating != null ? { reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: REVIEW_RATING_MAX, worstRating: 0 } } : {}),
      ...(r.verdict ? { reviewBody: r.verdict } : {}),
    };
  } else if (post.articleType === 'qna' && post.qna?.subject) {
    // Google keeps FAQ/QA rich results for other site types; this still states
    // exactly who answered and what was asked.
    const q = post.qna;
    const who = { '@type': q.subjectType === 'band' ? 'MusicGroup' : 'Person', name: q.subject };
    main = {
      ...common,
      '@type': 'Article',
      headline: post.title.slice(0, 110),
      about: who,
      ...(category ? { articleSection: category.name } : {}),
      hasPart: q.items
        .filter((i) => i.question.trim() && i.answer.trim())
        .map((i, n) => ({
          '@type': 'Question',
          '@id': `${ctx.url}#q-${n + 1}`,
          name: i.question,
          ...(i.askedBy ? { author: { '@type': 'Person', name: i.askedBy } } : {}),
          acceptedAnswer: {
            '@type': 'Answer',
            text: i.answer,
            author: i.answeredBy ? { '@type': 'Person', name: i.answeredBy } : who,
          },
        })),
    };
  } else {
    main = {
      ...common,
      '@type': post.articleType === 'news' ? 'NewsArticle' : 'Article',
      headline: post.title.slice(0, 110),
      ...(category ? { articleSection: category.name } : {}),
      ...(post.tags.length ? { keywords: post.tags.map((t) => t.tag.name).join(', ') } : {}),
    };
  }

  const crumbs = [
    { name: 'Home', item: `${ctx.origin}/` },
    ...(category ? [{ name: category.name, item: `${ctx.origin}/categories/${category.slug}` }] : []),
    { name: post.title, item: ctx.url },
  ];
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  };

  return [main, breadcrumb];
}

/** Keep one JSON-LD script in <head> in sync with `data`; removed on unmount. */
export function useJsonLd(id: string, data: Json[] | null) {
  const json = data ? JSON.stringify(data.length === 1 ? data[0] : data) : null;
  useEffect(() => {
    if (!json) return;
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = id;
    // "</" would let a crafted title close the script tag early.
    el.textContent = json.replace(/</g, '\\u003c');
    document.getElementById(id)?.remove();
    document.head.appendChild(el);
    return () => el.remove();
  }, [id, json]);
}
