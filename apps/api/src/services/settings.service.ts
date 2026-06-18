import { prisma } from '../config/database';
import { ValidationError } from '../utils/errors';

const ALLOWED_SETTING_KEYS = new Set([
  'site_title', 'site_tagline', 'show_tagline', 'site_logo', 'site_logo_dark', 'site_logo_height', 'admin_logo_height', 'site_description',
  'admin_email', 'timezone', 'date_format', 'time_format', 'week_starts_on',
  'front_page_display', 'front_page_id', 'posts_page_id', 'contact_page_id', 'about_page_id',
  'posts_per_page', 'posts_per_rss', 'rss_content', 'search_engine_visibility', 'permalink_structure',
  'default_comment_status', 'require_name_email_for_comments', 'close_comments_days',
  'comment_moderation', 'moderate_first_comment', 'comment_notify_author',
  'comment_notify_moderation', 'show_avatars', 'default_avatar', 'avatar_rating',
  'thumbnail_size_w', 'thumbnail_size_h', 'thumbnail_crop',
  'medium_size_w', 'medium_size_h', 'large_size_w', 'large_size_h',
  'uploads_use_yearmonth', 'upload_allowed_mime', 'max_upload_size', 'media_format', 'media_quality',
  'toc_enabled',
]);

export async function getSettings() {
  return prisma.setting.findMany({ orderBy: { key: 'asc' } });
}

export async function updateSettings(updates: Record<string, string>) {
  const keys = Object.keys(updates);
  if (!keys.length) {
    throw new ValidationError('No settings provided to update');
  }

  const unknown = keys.filter((k) => !ALLOWED_SETTING_KEYS.has(k));
  if (unknown.length) {
    throw new ValidationError(`Unknown setting key(s): ${unknown.join(', ')}`);
  }

  await prisma.$transaction(
    keys.map((key) =>
      prisma.setting.upsert({
        where: { key },
        update: { value: updates[key] },
        create: { key, value: updates[key], type: 'string' },
      })
    )
  );

  return getSettings();
}
