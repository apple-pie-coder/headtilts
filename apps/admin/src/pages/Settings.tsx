import React, { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { AdminLayout } from '../components/AdminLayout';
import { MediaPickerInput } from '../components/MediaPickerInput';
import { useToast } from '../components/ToastContext';
import { fetchSettings, updateSettings, sendTestEmail } from '../services/settings';
import { fetchPosts } from '../services/posts';
import {
  fetchNotificationPreferences, updateNotificationPreferences, sendTestNotification,
  NotificationPreference, NotificationChannel,
} from '../services/notifications';
import { Post, Setting } from '../types';
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
  { value: 'mystery',          label: 'Mystery Person', desc: 'A silhouette outline' },
  { value: 'blank',            label: 'Blank',          desc: 'A transparent image' },
  { value: 'gravatar_default', label: 'Gravatar Logo',  desc: 'The Gravatar logo' },
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

const TABS = ['General', 'Reading', 'Discussion', 'Media', 'Permalinks', 'Email', 'Notifications'] as const;
type Tab = (typeof TABS)[number];

export default function SettingsPage() {
  const toast = useToast();
  const [tab, setTab]     = useState<Tab>('General');
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  // ── Pages list (for Reading tab front-page pickers) ──
  const [pages, setPages] = useState<Post[]>([]);

  // ── General ──
  const [siteTitle,       setSiteTitle]       = useState('');
  const [siteTagline,     setSiteTagline]     = useState('');
  const [showTagline,     setShowTagline]     = useState('yes');
  const [siteLogo,        setSiteLogo]        = useState('');
  const [siteLogoDark,    setSiteLogoDark]    = useState('');
  const [siteLogoHeight,  setSiteLogoHeight]  = useState('');
  const [adminLogoHeight, setAdminLogoHeight] = useState('');
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
      const sd   = g(all, 'site_description');
      const em   = g(all, 'admin_email');
      const tz   = g(all, 'timezone', 'UTC');
      const df   = g(all, 'date_format', 'F j, Y');
      const tf   = g(all, 'time_format', 'g:i a');
      const wso  = g(all, 'week_starts_on', '0');
      setSiteTitle(st); setSiteTagline(stag); setShowTagline(stg); setSiteLogo(slg); setSiteLogoDark(slgd);
      setSiteLogoHeight(slgh); setAdminLogoHeight(algh); setSiteDescription(sd);
      setAdminEmail(em); setTimezone(tz); setDateFormat(df); setTimeFormat(tf);
      setWeekStartsOn(wso);
      if (!DATE_FORMAT_PRESETS.includes(df)) setCustomDate(df);
      if (!TIME_FORMAT_PRESETS.includes(tf)) setCustomTime(tf);
      setSavedGeneral({ site_title: st, site_tagline: stag, show_tagline: stg, site_logo: slg, site_logo_dark: slgd,
        site_logo_height: slgh, admin_logo_height: algh, site_description: sd,
        admin_email: em, timezone: tz, date_format: df, time_format: tf, week_starts_on: wso });

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
    site_description: siteDescription, admin_email: adminEmail, timezone, date_format: dateFormat,
    time_format: timeFormat, week_starts_on: weekStartsOn };
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

  const isDirty = (cur: Record<string, string>, saved: Record<string, string>) =>
    Object.entries(cur).some(([k, v]) => saved[k] !== v);

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
      <h2 className={styles.pageTitle}>Settings</h2>

      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={t === tab ? styles.tabActive : styles.tab}
            onClick={() => switchTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.panel}><p className={styles.loadingText}>Loading…</p></div>
      ) : tab === 'General' ? (
        /* ═══════════════ GENERAL ═══════════════ */
        <form onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save(curGeneral, () => setSavedGeneral({ ...curGeneral }));
        }}>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Site Identity</h3>
            <div className={styles.formTable}>
              <label className={styles.formLabel} htmlFor="site_title">Site Title</label>
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

              <label className={styles.formLabel}>Logo</label>
              <div className={styles.formField}>
                <MediaPickerInput value={siteLogo} onChange={setSiteLogo} disabled={saving} />
                <p className={styles.fieldHint}>Shown in the site header, admin sidebar and login. Leave empty to use the site title text.</p>
              </div>

              <label className={styles.formLabel}>Dark Mode Logo</label>
              <div className={styles.formField}>
                <MediaPickerInput value={siteLogoDark} onChange={setSiteLogoDark} disabled={saving} />
                <p className={styles.fieldHint}>Used in the site header when a visitor has dark mode enabled. Leave empty to reuse the logo above.</p>
              </div>

              <label className={styles.formLabel} htmlFor="site_logo_height">Public Logo Height</label>
              <div className={styles.formField}>
                <input
                  id="site_logo_height" type="number" min="16" max="200" step="1"
                  className={styles.regularText} style={{ width: '120px' }}
                  placeholder="32"
                  value={siteLogoHeight}
                  onChange={(e) => setSiteLogoHeight(e.target.value)}
                  disabled={saving}
                />
                <p className={styles.fieldHint}>Logo height in pixels for the public site header. Leave empty for the default (32 px).</p>
              </div>

              <label className={styles.formLabel} htmlFor="admin_logo_height">Admin Logo Height</label>
              <div className={styles.formField}>
                <input
                  id="admin_logo_height" type="number" min="16" max="200" step="1"
                  className={styles.regularText} style={{ width: '120px' }}
                  placeholder="32"
                  value={adminLogoHeight}
                  onChange={(e) => setAdminLogoHeight(e.target.value)}
                  disabled={saving}
                />
                <p className={styles.fieldHint}>Logo height in pixels for the admin sidebar. Leave empty for the default (32 px).</p>
              </div>

              <label className={styles.formLabel} htmlFor="site_description">Site Description</label>
              <div className={styles.formField}>
                <textarea id="site_description" className={styles.largeText} value={siteDescription}
                  onChange={(e) => setSiteDescription(e.target.value)} rows={3} disabled={saving} />
                <p className={styles.fieldHint}>A brief description used in meta tags and RSS feeds.</p>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Administration</h3>
            <div className={styles.formTable}>
              <label className={styles.formLabel} htmlFor="admin_email">Administration Email Address</label>
              <div className={styles.formField}>
                <input id="admin_email" type="email" className={styles.regularText} value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)} disabled={saving} />
                <p className={styles.fieldHint}>This address is used for site administration notifications.</p>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Date &amp; Time</h3>
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

              <span className={styles.formLabel}>Date Format</span>
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

              <span className={styles.formLabel}>Time Format</span>
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

              <label className={styles.formLabel} htmlFor="week_starts_on">Week Starts On</label>
              <div className={styles.formField}>
                <select id="week_starts_on" className={styles.selectInput} value={weekStartsOn}
                  onChange={(e) => setWeekStartsOn(e.target.value)} disabled={saving}>
                  {WEEK_DAYS.map((d, i) => <option key={i} value={String(i)}>{d}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className={styles.submitRow}>
            <button type="submit" className={styles.saveButton}
              disabled={saving || !isDirty(curGeneral, savedGeneral)}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>

      ) : tab === 'Reading' ? (
        /* ═══════════════ READING ═══════════════ */
        <form onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save(curReading, () => setSavedReading({ ...curReading }));
        }}>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Front Page Displays</h3>
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

              <label className={styles.formLabel} htmlFor="posts_per_rss">Syndication feeds show the most recent</label>
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
            <h3 className={styles.sectionTitle}>Special Pages</h3>
            <p className={styles.fieldHint} style={{ marginBottom: '1rem' }}>
              Designate which pages serve specific roles across the site (navigation links, routing, etc.).
            </p>
            <div className={styles.formTable}>
              {(
                [
                  { label: 'Contact Page',        value: contactPageId,  set: setContactPageId  },
                  { label: 'About Page',          value: aboutPageId,    set: setAboutPageId    },
                  { label: 'Privacy Policy Page', value: privacyPageId,  set: setPrivacyPageId  },
                  { label: 'Terms Page',          value: termsPageId,    set: setTermsPageId    },
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
            <h3 className={styles.sectionTitle}>Table of Contents</h3>
            <div className={styles.formTable}>
              <span className={styles.formLabel}>Show Table of Contents</span>
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
            <h3 className={styles.sectionTitle}>Search Engine Visibility</h3>
            <div className={styles.formTable}>
              <span className={styles.formLabel}>Search engines</span>
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

          <div className={styles.submitRow}>
            <button type="submit" className={styles.saveButton}
              disabled={saving || !isDirty(curReading, savedReading)}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>

      ) : tab === 'Discussion' ? (
        /* ═══════════════ DISCUSSION ═══════════════ */
        <form onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save(curDiscussion, () => setSavedDiscussion({ ...curDiscussion }));
        }}>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Default Post Settings</h3>
            <div className={styles.checkStack}>
              <CheckField id="default_comment_status"
                label="Allow people to submit comments on new posts"
                hint="Individual posts can override this in the post editor."
                checked={commentStatus === 'open'}
                onChange={(v) => setCommentStatus(v ? 'open' : 'closed')} disabled={saving} />
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Other Comment Settings</h3>
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
            <h3 className={styles.sectionTitle}>Email Me Whenever</h3>
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
              <span className={styles.formLabel}>Avatar Display</span>
              <div className={styles.formField}>
                <CheckField id="show_avatars"
                  label="Show Avatars"
                  checked={showAvatars === 'yes'}
                  onChange={(v) => setShowAvatars(v ? 'yes' : 'no')} disabled={saving} />
              </div>

              <span className={styles.formLabel}>Maximum Rating</span>
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

              <span className={styles.formLabel}>Default Avatar</span>
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

          <div className={styles.submitRow}>
            <button type="submit" className={styles.saveButton}
              disabled={saving || !isDirty(curDiscussion, savedDiscussion)}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>

      ) : tab === 'Media' ? (
        /* ═══════════════ MEDIA ═══════════════ */
        <form onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save(curMedia, () => setSavedMedia({ ...curMedia }));
        }}>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Image Sizes</h3>
            <p className={styles.fieldHint} style={{ marginBottom: '1.25rem' }}>
              The sizes listed below determine the maximum dimensions in pixels to use when inserting an image into the body of a post. Enter <strong>0</strong> for no resizing.
            </p>

            {/* Thumbnail */}
            <div className={styles.imageSizeBlock}>
              <div className={styles.imageSizeTitle}>Thumbnail size</div>
              <div className={styles.formTable}>
                <label className={styles.formLabel} htmlFor="thumb_w">Width</label>
                <div className={styles.formField}>
                  <span className={styles.inlineField}>
                    <input id="thumb_w" type="number" className={styles.smallText} min={0}
                      value={thumbW} onChange={(e) => setThumbW(e.target.value)} disabled={saving} />
                    <span className={styles.inputSuffix}>px</span>
                  </span>
                </div>

                <label className={styles.formLabel} htmlFor="thumb_h">Height</label>
                <div className={styles.formField}>
                  <span className={styles.inlineField}>
                    <input id="thumb_h" type="number" className={styles.smallText} min={0}
                      value={thumbH} onChange={(e) => setThumbH(e.target.value)} disabled={saving} />
                    <span className={styles.inputSuffix}>px</span>
                  </span>
                </div>

                <span className={styles.formLabel}>Crop</span>
                <div className={styles.formField}>
                  <CheckField id="thumbnail_crop"
                    label="Crop thumbnail to exact dimensions (normally thumbnails are proportional)"
                    checked={thumbCrop === 'yes'}
                    onChange={(v) => setThumbCrop(v ? 'yes' : 'no')} disabled={saving} />
                </div>
              </div>
            </div>

            {/* Medium */}
            <div className={styles.imageSizeBlock}>
              <div className={styles.imageSizeTitle}>Medium size</div>
              <div className={styles.formTable}>
                <label className={styles.formLabel} htmlFor="medium_w">Max Width</label>
                <div className={styles.formField}>
                  <span className={styles.inlineField}>
                    <input id="medium_w" type="number" className={styles.smallText} min={0}
                      value={mediumW} onChange={(e) => setMediumW(e.target.value)} disabled={saving} />
                    <span className={styles.inputSuffix}>px</span>
                  </span>
                </div>

                <label className={styles.formLabel} htmlFor="medium_h">Max Height</label>
                <div className={styles.formField}>
                  <span className={styles.inlineField}>
                    <input id="medium_h" type="number" className={styles.smallText} min={0}
                      value={mediumH} onChange={(e) => setMediumH(e.target.value)} disabled={saving} />
                    <span className={styles.inputSuffix}>px</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Large */}
            <div className={styles.imageSizeBlock}>
              <div className={styles.imageSizeTitle}>Large size</div>
              <div className={styles.formTable}>
                <label className={styles.formLabel} htmlFor="large_w">Max Width</label>
                <div className={styles.formField}>
                  <span className={styles.inlineField}>
                    <input id="large_w" type="number" className={styles.smallText} min={0}
                      value={largeW} onChange={(e) => setLargeW(e.target.value)} disabled={saving} />
                    <span className={styles.inputSuffix}>px</span>
                  </span>
                </div>

                <label className={styles.formLabel} htmlFor="large_h">Max Height</label>
                <div className={styles.formField}>
                  <span className={styles.inlineField}>
                    <input id="large_h" type="number" className={styles.smallText} min={0}
                      value={largeH} onChange={(e) => setLargeH(e.target.value)} disabled={saving} />
                    <span className={styles.inputSuffix}>px</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Uploading Files</h3>
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
            <h3 className={styles.sectionTitle}>Allowed File Types</h3>
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
            <h3 className={styles.sectionTitle}>Image Delivery</h3>
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

          <div className={styles.submitRow}>
            <button type="submit" className={styles.saveButton}
              disabled={saving || !isDirty(curMedia, savedMedia)}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>

      ) : tab === 'Permalinks' ? (
        /* ═══════════════ PERMALINKS ═══════════════ */
        <div className={styles.panel}>
          <form onSubmit={(e: FormEvent) => {
            e.preventDefault();
            save({ permalink_structure: structure }, () => setSavedStructure(structure));
          }}>
            <p className={styles.intro}>
              Choose the structure used to build URLs for your posts.
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
                  <div className={styles.optionLabel}>Custom Structure</div>
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

            <div className={styles.actions}>
              <button type="submit" className={styles.saveButton}
                disabled={saving || structure === savedStructure || !structure}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      ) : tab === 'Email' ? (
        /* ═══════════════ EMAIL (SMTP) ═══════════════ */
        <form onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save(curEmail, () => setSavedEmail({ ...curEmail }));
        }}>
          <div className={styles.panel}>

            {/* Enable / Disable row */}
            <div className={styles.emailToggleRow}>
              <div className={styles.emailToggleInfo}>
                <h3 className={styles.emailToggleTitle}>Email Sending</h3>
                <p className={styles.emailToggleDesc}>
                  When disabled, password resets and notifications are suppressed (logged to console instead).
                </p>
              </div>
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

            <hr className={styles.formDivider} />

            {/* All SMTP fields — muted when disabled */}
            <div className={smtpEnabled !== 'true' ? styles.panelMuted : undefined}>

              <p className={styles.sectionDesc} style={{ marginBottom: '1.25rem' }}>
                These settings override the <code>SMTP_*</code> environment variables.
                Leave blank to fall back to the values in <code>.env</code>.
              </p>

              {/* Server */}
              <p className={styles.emailGroupLabel}>Server</p>

              <div className={styles.formTable}>
                <label className={styles.formLabel} htmlFor="smtp_host">Host</label>
                <div className={styles.formField}>
                  <input id="smtp_host" type="text" className={styles.regularText}
                    placeholder="smtp.example.com" value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    disabled={saving || smtpEnabled !== 'true'} />
                </div>
              </div>

              <div className={styles.formTable}>
                <label className={styles.formLabel} htmlFor="smtp_port">Port</label>
                <div className={styles.formField}>
                  <div className={styles.inlineRow}>
                    <input id="smtp_port" type="number" className={styles.smallText}
                      placeholder="587" value={smtpPort}
                      onChange={(e) => setSmtpPort(e.target.value)}
                      disabled={saving || smtpEnabled !== 'true'} />
                    <select className={styles.selectInput}
                      value={smtpSecure}
                      onChange={(e) => setSmtpSecure(e.target.value)}
                      disabled={saving || smtpEnabled !== 'true'}>
                      <option value="false">STARTTLS</option>
                      <option value="true">SSL / TLS</option>
                    </select>
                  </div>
                  <p className={styles.description}>587 = STARTTLS · 465 = SSL/TLS</p>
                </div>
              </div>

              {/* Credentials */}
              <p className={styles.emailGroupLabel} style={{ marginTop: '1.25rem' }}>Credentials</p>

              <div className={styles.formTable}>
                <label className={styles.formLabel} htmlFor="smtp_user">Username</label>
                <div className={styles.formField}>
                  <input id="smtp_user" type="text" className={styles.regularText} autoComplete="off"
                    placeholder="user@example.com" value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                    disabled={saving || smtpEnabled !== 'true'} />
                </div>
              </div>

              <div className={styles.formTable}>
                <label className={styles.formLabel} htmlFor="smtp_pass">Password</label>
                <div className={styles.formField}>
                  <input id="smtp_pass" type="password" className={styles.regularText} autoComplete="new-password"
                    placeholder="••••••••" value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                    disabled={saving || smtpEnabled !== 'true'} />
                </div>
              </div>

              {/* Sender */}
              <p className={styles.emailGroupLabel} style={{ marginTop: '1.25rem' }}>Sender</p>

              <div className={styles.formTable}>
                <label className={styles.formLabel} htmlFor="smtp_from">From address</label>
                <div className={styles.formField}>
                  <input id="smtp_from" type="text" className={styles.regularText}
                    placeholder='Site Name <no-reply@example.com>' value={smtpFrom}
                    onChange={(e) => setSmtpFrom(e.target.value)}
                    disabled={saving || smtpEnabled !== 'true'} />
                  <p className={styles.description}>Supports <code>Name &lt;address&gt;</code> format.</p>
                </div>
              </div>

            </div>

            <hr className={styles.formDivider} />

            {/* Actions */}
            <div className={styles.emailActions}>
              <button type="submit" className={styles.saveButton}
                disabled={saving || !isDirty(curEmail, savedEmail)}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
              <button
                type="button"
                className={styles.testEmailButton}
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
                {testingEmail ? 'Sending…' : 'Send Test Email'}
              </button>
              <p className={styles.description}>
                Save first, then test. Test email goes to your account address.
              </p>
            </div>

          </div>
        </form>
      ) : tab === 'Notifications' ? (
        /* ═══════════════ NOTIFICATIONS ═══════════════ */
        <div>
          <div className={styles.panel}>
            <h3 className={styles.sectionTitle}>Notification Preferences</h3>
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

            <div className={styles.actions} style={{ marginTop: '1.5rem' }}>
              <button
                type="button"
                className={styles.saveButton}
                onClick={saveNotifPrefs}
                disabled={savingNotif || notifPrefs.length === 0}
              >
                {savingNotif ? 'Saving…' : 'Save Preferences'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
}
