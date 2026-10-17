import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faAmazon, faBandcamp, faDeezer, faItunesNote, faSoundcloud, faSpotify, faTidal, faYoutube,
} from '@fortawesome/free-brands-svg-icons';
import type { StreamingService } from '@headtilts/shared';

export const STREAMING_ICONS: Record<StreamingService, IconDefinition> = {
  spotify: faSpotify,
  appleMusic: faItunesNote,
  youtubeMusic: faYoutube,
  youtube: faYoutube,
  bandcamp: faBandcamp,
  soundcloud: faSoundcloud,
  deezer: faDeezer,
  tidal: faTidal,
  amazonMusic: faAmazon,
};
