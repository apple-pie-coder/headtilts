// Recognises YouTube and music-streaming links and turns them into embeddable
// player URLs. Shared by the API (validation), the admin (previews) and the
// public site (players), so a link that previews in the editor plays on the site.

export type StreamingService =
  | 'spotify' | 'appleMusic' | 'youtubeMusic' | 'youtube' | 'bandcamp'
  | 'soundcloud' | 'deezer' | 'tidal' | 'amazonMusic';

export interface StreamingServiceInfo {
  key: StreamingService;
  label: string;
  /** Brand colour, used only for the small service marker — never for text. */
  color: string;
}

/** Display order for "Listen on" buttons. */
export const STREAMING_SERVICES: StreamingServiceInfo[] = [
  { key: 'spotify', label: 'Spotify', color: '#1db954' },
  { key: 'appleMusic', label: 'Apple Music', color: '#fa2d48' },
  { key: 'youtubeMusic', label: 'YouTube Music', color: '#ff0000' },
  { key: 'youtube', label: 'YouTube', color: '#ff0000' },
  { key: 'bandcamp', label: 'Bandcamp', color: '#1da0c3' },
  { key: 'soundcloud', label: 'SoundCloud', color: '#ff5500' },
  { key: 'deezer', label: 'Deezer', color: '#a238ff' },
  { key: 'tidal', label: 'TIDAL', color: '#000000' },
  { key: 'amazonMusic', label: 'Amazon Music', color: '#25d1da' },
];

export type StreamingLinks = Partial<Record<StreamingService, string>>;

export const ARTICLE_TYPES = ['article', 'news', 'review', 'qna', 'live'] as const;
export type ArticleType = (typeof ARTICLE_TYPES)[number];

export const REVIEW_SUBJECTS = ['album', 'ep', 'single'] as const;
export type ReviewSubject = (typeof REVIEW_SUBJECTS)[number];

/** Who answers in a Q&A session. */
export const QNA_SUBJECTS = ['band', 'artist', 'person'] as const;
export type QnaSubject = (typeof QNA_SUBJECTS)[number];

export interface QnaItem {
  question: string;
  /** Who asked, e.g. a fan's name or the interviewer. */
  askedBy?: string | null;
  answer: string;
  /** Which member answered, when a band answers. */
  answeredBy?: string | null;
}

export const REVIEW_RATING_MAX = 10;

function parse(url: string): URL | null {
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

const host = (u: URL) => u.hostname.replace(/^www\.|^m\./, '').toLowerCase();

/** Which streaming service a link belongs to, or null if it isn't one we know. */
export function detectStreamingService(url: string): StreamingService | null {
  const u = parse(url);
  if (!u) return null;
  const h = host(u);
  if (h === 'open.spotify.com' || h === 'spotify.link') return 'spotify';
  if (h === 'music.apple.com' || h === 'embed.music.apple.com') return 'appleMusic';
  if (h === 'music.youtube.com') return 'youtubeMusic';
  if (h === 'youtube.com' || h === 'youtu.be' || h === 'youtube-nocookie.com') return 'youtube';
  if (h === 'bandcamp.com' || h.endsWith('.bandcamp.com')) return 'bandcamp';
  if (h === 'soundcloud.com' || h === 'on.soundcloud.com') return 'soundcloud';
  if (h === 'deezer.com' || h === 'deezer.page.link' || h === 'link.deezer.com') return 'deezer';
  if (h === 'tidal.com' || h === 'listen.tidal.com') return 'tidal';
  if (h === 'music.amazon.com' || h.startsWith('music.amazon.')) return 'amazonMusic';
  return null;
}

/** The 11-character video id from any common YouTube URL shape, or null. */
export function youtubeId(url: string): string | null {
  const u = parse(url);
  if (!u) return null;
  const h = host(u);
  let id: string | null = null;
  if (h === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (h === 'youtube.com' || h === 'music.youtube.com' || h === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      id = m ? m[1] : null;
    }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

/** Start offset in seconds from ?t= / ?start= (e.g. 90, "1m30s"). */
export function youtubeStart(url: string): number {
  const u = parse(url);
  const raw = u?.searchParams.get('t') ?? u?.searchParams.get('start');
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

export interface EmbedInfo {
  provider: StreamingService;
  /** iframe src (privacy-friendly variant where one exists). */
  src: string;
  /** Fixed player height in px, or null for a 16:9 video frame. */
  height: number | null;
  /** YouTube only: video id, for thumbnails. */
  videoId?: string;
}

/**
 * Embeddable player for a link, or null when the service has no embeddable
 * form for it (Bandcamp needs a numeric album id, Amazon has no public embed).
 */
export function toEmbed(url: string): EmbedInfo | null {
  const service = detectStreamingService(url);
  const u = parse(url);
  if (!service || !u) return null;

  if (service === 'youtube' || service === 'youtubeMusic') {
    const id = youtubeId(url);
    if (!id) return null;
    const start = youtubeStart(url);
    return {
      provider: 'youtube',
      src: `https://www.youtube-nocookie.com/embed/${id}?rel=0${start ? `&start=${start}` : ''}`,
      height: null,
      videoId: id,
    };
  }
  if (service === 'spotify') {
    const m = u.pathname.match(/^\/(?:intl-[a-z-]+\/)?(album|track|playlist|artist|episode|show)\/([A-Za-z0-9]+)/);
    if (!m) return null;
    const tall = m[1] === 'album' || m[1] === 'playlist' || m[1] === 'artist' || m[1] === 'show';
    return { provider: 'spotify', src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, height: tall ? 352 : 152 };
  }
  if (service === 'appleMusic') {
    if (!/\/(album|playlist|song|music-video)\//.test(u.pathname)) return null;
    const isSong = /\/song\//.test(u.pathname) || u.searchParams.has('i');
    return { provider: 'appleMusic', src: `https://embed.music.apple.com${u.pathname}${u.search}`, height: isSong ? 175 : 450 };
  }
  if (service === 'soundcloud') {
    const isSet = /\/sets\//.test(u.pathname);
    return {
      provider: 'soundcloud',
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(`https://soundcloud.com${u.pathname}`)}&color=%23ff5500&visual=false`,
      height: isSet ? 450 : 166,
    };
  }
  if (service === 'deezer') {
    const m = u.pathname.match(/\/(album|track|playlist)\/(\d+)/);
    return m ? { provider: 'deezer', src: `https://widget.deezer.com/widget/auto/${m[1]}/${m[2]}`, height: m[1] === 'track' ? 150 : 300 } : null;
  }
  if (service === 'tidal') {
    const m = u.pathname.match(/\/(album|track|playlist)\/([\w-]+)/);
    return m ? { provider: 'tidal', src: `https://embed.tidal.com/${m[1]}s/${m[2]}`, height: m[1] === 'track' ? 120 : 300 } : null;
  }
  if (service === 'bandcamp' && u.hostname === 'bandcamp.com' && u.pathname.startsWith('/EmbeddedPlayer/')) {
    return { provider: 'bandcamp', src: url, height: 120 };
  }
  return null;
}

/** Hosts allowed in a player iframe src. Anything else is never rendered. */
export const EMBED_HOSTS = [
  'www.youtube-nocookie.com', 'www.youtube.com', 'open.spotify.com', 'embed.music.apple.com',
  'w.soundcloud.com', 'widget.deezer.com', 'embed.tidal.com', 'bandcamp.com',
];

/** Plain-English reading of a 0–10 review score. */
export function ratingWord(r: number): string {
  if (r >= 9.5) return 'Masterpiece';
  if (r >= 9) return 'Essential';
  if (r >= 8) return 'Excellent';
  if (r >= 7) return 'Very good';
  if (r >= 6) return 'Good';
  if (r >= 5) return 'Decent';
  if (r >= 4) return 'Mediocre';
  if (r >= 2) return 'Poor';
  return 'Avoid';
}
