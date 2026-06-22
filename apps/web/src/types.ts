export interface Author {
  id: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  bio?: string | null;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  parentId?: number | null;
  icon?: string | null;
  showSidebar?: boolean;
  _count?: { posts: number };
}

export interface Tag {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  _count?: { posts: number };
}

export interface PostSummary {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  type: string;
  parentId?: number | null;
  publishedAt: string | null;
  updatedAt: string;
  featuredImage: string | null;
  template?: string | null;
  isFeatured?: boolean;
  showSidebar?: boolean;
  author: Author | null;
  coAuthors: { user: Author }[];
  categories: { category: Category }[];
  tags: { tag: Tag }[];
}

export interface PostFull extends PostSummary {
  content: string;
  showToc?: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface PostListResult {
  items: PostSummary[];
  pagination: Pagination;
}

export interface MenuItem {
  id: number;
  parentId: number | null;
  title: string;
  url: string | null;
  position: number;
}

export interface Menu {
  id: number;
  name: string;
  location: string;
  items: MenuItem[];
}

export interface SiteSettings {
  site_title: string;
  site_tagline: string;
  show_tagline: string;
  site_logo: string;
  site_logo_dark: string;
  site_logo_height?: string;
  admin_logo_height?: string;
  site_favicon?: string;
  admin_favicon?: string;
  site_description: string;
  timezone: string;
  date_format: string;
  time_format: string;
  posts_per_page: string;
  front_page_display: string;
  search_engine_visibility?: string;
  permalink_structure?: string;
  toc_enabled?: string;
  show_breadcrumbs?: string;
  background_effect?: string;
  event_carousel_autoplay?: string;
  event_carousel_interval?: string;
  event_carousel_pause_on_hover?: string;
  event_carousel_loop?: string;
  event_carousel_show_arrows?: string;
  event_carousel_show_dots?: string;
  event_carousel_count?: string;
  event_carousel_transition?: string;
  front_page_id: string;
  posts_page_id: string;
  contact_page_id: string;
  about_page_id: string;
  privacy_policy_page_id: string;
  terms_page_id: string;
  // Resolved page slugs (populated by API alongside the IDs)
  front_page_slug?: string;
  posts_page_slug?: string;
  contact_page_slug?: string;
  about_page_slug?: string;
  privacy_policy_page_slug?: string;
  terms_page_slug?: string;
}

export interface CommentReactionSummary {
  emoji: string;
  count: number;
  reacted: boolean;
}

export interface PublicComment {
  id: number;
  parentId: number | null;
  authorName: string;
  avatarUrl: string | null;
  content: string;
  createdAt: string;
  status?: string;
  reactions: CommentReactionSummary[];
}

export interface CommentListResult {
  open: boolean;
  requireNameEmail: boolean;
  total: number;
  items: PublicComment[];
}

export interface CalendarMonth {
  year: number;
  month: number;
  weekStartsOn: number;
  days: Record<number, number>;
  prev: { year: number; month: number } | null;
  next: { year: number; month: number } | null;
}

export type CelebrationType = 'birthday' | 'remembrance';

export interface Celebration {
  id: number;
  name: string;
  type: CelebrationType;
  month: number;
  day: number;
  year: number | null;
  photo: string | null;
  message: string | null;
}

export interface TodaysCelebrations {
  date: string; // YYYY-MM-DD in the site timezone
  items: Celebration[];
}

export interface PublicWidget {
  id: number;
  type: string;
  title: string | null;
  config: Record<string, unknown>;
  data: unknown;
}

export interface PublicWidgetZone {
  name: string;
  description: string | null;
  widgets: PublicWidget[];
}

export interface AuthorProfile {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  bio: string | null;
  website: string | null;
  location: string | null;
  twitterUrl: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  instagramUrl: string | null;
}

export interface AuthorProfileResult {
  author: AuthorProfile;
  posts: PostListResult;
}

// ─── Events ──────────────────────────────────────────────────────────────────

export interface EventTicketTier {
  id: number;
  name: string;
  description?: string | null;
  price: number;
  currency: string;
  quantity: number | null;
  soldCount: number;
  availableFrom?: string | null;
  availableUntil?: string | null;
  perOrderMin: number;
  perOrderMax: number;
}

export interface EventSpeaker {
  id: number;
  name: string;
  bio?: string | null;
  photo?: string | null;
  designation?: string | null;
  company?: string | null;
  socialLinks?: Record<string, string> | null;
  position: number;
}

export interface EventAgendaItem {
  id: number;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  type: string;
  speakerId?: number | null;
  position: number;
}

export interface EventCustomField {
  id: number;
  label: string;
  fieldType: string;
  options?: string[] | null;
  required: boolean;
  position: number;
}

export interface EventSummary {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  startAt: string;
  endAt: string;
  timezone: string;
  type: string;
  status: string;
  featuredImage: string | null;
  bannerImage: string | null;
  venueName: string | null;
  venueCity: string | null;
  venueState: string | null;
  venueCountry: string | null;
  streamUrl: string | null;
  streamPlatform: string | null;
  isFeatured: boolean;
  isRegistrationRequired: boolean;
  maxAttendees: number | null;
  showAttendeesCount: boolean;
  registrationDeadline: string | null;
  ticketTiers: EventTicketTier[];
  speakers: EventSpeaker[];
  agendaItems: EventAgendaItem[];
  customFields: EventCustomField[];
  _count: { registrations: number };
}

export interface EventFull extends EventSummary {
  description: string | null;
  venueAddress: string | null;
  venueMapEmbed: string | null;
  showAttendeesNames: boolean;
  requireApproval: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImage: string | null;
  attendees: { name: string; email: string }[] | null;
}

export interface EventListResult {
  items: EventSummary[];
  pagination: Pagination;
}

export interface EventRegistrationResult {
  registration: { id: number; ticketCode: string; status: string; quantity: number };
  requiresPayment: boolean;
  orderId?: string;
  amount?: number;
  currency?: string;
  keyId?: string;
}
