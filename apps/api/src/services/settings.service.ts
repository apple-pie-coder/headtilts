import { prisma } from '../config/database';
import { ValidationError } from '../utils/errors';
import { BACKUP_SETTING_KEYS } from './backup.settings';

const ALLOWED_SETTING_KEYS = new Set([
  'site_title', 'site_tagline', 'show_tagline', 'site_logo', 'site_logo_dark', 'site_logo_height', 'admin_logo_height', 'site_description',
  'admin_email', 'timezone', 'date_format', 'time_format', 'week_starts_on',
  'front_page_display', 'front_page_id', 'posts_page_id', 'contact_page_id', 'about_page_id',
  'privacy_policy_page_id', 'terms_page_id',
  'posts_per_page', 'posts_per_rss', 'rss_content', 'search_engine_visibility', 'permalink_structure',
  'default_comment_status', 'require_name_email_for_comments', 'close_comments_days',
  'comment_moderation', 'moderate_first_comment', 'comment_notify_author',
  'comment_notify_moderation', 'show_avatars', 'default_avatar', 'avatar_rating',
  'thumbnail_size_w', 'thumbnail_size_h', 'thumbnail_crop',
  'medium_size_w', 'medium_size_h', 'large_size_w', 'large_size_h',
  'uploads_use_yearmonth', 'upload_allowed_mime', 'max_upload_size', 'media_format', 'media_quality',
  'toc_enabled', 'show_breadcrumbs', 'background_effect',
  'smtp_enabled', 'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from',
  // Backup settings are NOT writable here — only via /backups/settings, which
  // requires the system_backup permission. Otherwise SETTING_EDIT could redirect
  // backups (full DB dumps) to an attacker-controlled S3 endpoint.
  // Favicons
  'site_favicon', 'admin_favicon',
  // Events carousel — managed via the gear icon on the Events admin page
  'event_carousel_autoplay', 'event_carousel_interval', 'event_carousel_pause_on_hover',
  'event_carousel_loop', 'event_carousel_show_arrows', 'event_carousel_show_dots',
  'event_carousel_count', 'event_carousel_transition',
]);

export async function getSettings() {
  // Backup settings (incl. S3 credentials) are served by /backups/settings only.
  return prisma.setting.findMany({
    where: { key: { notIn: [...BACKUP_SETTING_KEYS] } },
    orderBy: { key: 'asc' },
  });
}

/**
 * On first boot after the smtp_* keys were added to the allowlist, any SMTP
 * config that previously lived only in .env would have been silently rejected
 * when saved through the UI. This seeds those values from env vars so they
 * appear in database backups. skipDuplicates ensures it never overwrites a
 * value the user deliberately saved through the Settings UI.
 */
export async function seedSmtpFromEnv(): Promise<void> {
  const mappings: { key: string; envKey: string }[] = [
    { key: 'smtp_enabled', envKey: 'SMTP_ENABLED' },
    { key: 'smtp_host',    envKey: 'SMTP_HOST'    },
    { key: 'smtp_port',    envKey: 'SMTP_PORT'    },
    { key: 'smtp_secure',  envKey: 'SMTP_SECURE'  },
    { key: 'smtp_user',    envKey: 'SMTP_USER'    },
    { key: 'smtp_pass',    envKey: 'SMTP_PASS'    },
    { key: 'smtp_from',    envKey: 'SMTP_FROM'    },
  ];

  const data = mappings
    .filter(({ envKey }) => Boolean(process.env[envKey]))
    .map(({ key, envKey }) => ({ key, value: process.env[envKey]!, type: 'string' }));

  if (!data.length) return;

  const { count } = await prisma.setting.createMany({ data, skipDuplicates: true });
  if (count > 0) {
    console.log(`✓ Seeded ${count} SMTP setting(s) from environment into the database`);
  }
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
