import React, { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faSliders, faBookOpen, faComments, faImage, faLink, faChartLine, faEnvelope, faBell,
} from '@fortawesome/free-solid-svg-icons';
import { faTelegram } from '@fortawesome/free-brands-svg-icons';
import { AxiosError } from 'axios';
import { AdminLayout } from '../components/AdminLayout';
import { MediaLibraryModal } from '../components/MediaLibraryModal';
import { resolveMediaUrl } from '../services/media';
import { useToast } from '../components/ToastContext';
import { fetchSettings, updateSettings, sendTestEmail } from '../services/settings';
import { fetchPosts } from '../services/posts';
import {
  fetchNotificationPreferences, updateNotificationPreferences, sendTestNotification,
  NotificationPreference, NotificationChannel,
} from '../services/notifications';
import { Post, Setting } from '../types';
import { PageHeader } from '../components/ui';
import { EmailPreviews } from '../components/EmailPreviews';
import { TelegramDeliveries } from '../components/TelegramDeliveries';
import { sendTelegramTest } from '../services/telegram';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { SettingsSearch, revealSetting } from './SettingsSearch';
import styles from './Settings.module.css';

// ---------------------------------------------------------------------------
// Date / time format preview (PHP-style)
// ---------------------------------------------------------------------------

const SAMPLE_DATE = new Date(2026, 5, 9, 16, 45, 0);

const MONTHS_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS_FULL    = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAYS_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function previewFormat(format: string, date: Date = SAMPLE_DATE): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const h12 = date.getHours() % 12 || 12;
  const tokens: Record<string, string> = {
    Y: String(date.getFullYear()), y: String(date.getFullYear()).slice(-2),
    m: pad(date.getMonth() + 1),  n: String(date.getMonth() + 1),
    F: MONTHS_FULL[date.getMonth()], M: MONTHS_SHORT[date.getMonth()],
    d: pad(date.getDate()), j: String(date.getDate()),
    l: DAYS_FULL[date.getDay()],  D: DAYS_SHORT[date.getDay()],
    H: pad(date.getHours()), G: String(date.getHours()),
    h: pad(h12), g: String(h12),
    i: pad(date.getMinutes()), s: pad(date.getSeconds()),
    a: date.getHours() < 12 ? 'am' : 'pm',
    A: date.getHours() < 12 ? 'AM' : 'PM',
  };
  return format.replace(
    /\\(.)|(Y|y|m|n|F|M|d|j|l|D|H|G|h|g|i|s|a|A)/g,
    (_whole, escaped?: string, token?: string) => {
      if (escaped !== undefined) return escaped;
      if (token !== undefined) return tokens[token] ?? _whole;
      return _whole;
    },
  );
}

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

const DATE_FORMAT_PRESETS = ['F j, Y', 'Y-m-d', 'm/d/Y', 'd/m/Y'];
const TIME_FORMAT_PRESETS = ['g:i a', 'g:i A', 'H:i'];

const PERMALINK_PRESETS = [
  { label: 'Plain',           structure: '/?p=%post_id%' },
  { label: 'Day and name',    structure: '/%year%/%monthnum%/%day%/%postname%/' },
  { label: 'Month and name',  structure: '/%year%/%monthnum%/%postname%/' },
  { label: 'Post name',       structure: '/%postname%/' },
];

const PERMALINK_SAMPLE: Record<string, string> = {
  '%year%': '2026', '%monthnum%': '06', '%day%': '09',
  '%postname%': 'sample-post', '%post_id%': '123',
  '%category%': 'sample-category', '%author%': 'admin',
};

function buildPermalinkPreview(structure: string): string {
  let preview = structure;
  for (const [tag, value] of Object.entries(PERMALINK_SAMPLE)) {
    preview = preview.split(tag).join(value);
  }
  return `https://example.com${preview}`;
}

const TIMEZONES: { group: string; options: { value: string; label: string }[] }[] = [
  { group: '', options: [{ value: 'UTC', label: 'UTC' }] },
  { group: 'Americas', options: [
    { value: 'America/New_York',    label: 'Eastern Time – New York' },
    { value: 'America/Chicago',     label: 'Central Time – Chicago' },
    { value: 'America/Denver',      label: 'Mountain Time – Denver' },
    { value: 'America/Phoenix',     label: 'Mountain Time – Phoenix (no DST)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time – Los Angeles' },
    { value: 'America/Anchorage',   label: 'Alaska – Anchorage' },
    { value: 'Pacific/Honolulu',    label: 'Hawaii – Honolulu' },
    { value: 'America/Toronto',     label: 'Eastern Time – Toronto' },
    { value: 'America/Vancouver',   label: 'Pacific Time – Vancouver' },
    { value: 'America/Sao_Paulo',   label: 'São Paulo' },
    { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires' },
    { value: 'America/Mexico_City', label: 'Central Time – Mexico City' },
  ]},
  { group: 'Europe', options: [
    { value: 'Europe/London',    label: 'London' },
    { value: 'Europe/Dublin',    label: 'Dublin' },
    { value: 'Europe/Lisbon',    label: 'Lisbon' },
    { value: 'Europe/Paris',     label: 'Paris' },
    { value: 'Europe/Berlin',    label: 'Berlin' },
    { value: 'Europe/Rome',      label: 'Rome' },
    { value: 'Europe/Madrid',    label: 'Madrid' },
    { value: 'Europe/Amsterdam', label: 'Amsterdam' },
    { value: 'Europe/Stockholm', label: 'Stockholm' },
    { value: 'Europe/Athens',    label: 'Athens' },
    { value: 'Europe/Helsinki',  label: 'Helsinki' },
    { value: 'Europe/Moscow',    label: 'Moscow' },
    { value: 'Europe/Istanbul',  label: 'Istanbul' },
  ]},
  { group: 'Asia', options: [
    { value: 'Asia/Dubai',     label: 'Dubai' },
    { value: 'Asia/Karachi',   label: 'Karachi' },
    { value: 'Asia/Kolkata',   label: 'Kolkata' },
    { value: 'Asia/Dhaka',     label: 'Dhaka' },
    { value: 'Asia/Bangkok',   label: 'Bangkok' },
    { value: 'Asia/Jakarta',   label: 'Jakarta' },
    { value: 'Asia/Shanghai',  label: 'Shanghai' },
    { value: 'Asia/Singapore', label: 'Singapore' },
    { value: 'Asia/Tokyo',     label: 'Tokyo' },
    { value: 'Asia/Seoul',     label: 'Seoul' },
  ]},
  { group: 'Oceania', options: [
    { value: 'Australia/Perth',     label: 'Perth' },
    { value: 'Australia/Sydney',    label: 'Sydney' },
    { value: 'Australia/Melbourne', label: 'Melbourne' },
    { value: 'Pacific/Auckland',    label: 'Auckland' },
    { value: 'Pacific/Fiji',        label: 'Fiji' },
  ]},
  { group: 'Africa', options: [
    { value: 'Africa/Cairo',        label: 'Cairo' },
    { value: 'Africa/Lagos',        label: 'Lagos' },
    { value: 'Africa/Johannesburg', label: 'Johannesburg' },
    { value: 'Africa/Nairobi',      label: 'Nairobi' },
  ]},
];

const WEEK_DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const MIME_OPTIONS: { group: string; items: [string, string][] }[] = [
  { group: 'Images', items: [['image/jpeg', 'JPEG'], ['image/png', 'PNG'], ['image/gif', 'GIF'], ['image/webp', 'WebP'], ['image/avif', 'AVIF'], ['image/svg+xml', 'SVG']] },
  { group: 'Documents', items: [['application/pdf', 'PDF']] },
  { group: 'Video', items: [['video/mp4', 'MP4'], ['video/webm', 'WebM']] },
  { group: 'Audio', items: [['audio/mpeg', 'MP3'], ['audio/wav', 'WAV']] },
];

const AVATAR_OPTIONS = [
  { value: 'mystery',          label: 'Mystery person', desc: 'A silhouette outline' },
  { value: 'blank',            label: 'Blank',          desc: 'A transparent image' },
  { value: 'gravatar_default', label: 'Gravatar logo',  desc: 'The Gravatar logo' },
  { value: 'identicon',        label: 'Identicon',      desc: 'A geometric pattern based on email' },
  { value: 'wavatar',          label: 'Wavatar',        desc: 'Generated faces' },
  { value: 'retro',            label: 'Retro',          desc: 'Pixelated faces' },
];

const AVATAR_RATINGS = [
  { value: 'G',  label: 'G — Suitable for all audiences' },
  { value: 'PG', label: 'PG — Possibly offensive, usually for audiences 13 and above' },
  { value: 'R',  label: 'R — Intended for adult audiences above 17' },
  { value: 'X',  label: 'X — Even more mature than above' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errMsg(err: unknown, fallback: string) {
  return (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback;
}

function g(all: Setting[], key: string, fallback = '') {
  return all.find((s) => s.key === key)?.value ?? fallback;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Pinned to the bottom of the screen inside each tab's form: says whether
 * there's anything to save, and holds the Save button (⌘S / Ctrl+S too).
 */
function SaveBar({ dirty, saving, disabled, label = 'Save changes', onSave, children }: {
  dirty?: boolean; saving: boolean; disabled: boolean; label?: string;
  onSave?: () => void; children?: ReactNode;
}) {
  return (
    <div className={`${styles.saveBar} ${dirty ? styles.saveBarDirty : ''}`} data-savebar>
      <span className={styles.saveStatus} aria-live="polite">
        {saving ? 'Saving…'
          : dirty ? <><span className={styles.saveDot} />Unsaved changes<kbd className={styles.saveKbd}>{isMac ? '⌘S' : 'Ctrl+S'}</kbd></>
          : dirty === false ? 'All changes saved' : null}
      </span>
      <div className={styles.saveActions}>
        {children}
        <button type={onSave ? 'button' : 'submit'} onClick={onSave} className={styles.saveButton} disabled={disabled} data-save>
          {saving ? 'Saving…' : label}
        </button>
      </div>
    </div>
  );
}

/** A logo or icon: preview on a checkerboard (dark for the dark-mode logo), choose or remove. */
function ImageTile({ label, hint, value, onChange, disabled, dark }: {
  label: string; hint: string; value: string; onChange: (url: string) => void; disabled?: boolean; dark?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.imageTile}>
      <div className={`${styles.imagePreview} ${dark ? styles.imagePreviewDark : ''}`}>
        {value
          ? <img src={resolveMediaUrl(value)} alt={`${label} preview`} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
          : <span className={styles.imageEmpty}>None</span>}
      </div>
      <div className={styles.imageBody}>
        <span className={styles.imageLabel}>{label}</span>
        <p className={styles.fieldHint}>{hint}</p>
        <div className={styles.imageActions}>
          <button type="button" className={styles.secondaryButton} onClick={() => setOpen(true)} disabled={disabled}>
            {value ? 'Replace…' : 'Choose…'}
          </button>
          {value && (
            <button type="button" className={styles.textButton} onClick={() => onChange('')} disabled={disabled}>Remove</button>
          )}
        </div>
      </div>
      {open && (
        <MediaLibraryModal
          onSelect={(media) => { onChange(media.url); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function CheckField({
  id, label, hint, checked, onChange, disabled,
}: {
  id: string; label: string; hint?: string; checked: boolean;
  onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label className={styles.checkRow} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className={styles.checkInput}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span>
        <span className={styles.checkLabel}>{label}</span>
        {hint && <span className={styles.fieldHint}>{hint}</span>}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const TABS = ['General', 'Reading', 'Discussion', 'Media', 'Permalinks', 'Analytics', 'Email', 'Telegram', 'Notifications'] as const;
type Tab = (typeof TABS)[number];

const TAB_META: Record<Tab, { icon: IconDefinition; desc: string; group: string }> = {
  General:       { icon: faSliders,   group: 'Site',         desc: 'Name, logos, icons, date and time' },
  Reading:       { icon: faBookOpen,  group: 'Site',         desc: 'Home page, feeds and search engines' },
  Permalinks:    { icon: faLink,      group: 'Site',         desc: 'How post addresses look' },
  Discussion:    { icon: faComments,  group: 'Content',      desc: 'Comments, moderation and avatars' },
  Media:         { icon: faImage,     group: 'Content',      desc: 'Image sizes, uploads and formats' },
  Analytics:     { icon: faChartLine, group: 'Integrations', desc: 'Google Analytics and visitor consent' },
  Email:         { icon: faEnvelope,  group: 'Integrations', desc: 'Outgoing mail server (SMTP)' },
  Telegram:      { icon: faTelegram,  group: 'Integrations', desc: 'Announce new posts in a channel' },
  Notifications: { icon: faBell,      group: 'You',          desc: 'What you’re alerted about, and how' },
};
const TAB_GROUPS = ['Site', 'Content', 'Integrations', 'You'];

/** Settings → Telegram: one switch per kind of content, in the order they're listed. */
const TELEGRAM_TYPES: { key: string; label: string; hint: string }[] = [
  { key: 'telegram_post_article', label: 'Articles', hint: '✍️ ARTICLE' },
  { key: 'telegram_post_news',    label: 'News', hint: '🗞 NEWS' },
  { key: 'telegram_post_review',  label: 'Reviews', hint: '💿 REVIEW, with the rating, verdict and streaming links' },
  { key: 'telegram_post_qna',     label: 'Interviews', hint: '🎙 INTERVIEW, with one question and answer' },
  { key: 'telegram_post_live',    label: 'Live blogs', hint: '🔴 LIVE NOW' },
  { key: 'telegram_post_event',   label: 'Events', hint: '📅 EVENT, with the date, venue and tickets' },
  { key: 'telegram_post_poll',    label: 'Polls', hint: '📊 POLL, listing the answers, with a Vote now button' },
];
const TELEGRAM_KEYS = ['telegram_enabled', 'telegram_bot_token', 'telegram_chat_id', ...TELEGRAM_TYPES.map((t) => t.key),
  'telegram_live_updates', 'telegram_include_image', 'telegram_category_tags', 'telegram_silent'];
const TELEGRAM_DEFAULTS: Record<string, string> = {
  ...Object.fromEntries(TELEGRAM_KEYS.map((k) => [k, 'yes'])),
  telegram_enabled: 'no', telegram_bot_token: '', telegram_chat_id: '', telegram_silent: 'no',
};
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export default function SettingsPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const initialTab = TABS.find((t) => t.toLowerCase() === params.get('tab')) ?? 'General';
  const [tab, setTab]     = useState<Tab>(initialTab);
  const navRef = useRef<HTMLElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  // ── Pages list (for Reading tab front-page pickers) ──
  const [pages, setPages] = useState<Post[]>([]);

  // ── General ──
  const [siteTitle,       setSiteTitle]       = useState('');
  const [siteTagline,     setSiteTagline]     = useState('');
  const [showTagline,     setShowTagline]     = useState('yes');
  const [showBreadcrumbs, setShowBreadcrumbs] = useState('yes');
  const [backgroundEffect, setBackgroundEffect] = useState('none');
  const [siteLogo,        setSiteLogo]        = useState('');
  const [siteLogoDark,    setSiteLogoDark]    = useState('');
  const [siteLogoHeight,  setSiteLogoHeight]  = useState('');
  const [adminLogoHeight, setAdminLogoHeight] = useState('');
  const [siteFavicon,     setSiteFavicon]     = useState('');
  const [adminFavicon,    setAdminFavicon]    = useState('');
  const [adminLogoIcon,   setAdminLogoIcon]   = useState('');
  const [siteDescription, setSiteDescription] = useState('');
  const [adminEmail,      setAdminEmail]      = useState('');
  const [timezone,        setTimezone]        = useState('UTC');
  const [dateFormat,      setDateFormat]      = useState('F j, Y');
  const [customDate,      setCustomDate]      = useState('');
  const [timeFormat,      setTimeFormat]      = useState('g:i a');
  const [customTime,      setCustomTime]      = useState('');
  const [weekStartsOn,    setWeekStartsOn]    = useState('0');
  const [savedGeneral,    setSavedGeneral]    = useState<Record<string, string>>({});

  // ── Reading ──
  const [frontPageDisplay, setFrontPageDisplay] = useState('posts');
  const [frontPageId,      setFrontPageId]      = useState('');
  const [postsPageId,      setPostsPageId]      = useState('');
  const [contactPageId,    setContactPageId]    = useState('');
  const [aboutPageId,      setAboutPageId]      = useState('');
  const [privacyPageId,    setPrivacyPageId]    = useState('');
  const [termsPageId,      setTermsPageId]      = useState('');
  const [postsPerPage,     setPostsPerPage]      = useState('10');
  const [postsPerRss,      setPostsPerRss]       = useState('10');
  const [rssContent,       setRssContent]        = useState('excerpt');
  const [searchVisibility, setSearchVisibility]  = useState('yes');
  const [tocEnabled,       setTocEnabled]        = useState('yes');
  const [savedReading,     setSavedReading]      = useState<Record<string, string>>({});

  // ── Discussion ──
  const [commentStatus,        setCommentStatus]        = useState('open');
  const [requireNameEmail,     setRequireNameEmail]     = useState('yes');
  const [closeCommentsDays,    setCloseCommentsDays]    = useState('0');
  const [moderateFirst,        setModerateFirst]        = useState('yes');
  const [commentModeration,    setCommentModeration]    = useState('no');
  const [notifyAuthor,         setNotifyAuthor]         = useState('yes');
  const [notifyModeration,     setNotifyModeration]     = useState('yes');
  const [showAvatars,          setShowAvatars]          = useState('yes');
  const [defaultAvatar,        setDefaultAvatar]        = useState('mystery');
  const [avatarRating,         setAvatarRating]         = useState('G');
  const [savedDiscussion,      setSavedDiscussion]      = useState<Record<string, string>>({});

  // ── Media ──
  const [thumbW,        setThumbW]        = useState('150');
  const [thumbH,        setThumbH]        = useState('150');
  const [thumbCrop,     setThumbCrop]     = useState('yes');
  const [mediumW,       setMediumW]       = useState('300');
  const [mediumH,       setMediumH]       = useState('300');
  const [largeW,        setLargeW]        = useState('1024');
  const [largeH,        setLargeH]        = useState('1024');
  const [useYearMonth,  setUseYearMonth]  = useState('yes');
  const [allowedMime,   setAllowedMime]   = useState('image/jpeg,image/png,image/gif,image/webp');
  const [maxUploadSize, setMaxUploadSize] = useState('10');
  const [mediaFormat,   setMediaFormat]   = useState('original');
  const [mediaQuality,  setMediaQuality]  = useState('82');
  const [savedMedia,    setSavedMedia]    = useState<Record<string, string>>({});

  // ── Permalinks ──
  const [structure,       setStructure]       = useState('/%postname%/');
  const [savedStructure,  setSavedStructure]  = useState('/%postname%/');
  const [customStructure, setCustomStructure] = useState('');

  // ── Email (SMTP) ──
  const [smtpEnabled, setSmtpEnabled] = useState('true');
  const [smtpHost,   setSmtpHost]   = useState('');
  const [smtpPort,   setSmtpPort]   = useState('587');
  const [smtpSecure, setSmtpSecure] = useState('false');
  const [smtpUser,   setSmtpUser]   = useState('');
  const [smtpPass,   setSmtpPass]   = useState('');
  const [smtpFrom,   setSmtpFrom]   = useState('');
  const [savedEmail, setSavedEmail] = useState<Record<string, string>>({});
  const [testingEmail, setTestingEmail] = useState(false);

  // ── Analytics ──
  const [gaId,           setGaId]           = useState('');
  const [gaConsent,      setGaConsent]      = useState('banner');
  const [gaExcludeStaff, setGaExcludeStaff] = useState('yes');
  const [savedAnalytics, setSavedAnalytics] = useState<Record<string, string>>({});

  // ── Telegram ──
  const [telegram, setTelegram] = useState<Record<string, string>>(TELEGRAM_DEFAULTS);
  const [savedTelegram, setSavedTelegram] = useState<Record<string, string>>(TELEGRAM_DEFAULTS);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const setTg = (key: string, value: string) => setTelegram((prev) => ({ ...prev, [key]: value }));
  const tgOn = (key: string) => telegram[key] === 'yes';

  // ── Notification preferences ──
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreference[]>([]);
  const [notifLoadError, setNotifLoadError] = useState<string | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);
  const [savingNotif, setSavingNotif] = useState(false);
  const [testingNotif, setTestingNotif] = useState<string | null>(null);

  useEffect(() => {
    load();
    fetchPosts(1, 100, { type: 'page', status: 'published' })
      .then((r) => setPages(r.items))
      .catch(() => {});
    // Opened straight on a tab that loads its own data (?tab=notifications)
    if (initialTab === 'Notifications') switchTab('Notifications');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phones show the tabs as one scrolling row: keep the current one in view.
  useEffect(() => {
    navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [tab]);

  // ⌘S / Ctrl+S saves the open tab.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 's') return;
      const button = document.querySelector<HTMLButtonElement>('[data-savebar] [data-save]');
      if (!button) return;
      e.preventDefault();
      if (!button.disabled) button.click();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function load() {
    setLoading(true);
    try {
      const all = await fetchSettings();

      // General
      const st   = g(all, 'site_title');
      const stag = g(all, 'site_tagline');
      const stg  = g(all, 'show_tagline', 'yes');
      const slg  = g(all, 'site_logo');
      const slgd = g(all, 'site_logo_dark');
      const slgh = g(all, 'site_logo_height');
      const algh = g(all, 'admin_logo_height');
      const sfav = g(all, 'site_favicon');
      const afav = g(all, 'admin_favicon');
      const alic = g(all, 'admin_logo_icon');
      const sd   = g(all, 'site_description');
      const em   = g(all, 'admin_email');
      const tz   = g(all, 'timezone', 'UTC');
      const df   = g(all, 'date_format', 'F j, Y');
      const tf   = g(all, 'time_format', 'g:i a');
      const wso  = g(all, 'week_starts_on', '0');
      const sb   = g(all, 'show_breadcrumbs', 'yes');
      const be   = g(all, 'background_effect', 'none');
      setSiteTitle(st); setSiteTagline(stag); setShowTagline(stg); setSiteLogo(slg); setSiteLogoDark(slgd);
      setSiteLogoHeight(slgh); setAdminLogoHeight(algh); setSiteFavicon(sfav); setAdminFavicon(afav); setAdminLogoIcon(alic);
      setSiteDescription(sd);
      setAdminEmail(em); setTimezone(tz); setDateFormat(df); setTimeFormat(tf);
      setWeekStartsOn(wso); setShowBreadcrumbs(sb); setBackgroundEffect(be);
      if (!DATE_FORMAT_PRESETS.includes(df)) setCustomDate(df);
      if (!TIME_FORMAT_PRESETS.includes(tf)) setCustomTime(tf);
      setSavedGeneral({ site_title: st, site_tagline: stag, show_tagline: stg, site_logo: slg, site_logo_dark: slgd,
        site_logo_height: slgh, admin_logo_height: algh, site_favicon: sfav, admin_favicon: afav, admin_logo_icon: alic,
        site_description: sd, admin_email: em, timezone: tz, date_format: df, time_format: tf,
        week_starts_on: wso, show_breadcrumbs: sb, background_effect: be });

      // Reading
      const fpd   = g(all, 'front_page_display', 'posts');
      const fpid  = g(all, 'front_page_id', '');
      const ppid  = g(all, 'posts_page_id', '');
      const cpid  = g(all, 'contact_page_id', '');
      const apid  = g(all, 'about_page_id', '');
      const ppid2 = g(all, 'privacy_policy_page_id', '');
      const tpid  = g(all, 'terms_page_id', '');
      const ppp   = g(all, 'posts_per_page', '10');
      const prss  = g(all, 'posts_per_rss', '10');
      const rc    = g(all, 'rss_content', 'excerpt');
      const sv    = g(all, 'search_engine_visibility', 'yes');
      const toc   = g(all, 'toc_enabled', 'yes');
      setFrontPageDisplay(fpd); setFrontPageId(fpid); setPostsPageId(ppid);
      setContactPageId(cpid); setAboutPageId(apid);
      setPrivacyPageId(ppid2); setTermsPageId(tpid);
      setPostsPerPage(ppp); setPostsPerRss(prss); setRssContent(rc); setSearchVisibility(sv); setTocEnabled(toc);
      setSavedReading({ front_page_display: fpd, front_page_id: fpid, posts_page_id: ppid,
        contact_page_id: cpid, about_page_id: apid,
        privacy_policy_page_id: ppid2, terms_page_id: tpid,
        posts_per_page: ppp, posts_per_rss: prss, rss_content: rc, search_engine_visibility: sv, toc_enabled: toc });

      // Analytics
      const gid = g(all, 'ga_measurement_id', '');
      const gcs = g(all, 'ga_consent', 'banner');
      const gex = g(all, 'ga_exclude_staff', 'yes');
      setGaId(gid); setGaConsent(gcs); setGaExcludeStaff(gex);
      setSavedAnalytics({ ga_measurement_id: gid, ga_consent: gcs, ga_exclude_staff: gex });

      // Telegram
      const tg = Object.fromEntries(TELEGRAM_KEYS.map((k) => [k, g(all, k, TELEGRAM_DEFAULTS[k])]));
      setTelegram(tg); setSavedTelegram(tg);

      // Discussion
      const cs  = g(all, 'default_comment_status', 'open');
      const rne = g(all, 'require_name_email_for_comments', 'yes');
      const ccd = g(all, 'close_comments_days', '0');
      const mf  = g(all, 'moderate_first_comment', 'yes');
      const cm  = g(all, 'comment_moderation', 'no');
      const na  = g(all, 'comment_notify_author', 'yes');
      const nm  = g(all, 'comment_notify_moderation', 'yes');
      const sa  = g(all, 'show_avatars', 'yes');
      const da  = g(all, 'default_avatar', 'mystery');
      const ar  = g(all, 'avatar_rating', 'G');
      setCommentStatus(cs); setRequireNameEmail(rne);
      setCloseCommentsDays(ccd); setModerateFirst(mf); setCommentModeration(cm);
      setNotifyAuthor(na); setNotifyModeration(nm); setShowAvatars(sa);
      setDefaultAvatar(da); setAvatarRating(ar);
      setSavedDiscussion({ default_comment_status: cs,
        require_name_email_for_comments: rne, close_comments_days: ccd,
        moderate_first_comment: mf, comment_moderation: cm,
        comment_notify_author: na, comment_notify_moderation: nm,
        show_avatars: sa, default_avatar: da, avatar_rating: ar });

      // Media
      const tw = g(all, 'thumbnail_size_w', '150');
      const th = g(all, 'thumbnail_size_h', '150');
      const tc = g(all, 'thumbnail_crop', 'yes');
      const mw = g(all, 'medium_size_w', '300');
      const mh = g(all, 'medium_size_h', '300');
      const lw = g(all, 'large_size_w', '1024');
      const lh = g(all, 'large_size_h', '1024');
      const uy = g(all, 'uploads_use_yearmonth', 'yes');
      const am = g(all, 'upload_allowed_mime', 'image/jpeg,image/png,image/gif,image/webp');
      const ms = g(all, 'max_upload_size', '10');
      const mfmt = g(all, 'media_format', 'original');
      const mq = g(all, 'media_quality', '82');
      setThumbW(tw); setThumbH(th); setThumbCrop(tc);
      setMediumW(mw); setMediumH(mh); setLargeW(lw); setLargeH(lh);
      setUseYearMonth(uy);
      setAllowedMime(am); setMaxUploadSize(ms); setMediaFormat(mfmt); setMediaQuality(mq);
      setSavedMedia({ thumbnail_size_w: tw, thumbnail_size_h: th, thumbnail_crop: tc,
        medium_size_w: mw, medium_size_h: mh, large_size_w: lw, large_size_h: lh,
        uploads_use_yearmonth: uy, upload_allowed_mime: am, max_upload_size: ms,
        media_format: mfmt, media_quality: mq });

      // Permalinks
      const perm = g(all, 'permalink_structure', '/%postname%/');
      setStructure(perm); setSavedStructure(perm);
      if (!PERMALINK_PRESETS.some((p) => p.structure === perm)) setCustomStructure(perm);

      // Email
      const sen = g(all, 'smtp_enabled', 'true');
      const sh  = g(all, 'smtp_host');
      const sp  = g(all, 'smtp_port', '587');
      const ss  = g(all, 'smtp_secure', 'false');
      const su  = g(all, 'smtp_user');
      const spw = g(all, 'smtp_pass');
      const sf  = g(all, 'smtp_from');
      setSmtpEnabled(sen); setSmtpHost(sh); setSmtpPort(sp); setSmtpSecure(ss); setSmtpUser(su); setSmtpPass(spw); setSmtpFrom(sf);
      setSavedEmail({ smtp_enabled: sen, smtp_host: sh, smtp_port: sp, smtp_secure: ss, smtp_user: su, smtp_pass: spw, smtp_from: sf });
    } catch (err) {
      toast.error(errMsg(err, 'Failed to load settings'));
    } finally {
      setLoading(false);
    }
  }

  async function switchTab(t: Tab) {
    setTab(t);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (t === 'General') next.delete('tab'); else next.set('tab', t.toLowerCase());
      return next;
    }, { replace: true });
    if (t === 'Notifications' && notifPrefs.length === 0 && !notifLoadError) {
      setNotifLoading(true);
      setNotifLoadError(null);
      try {
        const prefs = await fetchNotificationPreferences();
        setNotifPrefs(prefs);
      } catch {
        setNotifLoadError('Could not load notification preferences. Make sure the database migrations are applied (run: pnpm --filter @headtilts/api exec prisma migrate deploy).');
      } finally {
        setNotifLoading(false);
      }
    }
  }

  function updateNotifPref(type: string, patch: Partial<NotificationPreference>) {
    setNotifPrefs((prev) => prev.map((p) => (p.type === type ? { ...p, ...patch } : p)));
  }

  async function saveNotifPrefs() {
    setSavingNotif(true);
    try {
      const updated = await updateNotificationPreferences(
        notifPrefs.map((p) => ({ type: p.type, channel: p.channel, enabled: p.enabled, threshold: p.threshold })),
      );
      setNotifPrefs(updated as unknown as NotificationPreference[]);
      toast.success('Notification preferences saved.');
    } catch {
      toast.error('Failed to save notification preferences');
    } finally {
      setSavingNotif(false);
    }
  }

  async function save(updates: Record<string, string>, onSuccess: () => void) {
    setSaving(true);
    try {
      await updateSettings(updates);
      onSuccess();
      toast.success('Settings saved.');
    } catch (err) {
      toast.error(errMsg(err, 'Failed to save settings'));
    } finally {
      setSaving(false);
    }
  }

  // ── Dirty checks ──
  const curGeneral: Record<string, string> = { site_title: siteTitle, site_tagline: siteTagline,
    show_tagline: showTagline, site_logo: siteLogo, site_logo_dark: siteLogoDark,
    site_logo_height: siteLogoHeight, admin_logo_height: adminLogoHeight,
    site_favicon: siteFavicon, admin_favicon: adminFavicon, admin_logo_icon: adminLogoIcon,
    site_description: siteDescription, admin_email: adminEmail, timezone, date_format: dateFormat,
    time_format: timeFormat, week_starts_on: weekStartsOn, show_breadcrumbs: showBreadcrumbs,
    background_effect: backgroundEffect };
  const curReading: Record<string, string> = { front_page_display: frontPageDisplay,
    front_page_id: frontPageId, posts_page_id: postsPageId,
    contact_page_id: contactPageId, about_page_id: aboutPageId,
    privacy_policy_page_id: privacyPageId, terms_page_id: termsPageId,
    posts_per_page: postsPerPage, posts_per_rss: postsPerRss,
    rss_content: rssContent, search_engine_visibility: searchVisibility, toc_enabled: tocEnabled };
  const curDiscussion: Record<string, string> = { default_comment_status: commentStatus,
    require_name_email_for_comments: requireNameEmail,
    close_comments_days: closeCommentsDays, moderate_first_comment: moderateFirst,
    comment_moderation: commentModeration, comment_notify_author: notifyAuthor,
    comment_notify_moderation: notifyModeration, show_avatars: showAvatars,
    default_avatar: defaultAvatar, avatar_rating: avatarRating };
  const curMedia: Record<string, string> = { thumbnail_size_w: thumbW, thumbnail_size_h: thumbH,
    thumbnail_crop: thumbCrop, medium_size_w: mediumW, medium_size_h: mediumH,
    large_size_w: largeW, large_size_h: largeH, uploads_use_yearmonth: useYearMonth,
    upload_allowed_mime: allowedMime, max_upload_size: maxUploadSize,
    media_format: mediaFormat, media_quality: mediaQuality };

  const allowedMimeSet = new Set(allowedMime.split(',').map((s) => s.trim()).filter(Boolean));
  const toggleAllowedMime = (mime: string, on: boolean) => {
    const next = new Set(allowedMimeSet);
    if (on) next.add(mime);
    else next.delete(mime);
    setAllowedMime(Array.from(next).join(','));
  };

  const curEmail: Record<string, string> = {
    smtp_enabled: smtpEnabled,
    smtp_host: smtpHost, smtp_port: smtpPort, smtp_secure: smtpSecure,
    smtp_user: smtpUser, smtp_pass: smtpPass, smtp_from: smtpFrom,
  };

  const curAnalytics: Record<string, string> = { ga_measurement_id: gaId.trim().toUpperCase(),
    ga_consent: gaConsent, ga_exclude_staff: gaExcludeStaff };
  const gaIdValid = curAnalytics.ga_measurement_id === '' || /^G-[A-Z0-9]{4,20}$/.test(curAnalytics.ga_measurement_id);

  const tgToken = telegram.telegram_bot_token.trim();
  const tgTokenValid = tgToken === '' || tgToken === '••••••••' || /^\d{5,15}:[A-Za-z0-9_-]{30,50}$/.test(tgToken);
  const tgChat = telegram.telegram_chat_id.trim();
  const tgChatValid = tgChat === '' || /^@[A-Za-z][A-Za-z0-9_]{3,31}$/.test(tgChat) || /^-?\d{5,20}$/.test(tgChat);

  const isDirty = (cur: Record<string, string>, saved: Record<string, string>) =>
    Object.entries(cur).some(([k, v]) => saved[k] !== v);

  // Unsaved changes per tab: shown as a dot on the tab, and guarded on leave.
  const tabDirty: Partial<Record<Tab, boolean>> = loading ? {} : {
    General: isDirty(curGeneral, savedGeneral),
    Reading: isDirty(curReading, savedReading),
    Discussion: isDirty(curDiscussion, savedDiscussion),
    Media: isDirty(curMedia, savedMedia),
    Email: isDirty(curEmail, savedEmail),
    Analytics: isDirty(curAnalytics, savedAnalytics),
    Telegram: isDirty(telegram, savedTelegram),
    Permalinks: structure !== savedStructure,
  };
  useUnsavedChanges(() => Object.values(tabDirty).some(Boolean),
    'Some settings haven’t been saved (tabs with a dot). If you leave now those changes will be lost.');

  const isCustomDate = !DATE_FORMAT_PRESETS.includes(dateFormat);
  const isCustomTime = !TIME_FORMAT_PRESETS.includes(timeFormat);
  const isCustomPermalink = !PERMALINK_PRESETS.some((p) => p.structure === structure);

  // ---------------------------------------------------------------------------
  // Notices
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <AdminLayout>
      <PageHeader
        title="Settings"
        subtitle="Site identity, reading, writing, SEO, email and more."
        actions={<SettingsSearch onPick={(entry) => { switchTab(entry.tab); revealSetting(entry); }} />}
      />

      <div className={styles.layout}>
        <nav className={styles.tabs} ref={navRef} aria-label="Settings sections">
          {TAB_GROUPS.map((group) => (
            <div key={group} className={styles.tabGroup}>
              <span className={styles.tabGroupLabel}>{group}</span>
              {TABS.filter((t) => TAB_META[t].group === group).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={t === tab ? styles.tabActive : styles.tab}
                  aria-current={t === tab ? 'page' : undefined}
                  onClick={() => switchTab(t)}
                >
                  <FontAwesomeIcon icon={TAB_META[t].icon} className={styles.tabIcon} fixedWidth />
                  <span className={styles.tabText}>
                    <span className={styles.tabName}>{t}</span>
                    <span className={styles.tabDesc}>{TAB_META[t].desc}</span>
                  </span>
                  {tabDirty[t] && <span className={styles.tabDot} title="Unsaved changes" aria-label="(unsaved changes)" />}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className={styles.content}>
          <header className={styles.tabHeader}>
            <span className={styles.tabHeaderIcon}><FontAwesomeIcon icon={TAB_META[tab].icon} /></span>
            <div>
              <h2 className={styles.tabTitle}>{tab}</h2>
              <p className={styles.tabSubtitle}>{TAB_META[tab].desc}</p>
            </div>
          </header>
      {loading ? (
        <div className={styles.panel}><p className={styles.loadingText}>Loading…</p></div>
      ) : tab === 'General' ? (
        /* ═══════════════ GENERAL ═══════════════ */
        <form onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save(curGeneral, () => setSavedGeneral({ ...curGeneral }));
        }}>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Site identity</h3>
            <div className={styles.formTable}>
              <label className={styles.formLabel} htmlFor="site_title">Site title</label>
              <div className={styles.formField}>
                <input id="site_title" type="text" className={styles.regularText} value={siteTitle}
                  onChange={(e) => setSiteTitle(e.target.value)} disabled={saving} />
              </div>

              <label className={styles.formLabel} htmlFor="site_tagline">Tagline</label>
              <div className={styles.formField}>
                <input id="site_tagline" type="text" className={styles.regularText} value={siteTagline}
                  onChange={(e) => setSiteTagline(e.target.value)} disabled={saving} />
                <p className={styles.fieldHint}>In a few words, explain what this site is about.</p>
                <CheckField
                  id="show_tagline"
                  label="Display the tagline next to the site title/logo"
                  checked={showTagline !== 'no'}
                  onChange={(v) => setShowTagline(v ? 'yes' : 'no')}
                  disabled={saving}
                />
              </div>

              <label className={styles.formLabel} htmlFor="site_description">Site description</label>
              <div className={styles.formField}>
                <textarea id="site_description" className={styles.largeText} value={siteDescription}
                  onChange={(e) => setSiteDescription(e.target.value)} rows={3} disabled={saving} />
                <p className={styles.fieldHint}>A sentence or two about the site, used by search engines, link previews and the RSS feed.</p>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Logos &amp; icons</h3>
            <div className={styles.imageGrid}>
              <ImageTile label="Logo" value={siteLogo} onChange={setSiteLogo} disabled={saving}
                hint="Site header, admin sidebar and login. Without one, the site title is shown as text." />
              <ImageTile label="Dark mode logo" value={siteLogoDark} onChange={setSiteLogoDark} disabled={saving} dark
                hint="For readers using dark mode. Without one, the logo above is used." />
              <ImageTile label="Site favicon" value={siteFavicon} onChange={setSiteFavicon} disabled={saving}
                hint="The public site's browser tab icon. A square image, 32 × 32 px or larger." />
              <ImageTile label="Admin favicon" value={adminFavicon} onChange={setAdminFavicon} disabled={saving}
                hint="The admin panel's tab icon. Without one, the site favicon is used." />
              <ImageTile label="Collapsed sidebar icon" value={adminLogoIcon} onChange={setAdminLogoIcon} disabled={saving}
                hint="Shown in place of the logo when the admin sidebar is collapsed. A square image works best. Without one, the admin favicon is used." />
            </div>
            <div className={styles.sizeRow}>
              <span className={styles.sizeRowLabel}>Logo height</span>
              <label className={styles.sizeField} htmlFor="site_logo_height">
                Public site
                <span className={styles.inlineField}>
                  <input id="site_logo_height" type="number" min="16" max="200" step="1"
                    className={styles.smallText} placeholder="32" value={siteLogoHeight}
                    onChange={(e) => setSiteLogoHeight(e.target.value)} disabled={saving} />
                  <span className={styles.inputSuffix}>px</span>
                </span>
              </label>
              <label className={styles.sizeField} htmlFor="admin_logo_height">
                Admin sidebar
                <span className={styles.inlineField}>
                  <input id="admin_logo_height" type="number" min="16" max="200" step="1"
                    className={styles.smallText} placeholder="32" value={adminLogoHeight}
                    onChange={(e) => setAdminLogoHeight(e.target.value)} disabled={saving} />
                  <span className={styles.inputSuffix}>px</span>
                </span>
              </label>
              <span className={styles.fieldHint}>Leave empty for the default, 32 px.</span>
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Administration</h3>
            <div className={styles.formTable}>
              <label className={styles.formLabel} htmlFor="admin_email">Administration email</label>
              <div className={styles.formField}>
                <input id="admin_email" type="email" className={styles.regularText} value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)} disabled={saving} />
                <p className={styles.fieldHint}>This address is used for site administration notifications.</p>
              </div>

              <span className={styles.formLabel}>Breadcrumbs</span>
              <div className={styles.formField}>
                <CheckField
                  id="show_breadcrumbs"
                  label="Show breadcrumb navigation"
                  hint="Displays location trails on the public site (e.g. Home › Events) and in the admin panel (e.g. Posts › Edit Post)."
                  checked={showBreadcrumbs !== 'no'}
                  onChange={(v) => setShowBreadcrumbs(v ? 'yes' : 'no')}
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Visual effects</h3>
            <div className={styles.formTable}>
              <label className={styles.formLabel} htmlFor="background_effect">Public site background</label>
              <div className={styles.formField}>
                <select
                  id="background_effect"
                  className={styles.selectInput}
                  value={backgroundEffect}
                  onChange={(e) => setBackgroundEffect(e.target.value)}
                  disabled={saving}
                >
                  <option value="none">None — no background effect</option>
                  <option value="diya">✦ Diya Glow — warm flickering amber orbs</option>
                  <option value="petals">✿ Marigold Petals — falling orange &amp; gold petals</option>
                  <option value="rangoli">★ Rangoli Sparkles — colourful twinkling stars</option>
                  <option value="holi">◉ Holi Colors — floating festive colour clouds</option>
                </select>
                <p className={styles.fieldHint}>
                  Adds a decorative canvas animation to every public page. Renders behind your content with pointer-events disabled so it never interferes with interaction.
                </p>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Date &amp; time</h3>
            <div className={styles.formTable}>
              <label className={styles.formLabel} htmlFor="timezone">Timezone</label>
              <div className={styles.formField}>
                <select id="timezone" className={styles.selectInput} value={timezone}
                  onChange={(e) => setTimezone(e.target.value)} disabled={saving}>
                  {TIMEZONES.map((group) =>
                    group.group ? (
                      <optgroup key={group.group} label={group.group}>
                        {group.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </optgroup>
                    ) : group.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)
                  )}
                </select>
              </div>

              <span className={styles.formLabel}>Date format</span>
              <div className={styles.formField}>
                <div className={styles.formatList}>
                  {DATE_FORMAT_PRESETS.map((fmt) => (
                    <label key={fmt} className={styles.formatRow}>
                      <input type="radio" name="date_format" checked={!isCustomDate && dateFormat === fmt}
                        onChange={() => { setDateFormat(fmt); }} disabled={saving} />
                      <code className={styles.formatCode}>{fmt}</code>
                      <span className={styles.formatPreview}>{previewFormat(fmt)}</span>
                    </label>
                  ))}
                  <label className={styles.formatRow}>
                    <input type="radio" name="date_format" checked={isCustomDate}
                      onChange={() => { setDateFormat(customDate); }} disabled={saving} />
                    <span className={styles.formatCustomLabel}>Custom:</span>
                    <input type="text" className={styles.formatCustomInput} value={customDate}
                      onFocus={() => { setDateFormat(customDate); }}
                      onChange={(e) => { setCustomDate(e.target.value); setDateFormat(e.target.value); }}
                      placeholder="Y-m-d" disabled={saving} />
                    {isCustomDate && customDate && (
                      <span className={styles.formatPreview}>{previewFormat(customDate)}</span>
                    )}
                  </label>
                </div>
              </div>

              <span className={styles.formLabel}>Time format</span>
              <div className={styles.formField}>
                <div className={styles.formatList}>
                  {TIME_FORMAT_PRESETS.map((fmt) => (
                    <label key={fmt} className={styles.formatRow}>
                      <input type="radio" name="time_format" checked={!isCustomTime && timeFormat === fmt}
                        onChange={() => { setTimeFormat(fmt); }} disabled={saving} />
                      <code className={styles.formatCode}>{fmt}</code>
                      <span className={styles.formatPreview}>{previewFormat(fmt)}</span>
                    </label>
                  ))}
                  <label className={styles.formatRow}>
                    <input type="radio" name="time_format" checked={isCustomTime}
                      onChange={() => { setTimeFormat(customTime); }} disabled={saving} />
                    <span className={styles.formatCustomLabel}>Custom:</span>
                    <input type="text" className={styles.formatCustomInput} value={customTime}
                      onFocus={() => { setTimeFormat(customTime); }}
                      onChange={(e) => { setCustomTime(e.target.value); setTimeFormat(e.target.value); }}
                      placeholder="H:i" disabled={saving} />
                    {isCustomTime && customTime && (
                      <span className={styles.formatPreview}>{previewFormat(customTime)}</span>
                    )}
                  </label>
                </div>
                <p className={styles.fieldHint}>
                  Uses <a href="https://www.php.net/manual/en/datetime.format.php" target="_blank" rel="noreferrer">PHP format strings</a>.
                </p>
              </div>

              <label className={styles.formLabel} htmlFor="week_starts_on">Week starts on</label>
              <div className={styles.formField}>
                <select id="week_starts_on" className={styles.selectInput} value={weekStartsOn}
                  onChange={(e) => setWeekStartsOn(e.target.value)} disabled={saving}>
                  {WEEK_DAYS.map((d, i) => <option key={i} value={String(i)}>{d}</option>)}
                </select>
              </div>
            </div>
          </div>

          <SaveBar dirty={tabDirty.General} saving={saving} disabled={saving || !isDirty(curGeneral, savedGeneral)} />
        </form>

      ) : tab === 'Reading' ? (
        /* ═══════════════ READING ═══════════════ */
        <form onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save(curReading, () => setSavedReading({ ...curReading }));
        }}>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Home page</h3>
            <div className={styles.formTable}>
              <span className={styles.formLabel}>Your homepage shows</span>
              <div className={styles.formField}>
                <div className={styles.radioStack}>
                  <label className={styles.radioRow}>
                    <input type="radio" name="front_page_display" value="posts"
                      checked={frontPageDisplay === 'posts'}
                      onChange={() => setFrontPageDisplay('posts')} disabled={saving} />
                    <span>Your latest posts</span>
                  </label>
                  <label className={styles.radioRow}>
                    <input type="radio" name="front_page_display" value="page"
                      checked={frontPageDisplay === 'page'}
                      onChange={() => setFrontPageDisplay('page')} disabled={saving} />
                    <span>A static page</span>
                  </label>
                </div>

                {frontPageDisplay === 'page' && (
                  <div className={styles.staticPagePickers}>
                    <div className={styles.pickerRow}>
                      <label className={styles.pickerLabel}>Homepage</label>
                      <select className={styles.selectInput} value={frontPageId}
                        onChange={(e) => setFrontPageId(e.target.value)} disabled={saving}>
                        <option value="">— Select —</option>
                        {pages.map((p) => <option key={p.id} value={String(p.id)}>{p.title}</option>)}
                      </select>
                    </div>
                    <div className={styles.pickerRow}>
                      <label className={styles.pickerLabel}>Posts page</label>
                      <select className={styles.selectInput} value={postsPageId}
                        onChange={(e) => setPostsPageId(e.target.value)} disabled={saving}>
                        <option value="">— Select —</option>
                        {pages.map((p) => <option key={p.id} value={String(p.id)}>{p.title}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Content</h3>
            <div className={styles.formTable}>
              <label className={styles.formLabel} htmlFor="posts_per_page">Blog pages show at most</label>
              <div className={styles.formField}>
                <span className={styles.inlineField}>
                  <input id="posts_per_page" type="number" className={styles.smallText} min={1} max={999}
                    value={postsPerPage} onChange={(e) => setPostsPerPage(e.target.value)} disabled={saving} />
                  <span className={styles.inputSuffix}>posts</span>
                </span>
              </div>

              <label className={styles.formLabel} htmlFor="posts_per_rss">RSS feeds show the latest</label>
              <div className={styles.formField}>
                <span className={styles.inlineField}>
                  <input id="posts_per_rss" type="number" className={styles.smallText} min={1} max={999}
                    value={postsPerRss} onChange={(e) => setPostsPerRss(e.target.value)} disabled={saving} />
                  <span className={styles.inputSuffix}>posts</span>
                </span>
              </div>

              <span className={styles.formLabel}>For each post in a feed, include</span>
              <div className={styles.formField}>
                <div className={styles.radioStack}>
                  <label className={styles.radioRow}>
                    <input type="radio" name="rss_content" value="full"
                      checked={rssContent === 'full'}
                      onChange={() => setRssContent('full')} disabled={saving} />
                    <span>Full text</span>
                  </label>
                  <label className={styles.radioRow}>
                    <input type="radio" name="rss_content" value="excerpt"
                      checked={rssContent === 'excerpt'}
                      onChange={() => setRssContent('excerpt')} disabled={saving} />
                    <span>Summary</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Special pages</h3>
            <p className={styles.fieldHint} style={{ marginBottom: '1rem' }}>
              Designate which pages serve specific roles across the site (navigation links, routing, etc.).
            </p>
            <div className={styles.formTable}>
              {(
                [
                  { label: 'Contact page',        value: contactPageId,  set: setContactPageId  },
                  { label: 'About page',          value: aboutPageId,    set: setAboutPageId    },
                  { label: 'Privacy policy page', value: privacyPageId,  set: setPrivacyPageId  },
                  { label: 'Terms page',          value: termsPageId,    set: setTermsPageId    },
                ] as { label: string; value: string; set: (v: string) => void }[]
              ).map(({ label, value, set }) => (
                <React.Fragment key={label}>
                  <label className={styles.formLabel}>{label}</label>
                  <div className={styles.formField}>
                    <select className={styles.selectInput} value={value}
                      onChange={(e) => set(e.target.value)} disabled={saving}>
                      <option value="">— Not set —</option>
                      {pages.map((p) => (
                        <option key={p.id} value={String(p.id)}>{p.title}</option>
                      ))}
                    </select>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Table of contents</h3>
            <div className={styles.formTable}>
              <span className={styles.formLabel}>On posts</span>
              <div className={styles.formField}>
                <CheckField
                  id="toc_enabled"
                  label="Automatically show a Table of Contents on posts and pages"
                  hint="Only appears when a post has 3 or more headings (h2/h3). Can be overridden per post."
                  checked={tocEnabled === 'yes'}
                  onChange={(v) => setTocEnabled(v ? 'yes' : 'no')}
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Search engines</h3>
            <div className={styles.formTable}>
              <span className={styles.formLabel}>Visibility</span>
              <div className={styles.formField}>
                <CheckField
                  id="search_engine_visibility"
                  label="Discourage search engines from indexing this site"
                  hint="It is up to search engines to honor this request."
                  checked={searchVisibility === 'no'}
                  onChange={(v) => setSearchVisibility(v ? 'no' : 'yes')}
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          <SaveBar dirty={tabDirty.Reading} saving={saving} disabled={saving || !isDirty(curReading, savedReading)} />
        </form>

      ) : tab === 'Discussion' ? (
        /* ═══════════════ DISCUSSION ═══════════════ */
        <form onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save(curDiscussion, () => setSavedDiscussion({ ...curDiscussion }));
        }}>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>New posts</h3>
            <div className={styles.checkStack}>
              <CheckField id="default_comment_status"
                label="Allow people to submit comments on new posts"
                hint="Individual posts can override this in the post editor."
                checked={commentStatus === 'open'}
                onChange={(v) => setCommentStatus(v ? 'open' : 'closed')} disabled={saving} />
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Comment rules</h3>
            <div className={styles.checkStack}>
              <CheckField id="require_name_email"
                label="Comment author must fill out name and email"
                checked={requireNameEmail === 'yes'}
                onChange={(v) => setRequireNameEmail(v ? 'yes' : 'no')} disabled={saving} />
              <div className={styles.checkRow}>
                <input type="checkbox" className={styles.checkInput} id="close_comments_enable"
                  checked={closeCommentsDays !== '0'}
                  onChange={(e) => setCloseCommentsDays(e.target.checked ? '14' : '0')}
                  disabled={saving} />
                <span>
                  <label htmlFor="close_comments_enable" className={styles.checkLabel}>
                    Automatically close comments on posts older than{' '}
                    <input type="number" className={styles.inlineNumber} min={1} max={9999}
                      value={closeCommentsDays === '0' ? '14' : closeCommentsDays}
                      onChange={(e) => setCloseCommentsDays(e.target.value || '14')}
                      disabled={saving || closeCommentsDays === '0'} />
                    {' '}days
                  </label>
                </span>
              </div>
              <CheckField id="moderate_first_comment"
                label="Hold a comment in the queue if the comment author has no previously approved comments"
                checked={moderateFirst === 'yes'}
                onChange={(v) => setModerateFirst(v ? 'yes' : 'no')} disabled={saving} />
              <CheckField id="comment_moderation"
                label="Comment must be manually approved"
                hint="All comments will be held for review before appearing."
                checked={commentModeration === 'yes'}
                onChange={(v) => setCommentModeration(v ? 'yes' : 'no')} disabled={saving} />
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Email me when</h3>
            <div className={styles.checkStack}>
              <CheckField id="notify_author"
                label="Anyone posts a comment"
                checked={notifyAuthor === 'yes'}
                onChange={(v) => setNotifyAuthor(v ? 'yes' : 'no')} disabled={saving} />
              <CheckField id="notify_moderation"
                label="A comment is held for moderation"
                checked={notifyModeration === 'yes'}
                onChange={(v) => setNotifyModeration(v ? 'yes' : 'no')} disabled={saving} />
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Avatars</h3>
            <div className={styles.formTable}>
              <span className={styles.formLabel}>Show avatars</span>
              <div className={styles.formField}>
                <CheckField id="show_avatars"
                  label="Show Avatars"
                  checked={showAvatars === 'yes'}
                  onChange={(v) => setShowAvatars(v ? 'yes' : 'no')} disabled={saving} />
              </div>

              <span className={styles.formLabel}>Maximum rating</span>
              <div className={styles.formField}>
                <div className={styles.radioStack}>
                  {AVATAR_RATINGS.map((r) => (
                    <label key={r.value} className={styles.radioRow}>
                      <input type="radio" name="avatar_rating" value={r.value}
                        checked={avatarRating === r.value}
                        onChange={() => setAvatarRating(r.value)} disabled={saving} />
                      <span>{r.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <span className={styles.formLabel}>Default avatar</span>
              <div className={styles.formField}>
                <div className={styles.avatarGrid}>
                  {AVATAR_OPTIONS.map((a) => (
                    <label key={a.value}
                      className={`${styles.avatarOption} ${defaultAvatar === a.value ? styles.avatarOptionActive : ''}`}>
                      <input type="radio" name="default_avatar" value={a.value}
                        checked={defaultAvatar === a.value}
                        onChange={() => setDefaultAvatar(a.value)} disabled={saving} />
                      <span className={styles.avatarLabel}>{a.label}</span>
                      <span className={styles.avatarDesc}>{a.desc}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <SaveBar dirty={tabDirty.Discussion} saving={saving} disabled={saving || !isDirty(curDiscussion, savedDiscussion)} />
        </form>

      ) : tab === 'Media' ? (
        /* ═══════════════ MEDIA ═══════════════ */
        <form onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save(curMedia, () => setSavedMedia({ ...curMedia }));
        }}>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Image sizes</h3>
            <p className={styles.fieldHint} style={{ marginBottom: '1.25rem' }}>
              The sizes listed below determine the maximum dimensions in pixels to use when inserting an image into the body of a post. Enter <strong>0</strong> for no resizing.
            </p>

            <div className={styles.sizeCards}>
              <div className={styles.sizeCard}>
                <span className={styles.sizeCardTitle}>Thumbnail</span>
                <div className={styles.sizeInputs}>
                  <label htmlFor="thumb_w">Width
                    <span className={styles.inlineField}>
                      <input id="thumb_w" type="number" className={styles.smallText} min={0}
                        value={thumbW} onChange={(e) => setThumbW(e.target.value)} disabled={saving} />
                      <span className={styles.inputSuffix}>px</span>
                    </span>
                  </label>
                  <label htmlFor="thumb_h">Height
                    <span className={styles.inlineField}>
                      <input id="thumb_h" type="number" className={styles.smallText} min={0}
                        value={thumbH} onChange={(e) => setThumbH(e.target.value)} disabled={saving} />
                      <span className={styles.inputSuffix}>px</span>
                    </span>
                  </label>
                </div>
                <CheckField id="thumbnail_crop"
                  label="Crop to exactly this size"
                  hint="Otherwise thumbnails keep their proportions."
                  checked={thumbCrop === 'yes'}
                  onChange={(v) => setThumbCrop(v ? 'yes' : 'no')} disabled={saving} />
              </div>
              <div className={styles.sizeCard}>
                <span className={styles.sizeCardTitle}>Medium</span>
                <div className={styles.sizeInputs}>
                  <label htmlFor="medium_w">Max width
                    <span className={styles.inlineField}>
                      <input id="medium_w" type="number" className={styles.smallText} min={0}
                        value={mediumW} onChange={(e) => setMediumW(e.target.value)} disabled={saving} />
                      <span className={styles.inputSuffix}>px</span>
                    </span>
                  </label>
                  <label htmlFor="medium_h">Max height
                    <span className={styles.inlineField}>
                      <input id="medium_h" type="number" className={styles.smallText} min={0}
                        value={mediumH} onChange={(e) => setMediumH(e.target.value)} disabled={saving} />
                      <span className={styles.inputSuffix}>px</span>
                    </span>
                  </label>
                </div>
              </div>
              <div className={styles.sizeCard}>
                <span className={styles.sizeCardTitle}>Large</span>
                <div className={styles.sizeInputs}>
                  <label htmlFor="large_w">Max width
                    <span className={styles.inlineField}>
                      <input id="large_w" type="number" className={styles.smallText} min={0}
                        value={largeW} onChange={(e) => setLargeW(e.target.value)} disabled={saving} />
                      <span className={styles.inputSuffix}>px</span>
                    </span>
                  </label>
                  <label htmlFor="large_h">Max height
                    <span className={styles.inlineField}>
                      <input id="large_h" type="number" className={styles.smallText} min={0}
                        value={largeH} onChange={(e) => setLargeH(e.target.value)} disabled={saving} />
                      <span className={styles.inputSuffix}>px</span>
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Uploads</h3>
            <div className={styles.formTable}>
              <label className={styles.formLabel} htmlFor="max_upload_size">Maximum upload size</label>
              <div className={styles.formField}>
                <span className={styles.inlineField}>
                  <input id="max_upload_size" type="number" className={styles.smallText} min={1} max={1024}
                    value={maxUploadSize} onChange={(e) => setMaxUploadSize(e.target.value)} disabled={saving} />
                  <span className={styles.inputSuffix}>MB</span>
                </span>
                <p className={styles.fieldHint}>Applies per file. Files larger than this are rejected.</p>
              </div>
            </div>
            <div className={styles.checkStack} style={{ marginTop: '0.75rem' }}>
              <CheckField id="uploads_use_yearmonth"
                label="Organize my uploads into month- and year-based folders"
                hint="e.g. /uploads/2026/06/image.jpg"
                checked={useYearMonth === 'yes'}
                onChange={(v) => setUseYearMonth(v ? 'yes' : 'no')} disabled={saving} />
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Allowed file types</h3>
            <p className={styles.fieldHint} style={{ marginBottom: '1rem' }}>
              Choose which file types contributors may upload. Unchecking a type blocks new uploads of it.
            </p>
            {MIME_OPTIONS.map((grp) => (
              <div key={grp.group} style={{ marginBottom: '0.875rem' }}>
                <div className={styles.imageSizeTitle}>{grp.group}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem 1.25rem' }}>
                  {grp.items.map(([mime, label]) => (
                    <label key={mime} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      <input type="checkbox" checked={allowedMimeSet.has(mime)}
                        onChange={(e) => toggleAllowedMime(mime, e.target.checked)} disabled={saving} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Image delivery</h3>
            <div className={styles.formTable}>
              <label className={styles.formLabel} htmlFor="media_format">Delivery format</label>
              <div className={styles.formField}>
                <select id="media_format" className={styles.selectInput}
                  value={mediaFormat} onChange={(e) => setMediaFormat(e.target.value)} disabled={saving}>
                  <option value="original">Keep original format</option>
                  <option value="webp">Convert to WebP (smaller, widely supported)</option>
                  <option value="avif">Convert to AVIF (smallest, slower to encode)</option>
                </select>
                <p className={styles.fieldHint}>The original upload is always preserved; this controls the version served to visitors.</p>
              </div>

              <label className={styles.formLabel} htmlFor="media_quality">Compression quality</label>
              <div className={styles.formField}>
                <span className={styles.inlineField}>
                  <input id="media_quality" type="range" min={40} max={100} step={1}
                    value={mediaQuality} onChange={(e) => setMediaQuality(e.target.value)} disabled={saving}
                    style={{ verticalAlign: 'middle' }} />
                  <span className={styles.inputSuffix}>{mediaQuality}</span>
                </span>
                <p className={styles.fieldHint}>Higher = better quality, larger files. 82 is a good default.</p>
              </div>
            </div>
          </div>

          <SaveBar dirty={tabDirty.Media} saving={saving} disabled={saving || !isDirty(curMedia, savedMedia)} />
        </form>

      ) : tab === 'Permalinks' ? (
        /* ═══════════════ PERMALINKS ═══════════════ */
        <form onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save({ permalink_structure: structure }, () => setSavedStructure(structure));
        }}>
          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Post address structure</h3>
            <p className={styles.sectionDesc}>
              Choose how the addresses of your posts are built. Changing this later breaks links people have shared,
              unless you add redirects.
            </p>

            <div className={styles.options}>
              {PERMALINK_PRESETS.map((preset) => (
                <label key={preset.label} className={styles.option}>
                  <input type="radio" name="permalink-structure"
                    checked={!isCustomPermalink && structure === preset.structure}
                    onChange={() => { setStructure(preset.structure); }} disabled={saving} />
                  <div>
                    <div className={styles.optionLabel}>{preset.label}</div>
                    <code className={styles.structure}>{preset.structure}</code>
                  </div>
                </label>
              ))}

              <label className={styles.option}>
                <input type="radio" name="permalink-structure" checked={isCustomPermalink}
                  onChange={() => { setStructure(customStructure); }} disabled={saving} />
                <div className={styles.customRow}>
                  <div className={styles.optionLabel}>Custom structure</div>
                  <input type="text" className={styles.customInput} value={customStructure}
                    onChange={(e) => { setCustomStructure(e.target.value); setStructure(e.target.value); }}
                    onFocus={() => { setStructure(customStructure); }}
                    placeholder="/%year%/%postname%/" disabled={saving} />
                </div>
              </label>
            </div>

            <div className={styles.preview}>
              <span className={styles.previewLabel}>Preview</span>
              <code className={styles.previewUrl}>{buildPermalinkPreview(structure)}</code>
            </div>

            <div className={styles.tags}>
              <span className={styles.tagsLabel}>Available tags:</span>
              {Object.keys(PERMALINK_SAMPLE).map((tag) => (
                <code key={tag} className={styles.tag}>{tag}</code>
              ))}
            </div>

          </div>
          <SaveBar dirty={tabDirty.Permalinks} saving={saving} disabled={saving || structure === savedStructure || !structure} />
        </form>
      ) : tab === 'Analytics' ? (
        /* ═══════════════ ANALYTICS ═══════════════ */
        <form onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!gaIdValid) return;
          save(curAnalytics, () => { setSavedAnalytics({ ...curAnalytics }); setGaId(curAnalytics.ga_measurement_id); });
        }}>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Google Analytics</h3>
            <p className={savedAnalytics.ga_measurement_id ? `${styles.notice} ${styles.noticeSuccess}` : styles.notice}>
              {savedAnalytics.ga_measurement_id
                ? <>Tracking is on for the public site with <strong>{savedAnalytics.ga_measurement_id}</strong>. The admin panel is never tracked.</>
                : <>Tracking is off. Paste a Measurement ID below to turn it on.</>}
            </p>
            <div className={styles.formTable}>
              <label className={styles.formLabel} htmlFor="ga_measurement_id">Measurement ID</label>
              <div className={styles.formField}>
                <input id="ga_measurement_id" type="text" className={styles.regularText} value={gaId}
                  placeholder="G-XXXXXXXXXX" autoComplete="off" spellCheck={false}
                  aria-invalid={!gaIdValid} aria-describedby="ga_measurement_id_hint"
                  onChange={(e) => setGaId(e.target.value)} disabled={saving} />
                <p id="ga_measurement_id_hint" className={styles.fieldHint}>
                  {gaIdValid
                    ? <>In <a href="https://analytics.google.com/" target="_blank" rel="noreferrer">Google Analytics</a>: Admin → Data streams → your web stream. Leave empty to turn tracking off.</>
                    : <strong>That doesn’t look like a GA4 Measurement ID. It starts with “G-”, e.g. G-AB12CD34EF.</strong>}
                </p>
              </div>

              <span className={styles.formLabel}>Visitor consent</span>
              <div className={styles.formField}>
                <div className={styles.radioStack}>
                  <label className={styles.radioRow}>
                    <input type="radio" name="ga_consent" value="banner" checked={gaConsent === 'banner'}
                      onChange={() => setGaConsent('banner')} disabled={saving} />
                    <span>Ask first with a cookie banner (recommended)</span>
                  </label>
                  <label className={styles.radioRow}>
                    <input type="radio" name="ga_consent" value="none" checked={gaConsent === 'none'}
                      onChange={() => setGaConsent('none')} disabled={saving} />
                    <span>Don’t ask, start tracking straight away</span>
                  </label>
                </div>
                <p className={styles.fieldHint}>
                  With the banner, nothing is sent to Google and no cookies are set until a visitor accepts.
                  Visitors from the EU or UK must be asked; India’s DPDP Act points the same way.
                  Browsers that send the Global Privacy Control signal are never tracked.
                </p>
              </div>

              <span className={styles.formLabel}>Your own visits</span>
              <div className={styles.formField}>
                <CheckField
                  id="ga_exclude_staff"
                  label="Don’t count visits from browsers signed in to this admin"
                  hint="Keeps your team’s own reading and checking out of the numbers. Previews are never counted."
                  checked={gaExcludeStaff !== 'no'}
                  onChange={(v) => setGaExcludeStaff(v ? 'yes' : 'no')}
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>One setting to change in Google Analytics</h3>
            <p className={styles.fieldHint}>
              The site sends each page view itself, once the page’s real title has loaded. Turn off Google’s own
              history-based page views so pages aren’t counted twice: Admin → Data streams → your stream →
              Enhanced measurement (gear icon) → Page views → Show advanced settings → untick
              “Page changes based on browser history events”.
            </p>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>What gets tracked</h3>
            <ul className={styles.fieldHint}>
              <li><strong>page_view</strong>: every page, with its real title</li>
              <li><strong>poll_vote</strong>: a reader votes in a poll</li>
              <li><strong>comment</strong>: a comment or reply is posted</li>
              <li><strong>post_reaction</strong>: an emoji reaction on a post</li>
              <li><strong>share</strong>: a poll is shared (copy link, WhatsApp, X…)</li>
              <li><strong>event_registration</strong>: someone signs up for an event (paid or free)</li>
              <li>Google’s enhanced measurement adds scrolls, outbound clicks and site searches (the <code>q</code> parameter) on its own.</li>
            </ul>
            <p className={styles.fieldHint}>To check it works, open Reports → Realtime in Google Analytics and visit the site in another browser.</p>
          </div>

          <SaveBar dirty={tabDirty.Analytics} saving={saving} disabled={saving || !gaIdValid || !isDirty(curAnalytics, savedAnalytics)} />
        </form>

      ) : tab === 'Email' ? (
        /* ═══════════════ EMAIL (SMTP) ═══════════════ */
        <>
        <form onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save(curEmail, () => setSavedEmail({ ...curEmail }));
        }}>

          {/* Toggle */}
          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Sending</h3>
            <div className={styles.emailToggleRow}>
              <p className={styles.sectionDesc}>
                When disabled, password resets and notifications are suppressed and logged to console instead.
              </p>
              <label className={styles.emailToggleSwitch}>
                <input
                  type="checkbox"
                  checked={smtpEnabled === 'true'}
                  onChange={(e) => setSmtpEnabled(e.target.checked ? 'true' : 'false')}
                  disabled={saving}
                />
                <span className={styles.emailToggleTrack} />
                <span className={styles.emailToggleLabel}>
                  {smtpEnabled === 'true' ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            </div>
          </div>

          {/* SMTP config — muted when disabled */}
          <div className={smtpEnabled !== 'true' ? styles.panelMuted : undefined}>

            <div className={styles.panel}>
              <h3 className={styles.sectionTitle}>Server</h3>
              <p className={styles.sectionDesc} style={{ marginBottom: '1.25rem' }}>
                Overrides <code>SMTP_*</code> environment variables. Leave blank to use <code>.env</code> values.
              </p>
              <div className={styles.formTable}>
                <label className={styles.formLabel} htmlFor="smtp_host">Host</label>
                <div className={styles.formField}>
                  <input id="smtp_host" type="text" className={styles.regularText}
                    placeholder="smtp.example.com" value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    disabled={saving || smtpEnabled !== 'true'} />
                </div>

                <label className={styles.formLabel} htmlFor="smtp_port">Port &amp; security</label>
                <div className={styles.formField}>
                  <div className={styles.inlineRow}>
                    <input id="smtp_port" type="number" className={styles.smallText}
                      placeholder="587" value={smtpPort}
                      onChange={(e) => setSmtpPort(e.target.value)}
                      disabled={saving || smtpEnabled !== 'true'} />
                    <select className={styles.selectInput} value={smtpSecure}
                      onChange={(e) => setSmtpSecure(e.target.value)}
                      disabled={saving || smtpEnabled !== 'true'}>
                      <option value="false">STARTTLS</option>
                      <option value="true">SSL / TLS</option>
                    </select>
                  </div>
                  <p className={styles.fieldHint}>587 = STARTTLS · 465 = SSL/TLS</p>
                </div>
              </div>
            </div>

            <div className={styles.panel}>
              <h3 className={styles.sectionTitle}>Credentials</h3>
              <div className={styles.formTable}>
                <label className={styles.formLabel} htmlFor="smtp_user">Username</label>
                <div className={styles.formField}>
                  <input id="smtp_user" type="text" className={styles.regularText} autoComplete="off"
                    placeholder="user@example.com" value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                    disabled={saving || smtpEnabled !== 'true'} />
                </div>

                <label className={styles.formLabel} htmlFor="smtp_pass">Password</label>
                <div className={styles.formField}>
                  <input id="smtp_pass" type="password" className={styles.regularText} autoComplete="new-password"
                    placeholder="••••••••" value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                    disabled={saving || smtpEnabled !== 'true'} />
                </div>
              </div>
            </div>

            <div className={styles.panel}>
              <h3 className={styles.sectionTitle}>Sender</h3>
              <div className={styles.formTable}>
                <label className={styles.formLabel} htmlFor="smtp_from">From address</label>
                <div className={styles.formField}>
                  <input id="smtp_from" type="text" className={styles.regularText}
                    placeholder='Site Name <no-reply@example.com>' value={smtpFrom}
                    onChange={(e) => setSmtpFrom(e.target.value)}
                    disabled={saving || smtpEnabled !== 'true'} />
                  <p className={styles.fieldHint}>Supports <code>Name &lt;address&gt;</code> format.</p>
                </div>
              </div>
            </div>

          </div>

          <SaveBar dirty={tabDirty.Email} saving={saving} disabled={saving || !isDirty(curEmail, savedEmail)}>
              <button
                type="button"
                className={styles.secondaryButton}
                title="Save first, then test. The test email goes to your account email address."
                disabled={testingEmail || saving || smtpEnabled !== 'true' || !smtpHost}
                onClick={async () => {
                  setTestingEmail(true);
                  try {
                    const result = await sendTestEmail();
                    toast.success(`Test email sent to ${result.to}`);
                  } catch {
                    toast.error('Failed to send test email. Check your SMTP credentials.');
                  } finally {
                    setTestingEmail(false);
                  }
                }}
              >
                {testingEmail ? 'Sending…' : 'Send test email'}
              </button>
          </SaveBar>

        </form>
        <div className={styles.panel}>
          <h3 className={styles.sectionTitle}>Emails the site sends</h3>
          <p className={styles.sectionDesc}>
            Every email, shown with sample data exactly as people receive it. “Send me this” delivers the sample to your own inbox.
          </p>
          <EmailPreviews />
        </div>
        </>
      ) : tab === 'Telegram' ? (
        /* ═══════════════ TELEGRAM ═══════════════ */
        <form onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!tgTokenValid || !tgChatValid) return;
          const next = { ...telegram, telegram_chat_id: telegram.telegram_chat_id.trim(), telegram_bot_token: telegram.telegram_bot_token.trim() };
          save(next, () => { setTelegram(next); setSavedTelegram(next); });
        }}>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Posting</h3>
            <div className={styles.emailToggleRow}>
              <div className={styles.emailToggleInfo}>
                <p className={styles.emailToggleDesc}>
                  Announces posts, events and polls in your Telegram channel the first time they go live.
                  Each post’s Telegram box can override this.
                </p>
              </div>
              <label className={styles.emailToggleSwitch}>
                <input
                  type="checkbox"
                  checked={tgOn('telegram_enabled')}
                  onChange={(e) => setTg('telegram_enabled', e.target.checked ? 'yes' : 'no')}
                  disabled={saving}
                />
                <span className={styles.emailToggleTrack} />
                <span className={styles.emailToggleLabel}>{tgOn('telegram_enabled') ? 'On' : 'Off'}</span>
              </label>
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Bot and channel</h3>
            <ol className={`${styles.fieldHint} ${styles.setupSteps}`}>
              <li>In Telegram, message <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a>, send <code>/newbot</code> and copy the token it gives you.</li>
              <li>Add the bot to your channel as an admin with “Post messages”, “Edit messages” and “Delete messages” on.</li>
              <li>Paste both below, save, then send a test message.</li>
            </ol>
            <div className={styles.formTable}>
              <label className={styles.formLabel} htmlFor="telegram_bot_token">Bot token</label>
              <div className={styles.formField}>
                <input id="telegram_bot_token" type="password" className={styles.regularText} autoComplete="new-password"
                  spellCheck={false} placeholder="123456789:AAE…" value={telegram.telegram_bot_token}
                  aria-invalid={!tgTokenValid} aria-describedby="telegram_bot_token_hint"
                  onChange={(e) => setTg('telegram_bot_token', e.target.value)} disabled={saving} />
                <p id="telegram_bot_token_hint" className={styles.fieldHint}>
                  {tgTokenValid
                    ? 'Kept on the server and never shown again. Anyone with it can post as your bot.'
                    : <strong>That doesn’t look like a bot token. It’s a number, a colon, then a long code.</strong>}
                </p>
              </div>

              <label className={styles.formLabel} htmlFor="telegram_chat_id">Channel</label>
              <div className={styles.formField}>
                <input id="telegram_chat_id" type="text" className={styles.regularText} autoComplete="off"
                  spellCheck={false} placeholder="@yourchannel" value={telegram.telegram_chat_id}
                  aria-invalid={!tgChatValid} aria-describedby="telegram_chat_id_hint"
                  onChange={(e) => setTg('telegram_chat_id', e.target.value)} disabled={saving} />
                <p id="telegram_chat_id_hint" className={styles.fieldHint}>
                  {tgChatValid
                    ? <>A public channel’s <code>@username</code>, or a private channel’s ID such as <code>-1001234567890</code>.</>
                    : <strong>Use the channel’s @username or its numeric ID.</strong>}
                </p>
              </div>
            </div>
            <div className={styles.testRow}>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={testingTelegram || saving || !telegram.telegram_bot_token || !telegram.telegram_chat_id || !tgTokenValid || !tgChatValid}
                onClick={async () => {
                  setTestingTelegram(true);
                  try {
                    const result = await sendTelegramTest({ token: telegram.telegram_bot_token, chatId: telegram.telegram_chat_id.trim() });
                    toast.success(`@${result.bot} posted a test message in ${result.chat}`);
                  } catch (err) {
                    toast.error(errMsg(err, 'The test message couldn’t be sent'));
                  } finally {
                    setTestingTelegram(false);
                  }
                }}
              >
                {testingTelegram ? 'Sending…' : 'Send test message'}
              </button>
              <span className={styles.fieldHint}>Checks the bot can post there and sends a short message. Works before saving.</span>
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>What gets posted</h3>
            <p className={styles.sectionDesc}>Each type has its own look in the channel, so readers can tell them apart at a glance.</p>
            <div className={styles.formTable}>
              <span className={styles.formLabel}>Content</span>
              <div className={`${styles.formField} ${styles.checkStack}`}>
                {TELEGRAM_TYPES.map((t) => (
                  <CheckField key={t.key} id={t.key} label={t.label} hint={t.hint}
                    checked={tgOn(t.key)} onChange={(v) => setTg(t.key, v ? 'yes' : 'no')} disabled={saving} />
                ))}
              </div>

              <span className={styles.formLabel}>Live blogs</span>
              <div className={styles.formField}>
                <CheckField id="telegram_live_updates" label="Post each new update as a reply to the live blog’s message"
                  hint="Edits and deletions show up in the channel too, and closing coverage posts a final message."
                  checked={tgOn('telegram_live_updates')} onChange={(v) => setTg('telegram_live_updates', v ? 'yes' : 'no')} disabled={saving} />
              </div>

              <span className={styles.formLabel}>Messages</span>
              <div className={`${styles.formField} ${styles.checkStack}`}>
                <CheckField id="telegram_include_image" label="Include the featured image"
                  checked={tgOn('telegram_include_image')} onChange={(v) => setTg('telegram_include_image', v ? 'yes' : 'no')} disabled={saving} />
                <CheckField id="telegram_category_tags" label="Add the post’s categories as hashtags"
                  checked={tgOn('telegram_category_tags')} onChange={(v) => setTg('telegram_category_tags', v ? 'yes' : 'no')} disabled={saving} />
                <CheckField id="telegram_silent" label="Send silently"
                  hint="Subscribers get the message without a notification sound."
                  checked={tgOn('telegram_silent')} onChange={(v) => setTg('telegram_silent', v ? 'yes' : 'no')} disabled={saving} />
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Recent messages</h3>
            <p className={styles.sectionDesc}>
              Everything sent to the channel. Failed sends are tried again on their own a few times; Retry sends one now.
            </p>
            <TelegramDeliveries />
          </div>

          <SaveBar dirty={tabDirty.Telegram} saving={saving} disabled={saving || !tgTokenValid || !tgChatValid || !isDirty(telegram, savedTelegram)} />
        </form>
      ) : tab === 'Notifications' ? (
        /* ═══════════════ NOTIFICATIONS ═══════════════ */
        <div>
          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Notification preferences</h3>
            <p className={styles.sectionDesc}>
              Choose how you want to be notified for each event type.
              <strong> In-App</strong> notifications appear in the bell menu.
              <strong> Email</strong> notifications are sent to your account email address.
            </p>

            {notifLoadError ? (
              <div className={styles.errorBanner}>
                <strong>Setup required:</strong> {notifLoadError}
              </div>
            ) : notifLoading || notifPrefs.length === 0 ? (
              <p className={styles.sectionDesc}>{notifLoading ? 'Loading preferences…' : 'No preferences loaded.'}</p>
            ) : (
              <div className={styles.notifList}>
                {notifPrefs.map((pref) => (
                  <div key={pref.type} className={`${styles.notifRow} ${!pref.enabled ? styles.notifRowDisabled : ''}`}>
                    <div className={styles.notifInfo}>
                      <div className={styles.notifToggleWrap}>
                        <label className={styles.notifToggle}>
                          <input
                            type="checkbox"
                            checked={pref.enabled}
                            onChange={(e) => updateNotifPref(pref.type, { enabled: e.target.checked })}
                          />
                          <span className={styles.notifToggleTrack} />
                        </label>
                        <span className={styles.notifLabel}>{pref.label}</span>
                      </div>
                      <p className={styles.notifDesc}>{pref.description}</p>
                      {pref.hasThreshold && pref.enabled && (
                        <div className={styles.notifThreshold}>
                          <label className={styles.notifThresholdLabel}>{pref.thresholdLabel}</label>
                          <input
                            type="number"
                            className={styles.smallText}
                            value={pref.threshold ?? pref.thresholdDefault ?? ''}
                            min={1}
                            onChange={(e) => updateNotifPref(pref.type, { threshold: parseInt(e.target.value) || null })}
                          />
                        </div>
                      )}
                    </div>

                    <div className={styles.notifControls}>
                      <select
                        className={styles.selectInput}
                        value={pref.channel}
                        disabled={!pref.enabled}
                        onChange={(e) => updateNotifPref(pref.type, { channel: e.target.value as NotificationChannel })}
                      >
                        <option value="inapp">In-App only</option>
                        <option value="email">Email only</option>
                        <option value="both">In-App + Email</option>
                        <option value="none">None (silent)</option>
                      </select>

                      <button
                        type="button"
                        className={styles.testNotifButton}
                        disabled={!pref.enabled || testingNotif === pref.type}
                        onClick={async () => {
                          setTestingNotif(pref.type);
                          try {
                            await sendTestNotification(pref.type);
                            toast.success(`Test notification sent for "${pref.label}"`);
                          } catch {
                            toast.error('Failed to send test notification');
                          } finally {
                            setTestingNotif(null);
                          }
                        }}
                      >
                        {testingNotif === pref.type ? 'Sending…' : 'Test'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
          <SaveBar saving={savingNotif} disabled={savingNotif || notifPrefs.length === 0} label="Save preferences" onSave={saveNotifPrefs} />
        </div>
      ) : null}
        </div>
      </div>
    </AdminLayout>
  );
}
