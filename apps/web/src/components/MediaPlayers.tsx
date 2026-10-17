import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faPlay } from '@fortawesome/free-solid-svg-icons';
import {
  faAmazon, faBandcamp, faDeezer, faItunesNote, faSoundcloud, faSpotify, faTidal, faYoutube,
} from '@fortawesome/free-brands-svg-icons';
import { EMBED_HOSTS, STREAMING_SERVICES, toEmbed } from '@headtilts/shared';
import type { StreamingService } from '@headtilts/shared';
import './MediaPlayers.css';

export const STREAMING_ICONS: Record<StreamingService, IconDefinition> = {
  spotify: faSpotify, appleMusic: faItunesNote, youtubeMusic: faYoutube, youtube: faYoutube, bandcamp: faBandcamp,
  soundcloud: faSoundcloud, deezer: faDeezer, tidal: faTidal, amazonMusic: faAmazon,
};

const serviceLabel = (key: StreamingService) => STREAMING_SERVICES.find((s) => s.key === key)?.label ?? key;

function allowedSrc(src: string): boolean {
  try {
    const u = new URL(src);
    return u.protocol === 'https:' && EMBED_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Click-to-play YouTube. Until the reader presses play we show only the
 * thumbnail, so no YouTube scripts or cookies load with the page.
 */
export function YouTubePlayer({ videoId, title, start = 0 }: { videoId: string; title: string; start?: number }) {
  const [playing, setPlaying] = useState(false);
  if (playing) {
    return (
      <div className="media-frame media-frame--video">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0${start ? `&start=${start}` : ''}`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    );
  }
  return (
    <button type="button" className="media-frame media-frame--video yt-lite" onClick={() => setPlaying(true)} aria-label={`Play video: ${title}`}>
      <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="" loading="lazy" />
      <span className="yt-lite-play" aria-hidden="true"><FontAwesomeIcon icon={faPlay} /></span>
    </button>
  );
}

/**
 * Any supported streaming/video link as an on-page player. Third-party
 * players load only after a click; links we can't embed fall back to a button.
 */
export function StreamingPlayer({ url, title, cover }: { url: string; title: string; cover?: string | null }) {
  const [loaded, setLoaded] = useState(false);
  const embed = toEmbed(url);
  if (!embed || !allowedSrc(embed.src)) return null;
  if (embed.provider === 'youtube' && embed.videoId) {
    const start = Number(new URL(embed.src).searchParams.get('start') ?? 0);
    return <YouTubePlayer videoId={embed.videoId} title={title} start={start} />;
  }
  const label = serviceLabel(embed.provider);
  if (loaded) {
    return (
      <div className="media-frame" style={{ height: embed.height ?? 352 }}>
        <iframe
          src={embed.src}
          title={`${title} on ${label}`}
          height={embed.height ?? 352}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
        />
      </div>
    );
  }
  return (
    <button type="button" className={`stream-lite stream-lite--${embed.provider}`} onClick={() => setLoaded(true)}>
      {cover && <img src={cover} alt="" className="stream-lite-cover" loading="lazy" />}
      <span className="stream-lite-icon" aria-hidden="true"><FontAwesomeIcon icon={STREAMING_ICONS[embed.provider]} /></span>
      <span className="stream-lite-text">
        <strong>Listen on {label}</strong>
        <small>Loads the {label} player</small>
      </span>
      <span className="stream-lite-play" aria-hidden="true"><FontAwesomeIcon icon={faPlay} /></span>
    </button>
  );
}
