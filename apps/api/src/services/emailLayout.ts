import { prisma } from '../config/database';

/**
 * One look for every email the CMS sends: the site name with a red tape label
 * (like the public site's category labels), a heading, then simple blocks.
 * Built from tables with inline styles, which is what Gmail, Outlook and
 * Apple Mail all render the same way. Every string passed in is plain text
 * and gets escaped here, so visitor-written text can't add links or markup.
 * A plain-text version is produced alongside the HTML.
 */

export type EmailBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'details'; rows: { label: string; value: string; href?: string }[] }
  | { type: 'quote'; text: string; cite?: string }
  | { type: 'code'; label: string; code: string }
  | { type: 'image'; cid: string; alt: string; width: number; caption?: string }
  | { type: 'notice'; tone: 'success' | 'danger' | 'warning' | 'info'; text: string }
  | { type: 'links'; links: { label: string; url: string }[] };

export interface EmailContent {
  /** Shown by inboxes next to the subject line. */
  preheader?: string;
  /** Small red tape label above the heading, e.g. "Ticket" or "Security". */
  tag?: string;
  heading: string;
  /** Paragraphs separated by blank lines. */
  intro?: string;
  blocks?: EmailBlock[];
  button?: { label: string; url: string };
  /** Smaller links under the button. */
  secondary?: { label: string; url: string }[];
  /** Small print under the main content. */
  footnote?: string;
  /** Who the email is for, which decides the footer wording. */
  audience: 'reader' | 'staff';
}

export interface RenderedEmail { html: string; text: string }

const INK = '#1d1d1f';
const MUTED = '#6e6e73';
const RULE = '#e5e5ea';
const TAPE = '#c3301f';
const PAGE = '#f4f4f6';
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const TONES = {
  success: { bg: '#e8f6ec', border: '#2e9e55', ink: '#1d5c33' },
  danger: { bg: '#fdecea', border: '#c3301f', ink: '#8a1f13' },
  warning: { bg: '#fff6e0', border: '#d99a00', ink: '#6b4c00' },
  info: { bg: '#eef4ff', border: '#0071e3', ink: '#0b3d82' },
};

export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only http(s) and mailto links make it into an email. */
function safeUrl(url: string): string {
  return /^(https?:|mailto:)/i.test(url) ? url : '#';
}

function paragraphs(text: string, style: string): string {
  return text.split(/\n{2,}/).map((p) =>
    `<p style="${style}">${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
}

export function siteUrl(): string {
  return (process.env.SITE_URL || 'http://localhost:5173').replace(/\/$/, '');
}

/** Absolute link into the admin panel, e.g. adminUrl('/admin/comments'). */
export function adminUrl(path = '/admin'): string {
  return `${siteUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

let siteCache: { title: string; logo: string | null; at: number } | null = null;
export async function siteInfo(): Promise<{ title: string; logo: string | null }> {
  if (siteCache && Date.now() - siteCache.at < 60_000) return siteCache;
  const rows = await prisma.setting.findMany({ where: { key: { in: ['site_title', 'site_logo'] } } }).catch(() => []);
  const s: Record<string, string> = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  siteCache = { title: s.site_title || 'Headtilts', logo: s.site_logo || null, at: Date.now() };
  return siteCache;
}

function blockHtml(b: EmailBlock): string {
  switch (b.type) {
    case 'paragraph':
      return paragraphs(b.text, `margin:0 0 16px;font:16px/1.6 ${FONT};color:${INK};`);
    case 'details':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse;">${
        b.rows.map((r, i) => `<tr>
          <td valign="top" width="112" style="padding:10px 14px 10px 0;width:112px;font:13px/1.5 ${FONT};color:${MUTED};${i ? `border-top:1px solid ${RULE};` : ''}">${esc(r.label)}</td>
          <td valign="top" style="padding:10px 0;font:15px/1.5 ${FONT};color:${INK};font-weight:600;${i ? `border-top:1px solid ${RULE};` : ''}">${
            r.href ? `<a href="${esc(safeUrl(r.href))}" style="color:${INK};text-decoration:underline;">${esc(r.value)}</a>` : esc(r.value).replace(/\n/g, '<br>')
          }</td></tr>`).join('')
      }</table>`;
    case 'quote':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse;"><tr>
        <td style="border-left:3px solid ${TAPE};background:${PAGE};padding:14px 16px;border-radius:0 8px 8px 0;">
          ${paragraphs(b.text, `margin:0 0 8px;font:15px/1.6 ${FONT};color:${INK};`)}
          ${b.cite ? `<p style="margin:0;font:13px/1.4 ${FONT};color:${MUTED};">${esc(b.cite)}</p>` : ''}
        </td></tr></table>`;
    case 'code':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr>
        <td align="center" style="border:1px dashed #c7c7cc;border-radius:10px;padding:14px;">
          <p style="margin:0 0 4px;font:12px/1.4 ${FONT};color:${MUTED};text-transform:uppercase;letter-spacing:0.06em;">${esc(b.label)}</p>
          <p style="margin:0;font:600 17px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;color:${INK};letter-spacing:0.02em;word-break:break-all;">${esc(b.code)}</p>
        </td></tr></table>`;
    case 'image':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td align="center">
        <img src="cid:${esc(b.cid)}" width="${b.width}" height="${b.width}" alt="${esc(b.alt)}" style="display:block;border:0;width:${b.width}px;height:${b.width}px;">
        ${b.caption ? `<p style="margin:8px 0 0;font:13px/1.4 ${FONT};color:${MUTED};">${esc(b.caption)}</p>` : ''}
      </td></tr></table>`;
    case 'notice': {
      const t = TONES[b.tone];
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr>
        <td style="background:${t.bg};border-left:4px solid ${t.border};border-radius:0 8px 8px 0;padding:12px 14px;font:15px/1.5 ${FONT};color:${t.ink};">${esc(b.text).replace(/\n/g, '<br>')}</td>
      </tr></table>`;
    }
    case 'links':
      return `<p style="margin:0 0 20px;font:14px/1.8 ${FONT};color:${MUTED};">${
        b.links.map((l) => `<a href="${esc(safeUrl(l.url))}" style="display:inline-block;color:${INK};text-decoration:underline;margin:0 16px 2px 0;">${esc(l.label)}</a>`).join(' ')
      }</p>`;
  }
}

function blockText(b: EmailBlock): string {
  switch (b.type) {
    case 'paragraph': return b.text;
    case 'details': return b.rows.map((r) => `${r.label}: ${r.value}${r.href && r.href !== r.value ? ` (${r.href})` : ''}`).join('\n');
    case 'quote': return b.text.split('\n').map((l) => `> ${l}`).join('\n') + (b.cite ? `\n${b.cite}` : '');
    case 'code': return `${b.label}: ${b.code}`;
    case 'image': return b.caption ?? '';
    case 'notice': return b.text;
    case 'links': return b.links.map((l) => `${l.label}: ${l.url}`).join('\n');
  }
}

export async function renderEmail(c: EmailContent): Promise<RenderedEmail> {
  const site = await siteInfo();
  const base = siteUrl();
  const host = base.replace(/^https?:\/\//, '');
  // Remote images only load for recipients when the site is public (https);
  // on a local address the name is shown as text instead.
  const logoUrl = site.logo && base.startsWith('https://')
    ? (/^https?:/.test(site.logo) ? site.logo : `${base}${site.logo}`) : null;

  const footer = c.audience === 'staff'
    ? `Sent by the ${site.title} admin. <a href="${esc(adminUrl('/admin/settings?tab=notifications'))}" style="color:${MUTED};">Choose which emails you get</a>.`
    : `${esc(site.title)} · <a href="${esc(base)}" style="color:${MUTED};">${esc(host)}</a><br>You can reply to this email to reach our team.`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${esc(c.heading)}</title>
<style>
  @media (max-width: 480px) {
    .card { padding: 24px 20px 22px !important; }
    .heading { font-size: 22px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${PAGE};-webkit-text-size-adjust:100%;">
${c.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(c.preheader)}${'&#8204;&nbsp;'.repeat(40)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};">
  <tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding:0 8px 16px;">
        <a href="${esc(base)}" style="text-decoration:none;color:${INK};">${
          logoUrl
            ? `<img src="${esc(logoUrl)}" height="32" alt="${esc(site.title)}" style="display:block;border:0;height:32px;width:auto;">`
            : `<span style="font:800 20px/1 ${FONT};letter-spacing:-0.02em;color:${INK};">${esc(site.title)}</span>`
        }</a>
      </td></tr>
      <tr><td class="card" style="background:#ffffff;border-radius:16px;border:1px solid ${RULE};padding:32px 28px 28px;">
        ${c.tag ? `<span style="display:inline-block;margin:0 0 14px;padding:4px 10px;background:${TAPE};color:#ffffff;font:700 11px/1.2 ${FONT};letter-spacing:0.08em;text-transform:uppercase;transform:rotate(-2deg);">${esc(c.tag)}</span>` : ''}
        <h1 class="heading" style="margin:0 0 16px;font:800 24px/1.25 ${FONT};letter-spacing:-0.01em;color:${INK};">${esc(c.heading)}</h1>
        ${c.intro ? paragraphs(c.intro, `margin:0 0 18px;font:16px/1.6 ${FONT};color:${INK};`) : ''}
        ${(c.blocks ?? []).map(blockHtml).join('\n')}
        ${c.button ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;"><tr>
          <td style="border-radius:999px;background:${INK};">
            <a href="${esc(safeUrl(c.button.url))}" style="display:inline-block;padding:13px 26px;font:700 15px/1 ${FONT};color:#ffffff;text-decoration:none;border-radius:999px;">${esc(c.button.label)}</a>
          </td></tr></table>` : ''}
        ${c.secondary?.length ? blockHtml({ type: 'links', links: c.secondary }) : ''}
        ${c.footnote ? `<p style="margin:8px 0 0;padding-top:16px;border-top:1px solid ${RULE};font:13px/1.55 ${FONT};color:${MUTED};">${esc(c.footnote).replace(/\n/g, '<br>')}</p>` : ''}
      </td></tr>
      <tr><td style="padding:18px 8px 0;font:12px/1.6 ${FONT};color:${MUTED};text-align:center;">${footer}</td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    c.heading,
    c.intro,
    ...(c.blocks ?? []).map(blockText),
    c.button ? `${c.button.label}: ${c.button.url}` : '',
    ...(c.secondary ?? []).map((l) => `${l.label}: ${l.url}`),
    c.footnote,
    '—',
    c.audience === 'staff'
      ? `Sent by the ${site.title} admin. Choose which emails you get: ${adminUrl('/admin/settings?tab=notifications')}`
      : `${site.title} · ${base}\nYou can reply to this email to reach our team.`,
  ].filter(Boolean).join('\n\n');

  return { html, text };
}
