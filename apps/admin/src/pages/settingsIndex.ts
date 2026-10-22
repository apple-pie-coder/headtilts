/**
 * Searchable list of settings: which tab each lives on, the element to focus
 * (input id) or, failing that, the section heading to scroll to.
 * Keep in step with Settings.tsx when adding fields.
 */
export interface SettingEntry {
  tab: 'General' | 'Reading' | 'Discussion' | 'Media' | 'Permalinks' | 'Analytics' | 'Email' | 'Telegram' | 'Notifications';
  label: string;
  section: string;
  id?: string;
  keywords?: string;
}

export const SETTINGS_INDEX: SettingEntry[] = [
  // Analytics
  { tab: 'Analytics', section: 'Google Analytics', label: 'Google Analytics Measurement ID', id: 'ga_measurement_id', keywords: 'ga4 gtag tracking stats visitors traffic google' },
  { tab: 'Analytics', section: 'Google Analytics', label: 'Cookie consent banner', keywords: 'gdpr privacy cookies analytics consent' },
  { tab: 'Analytics', section: 'Google Analytics', label: 'Don’t count your own visits', id: 'ga_exclude_staff', keywords: 'staff admin exclude analytics' },
  // General
  { tab: 'General', section: 'Site Identity', label: 'Site title', id: 'site_title', keywords: 'name brand' },
  { tab: 'General', section: 'Site Identity', label: 'Tagline', id: 'site_tagline', keywords: 'slogan subtitle' },
  { tab: 'General', section: 'Site Identity', label: 'Show tagline next to the logo', id: 'show_tagline' },
  { tab: 'General', section: 'Site Identity', label: 'Logo', keywords: 'brand image header' },
  { tab: 'General', section: 'Site Identity', label: 'Dark mode logo', keywords: 'brand image night' },
  { tab: 'General', section: 'Site Identity', label: 'Site favicon', keywords: 'icon tab browser' },
  { tab: 'General', section: 'Site Identity', label: 'Admin favicon', keywords: 'icon tab browser' },
  { tab: 'General', section: 'Site Identity', label: 'Collapsed sidebar icon', keywords: 'logo admin rail mark' },
  { tab: 'General', section: 'Site Identity', label: 'Public logo height', id: 'site_logo_height', keywords: 'size' },
  { tab: 'General', section: 'Site Identity', label: 'Admin logo height', id: 'admin_logo_height', keywords: 'size sidebar' },
  { tab: 'General', section: 'Site Identity', label: 'Site description', id: 'site_description', keywords: 'seo meta about' },
  { tab: 'General', section: 'Administration', label: 'Administration email address', id: 'admin_email', keywords: 'contact owner' },
  { tab: 'General', section: 'Administration', label: 'Show breadcrumb navigation', id: 'show_breadcrumbs' },
  { tab: 'General', section: 'Visual Effects', label: 'Public site background effect', id: 'background_effect', keywords: 'animation' },
  { tab: 'General', section: 'Date & Time', label: 'Timezone', id: 'timezone', keywords: 'time zone clock' },
  { tab: 'General', section: 'Date & Time', label: 'Date format', keywords: 'dates' },
  { tab: 'General', section: 'Date & Time', label: 'Time format', keywords: 'clock 24 hour' },
  { tab: 'General', section: 'Date & Time', label: 'Week starts on', id: 'week_starts_on', keywords: 'monday sunday calendar' },

  // Reading
  { tab: 'Reading', section: 'Front Page Displays', label: 'Front page displays', keywords: 'homepage home latest posts static' },
  { tab: 'Reading', section: 'Content', label: 'Blog pages show at most', id: 'posts_per_page', keywords: 'posts per page pagination' },
  { tab: 'Reading', section: 'Content', label: 'Feeds show the most recent', id: 'posts_per_rss', keywords: 'rss feed syndication' },
  { tab: 'Reading', section: 'Special Pages', label: 'Contact, About, Privacy and Terms pages', keywords: 'privacy policy terms about contact' },
  { tab: 'Reading', section: 'Table of Contents', label: 'Automatic table of contents', id: 'toc_enabled', keywords: 'toc headings' },
  { tab: 'Reading', section: 'Search Engine Visibility', label: 'Discourage search engines', id: 'search_engine_visibility', keywords: 'seo google noindex robots' },

  // Discussion
  { tab: 'Discussion', section: 'Default Post Settings', label: 'Allow comments on new posts', id: 'default_comment_status' },
  { tab: 'Discussion', section: 'Other Comment Settings', label: 'Comment author must fill out name and email', id: 'require_name_email' },
  { tab: 'Discussion', section: 'Other Comment Settings', label: 'Close comments on old posts', keywords: 'days auto close' },
  { tab: 'Discussion', section: 'Other Comment Settings', label: 'Hold first-time commenters for moderation', id: 'moderate_first_comment', keywords: 'spam approve' },
  { tab: 'Discussion', section: 'Other Comment Settings', label: 'Comments must be manually approved', id: 'comment_moderation', keywords: 'spam approve' },
  { tab: 'Discussion', section: 'Email Me Whenever', label: 'Email me when anyone comments', id: 'notify_author', keywords: 'notification' },
  { tab: 'Discussion', section: 'Email Me Whenever', label: 'Email me when a comment is held', id: 'notify_moderation', keywords: 'notification moderation' },
  { tab: 'Discussion', section: 'Avatars', label: 'Show avatars', id: 'show_avatars', keywords: 'gravatar profile picture' },

  // Media
  { tab: 'Media', section: 'Image Sizes', label: 'Thumbnail size', id: 'thumb_w', keywords: 'image width height' },
  { tab: 'Media', section: 'Image Sizes', label: 'Crop thumbnails', id: 'thumbnail_crop' },
  { tab: 'Media', section: 'Image Sizes', label: 'Medium image size', id: 'medium_w', keywords: 'width height' },
  { tab: 'Media', section: 'Image Sizes', label: 'Large image size', id: 'large_w', keywords: 'width height' },
  { tab: 'Media', section: 'Uploading Files', label: 'Maximum upload size', id: 'max_upload_size', keywords: 'file limit mb' },
  { tab: 'Media', section: 'Uploading Files', label: 'Organise uploads into month/year folders', id: 'uploads_use_yearmonth' },
  { tab: 'Media', section: 'Allowed File Types', label: 'Allowed file types', keywords: 'mime pdf svg upload formats' },
  { tab: 'Media', section: 'Image Delivery', label: 'Image delivery format', id: 'media_format', keywords: 'webp avif convert' },
  { tab: 'Media', section: 'Image Delivery', label: 'Compression quality', id: 'media_quality', keywords: 'jpeg size optimise' },

  // Permalinks
  { tab: 'Permalinks', section: 'Permalinks', label: 'Permalink structure', keywords: 'url slug links post address' },

  // Email
  { tab: 'Email', section: 'Email Sending', label: 'Send email through SMTP', keywords: 'mail smtp' },
  { tab: 'Email', section: 'Server', label: 'SMTP host', id: 'smtp_host', keywords: 'mail server' },
  { tab: 'Email', section: 'Server', label: 'SMTP port and security', id: 'smtp_port', keywords: 'tls ssl' },
  { tab: 'Email', section: 'Credentials', label: 'SMTP username', id: 'smtp_user', keywords: 'login' },
  { tab: 'Email', section: 'Credentials', label: 'SMTP password', id: 'smtp_pass', keywords: 'login' },
  { tab: 'Email', section: 'Sender', label: 'From address', id: 'smtp_from', keywords: 'sender reply' },
  { tab: 'Email', section: 'Email Sending', label: 'Send a test email', keywords: 'check smtp test' },

  // Telegram
  { tab: 'Telegram', section: 'Posting', label: 'Post to a Telegram channel', keywords: 'telegram channel announce share social auto post' },
  { tab: 'Telegram', section: 'Bot and channel', label: 'Telegram bot token', id: 'telegram_bot_token', keywords: 'botfather telegram token' },
  { tab: 'Telegram', section: 'Bot and channel', label: 'Telegram channel', id: 'telegram_chat_id', keywords: 'telegram channel chat id username' },
  { tab: 'Telegram', section: 'What gets posted', label: 'Which posts, events and polls go to Telegram', keywords: 'telegram news reviews interviews articles events polls types' },
  { tab: 'Telegram', section: 'What gets posted', label: 'Telegram live blog updates', id: 'telegram_live_updates', keywords: 'telegram live blog thread replies' },
  { tab: 'Telegram', section: 'What gets posted', label: 'Send Telegram messages silently', id: 'telegram_silent', keywords: 'telegram notification sound quiet' },
  { tab: 'Telegram', section: 'Recent messages', label: 'Telegram messages sent and failed', keywords: 'telegram log history retry failed' },

  // Notifications
  { tab: 'Notifications', section: 'Notification Preferences', label: 'Notification preferences', keywords: 'alerts email in-app bell' },
];

export function searchSettings(query: string): SettingEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return SETTINGS_INDEX
    .map((e) => {
      const hay = `${e.label} ${e.section} ${e.tab} ${e.keywords ?? ''}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return null;
      // Rank label matches above keyword-only matches.
      const score = words.reduce((n, w) => n + (e.label.toLowerCase().includes(w) ? 2 : 1), 0);
      return { e, score };
    })
    .filter((x): x is { e: SettingEntry; score: number } => !!x)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.e);
}
