import sharp from 'sharp';
import { prisma } from '../config/database';
import { NotFoundError, ValidationError } from '../utils/errors';
import { esc, SVG_FONT, textWidth, truncate, wrap } from '../utils/svgText';

/**
 * A shareable picture of a finished poll's results, drawn as SVG and rasterised
 * by sharp. Text uses the fonts installed in the API image (Inter, then DejaVu).
 */

export const POLL_IMAGE_FORMATS = {
  square: { w: 1080, h: 1080 }, // Instagram / Facebook feed
  story: { w: 1080, h: 1920 },  // Instagram / WhatsApp status
  wide: { w: 1200, h: 630 },    // X, Facebook, LinkedIn link-style posts
} as const;
export type PollImageFormat = keyof typeof POLL_IMAGE_FORMATS;

const INK = '#1d1d1f';
const MUTED = '#6e6e73';
const TRACK = '#e8e8ed';
const LOSER = '#a1a1a6';
const ACCENT = '#0071e3';
const TAPE = '#c3301f';

// Per-format type scale and limits; everything else is derived from these. The wide
// card puts the question in a left column and the results in a right one.
const LAYOUT: Record<PollImageFormat, { pad: number; site: number; question: number; qLines: number; option: number; rowGap: number; bar: number; maxOptions: number; footer: number }> = {
  wide: { pad: 56, site: 24, question: 40, qLines: 5, option: 22, rowGap: 16, bar: 10, maxOptions: 6, footer: 20 },
  square: { pad: 84, site: 32, question: 58, qLines: 4, option: 32, rowGap: 30, bar: 18, maxOptions: 6, footer: 28 },
  story: { pad: 96, site: 38, question: 74, qLines: 5, option: 40, rowGap: 44, bar: 24, maxOptions: 9, footer: 34 },
};

export async function renderPollResultsImage(id: number, format: PollImageFormat): Promise<{ png: Buffer; filename: string }> {
  const poll = await prisma.poll.findUnique({
    where: { id },
    select: {
      slug: true, question: true, status: true, endsAt: true, updatedAt: true,
      options: { select: { text: true, order: true, _count: { select: { votes: true } } }, orderBy: { order: 'asc' } },
      _count: { select: { votes: true } },
    },
  });
  if (!poll) throw new NotFoundError('Poll not found');
  const ended = poll.status === 'closed' || (poll.status === 'open' && !!poll.endsAt && poll.endsAt <= new Date());
  if (!ended) throw new ValidationError('A results image is available once the poll has ended');

  const settings = Object.fromEntries(
    (await prisma.setting.findMany({ where: { key: { in: ['site_title', 'timezone'] } } })).map((s) => [s.key, s.value]),
  );
  const site = settings.site_title || 'Headtilts';
  const host = (process.env.SITE_URL || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const link = host ? `${host}/polls/${poll.slug}` : '';
  const closedOn = poll.endsAt && poll.endsAt <= new Date() ? poll.endsAt : poll.updatedAt;
  let closedText: string;
  try {
    closedText = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: settings.timezone || 'UTC' }).format(closedOn);
  } catch {
    closedText = closedOn.toUTCString().slice(5, 16);
  }

  const { w, h } = POLL_IMAGE_FORMATS[format];
  const L = LAYOUT[format];
  const inner = w - L.pad * 2;
  const total = poll._count.votes;
  const ranked = poll.options
    .map((o) => ({ text: o.text, votes: o._count.votes, pct: total ? Math.round((o._count.votes / total) * 100) : 0 }))
    .sort((a, b) => b.votes - a.votes);
  const best = ranked[0]?.votes ?? 0;

  // ── Columns: stacked on square/story; question left and results right on wide ──
  const wide = format === 'wide';
  const qX = L.pad;
  const qW = wide ? Math.round(inner * 0.42) : inner;
  const oX = wide ? L.pad + Math.round(inner * 0.48) : L.pad;
  const oW = wide ? inner - Math.round(inner * 0.48) : inner;

  const tapeH = Math.round(L.site * 1.5);
  const qLines = wrap(poll.question, L.question, qW, L.qLines);
  const qLineH = Math.round(L.question * 1.16);
  const rowH = Math.round(L.option * 1.3) + 10 + L.bar;
  const moreH = L.rowGap + L.option;
  const footerH = Math.round(L.footer * (wide ? 1.6 : 3.2));
  const top = L.pad + L.site * 2.2;
  const ruleY = h - L.pad - footerH;
  const bottom = ruleY - L.rowGap;
  const headH = tapeH + L.rowGap * 1.4 + qLines.length * qLineH;

  // Show as many options as fit above the footer, keeping room for "+ N more" when some don't.
  const optionsTop = wide ? top : top + headH + L.rowGap * 1.4;
  const fit = (room: number) => Math.max(1, Math.floor((room + L.rowGap) / (rowH + L.rowGap)));
  let count = Math.min(ranked.length, L.maxOptions, fit(bottom - optionsTop));
  if (count < ranked.length) count = Math.min(count, fit(bottom - optionsTop - moreH));
  const shown = ranked.slice(0, count);
  const hidden = ranked.length - shown.length;
  const optionsH = shown.length * rowH + Math.max(0, shown.length - 1) * L.rowGap + (hidden ? moreH : 0);

  const parts: string[] = [];
  parts.push(`<rect width="${w}" height="${h}" fill="#ffffff"/>`);
  parts.push(`<rect width="${w}" height="${Math.round(L.pad / 8)}" fill="${ACCENT}"/>`);
  parts.push(`<text x="${L.pad}" y="${L.pad + L.site}" font-size="${L.site}" font-weight="800" fill="${INK}" letter-spacing="-0.5">${esc(site)}</text>`);

  // Centre each column in the space between the site name and the footer
  // (slightly above centre on square, which reads better).
  const room = bottom - top;
  const lift = format === 'square' ? 0.4 : 0.5;
  let y = top + Math.max(0, (room - (wide ? headH : headH + L.rowGap * 1.4 + optionsH)) * lift);

  // Tilted red "tape" label, as on the public site.
  const tapeText = 'FINAL RESULTS';
  const tapeSize = Math.round(L.site * 0.62);
  const tapeW = Math.round(textWidth(tapeText, tapeSize, true) + tapeSize * 0.12 * tapeText.length + L.site * 1.1);
  parts.push(`<g transform="rotate(-3 ${qX} ${y + tapeH / 2})">
    <rect x="${qX}" y="${y}" width="${tapeW}" height="${tapeH}" rx="3" fill="${TAPE}"/>
    <text x="${qX + L.site * 0.55}" y="${y + tapeH * 0.67}" font-size="${tapeSize}" font-weight="800" fill="#ffffff" letter-spacing="${(tapeSize * 0.12).toFixed(1)}">${tapeText}</text>
  </g>`);
  y += tapeH + L.rowGap * 1.4;
  for (const line of qLines) {
    y += qLineH;
    parts.push(`<text x="${qX}" y="${y - qLineH * 0.22}" font-size="${L.question}" font-weight="800" fill="${INK}" letter-spacing="-1">${esc(line)}</text>`);
  }

  y = wide ? top + Math.max(0, (room - optionsH) * lift) : y + L.rowGap * 1.4;
  for (const [i, opt] of shown.entries()) {
    const winner = total > 0 && opt.votes === best;
    const pctText = `${opt.pct}%`;
    const pctW = textWidth(pctText, L.option, true);
    const label = truncate(winner ? `✓ ${opt.text}` : opt.text, L.option, oW - pctW - L.option, winner);
    const textY = y + L.option;
    parts.push(`<text x="${oX}" y="${textY}" font-size="${L.option}" font-weight="${winner ? 700 : 500}" fill="${winner ? ACCENT : INK}">${esc(label)}</text>`);
    parts.push(`<text x="${oX + oW}" y="${textY}" font-size="${L.option}" font-weight="800" fill="${winner ? ACCENT : INK}" text-anchor="end">${pctText}</text>`);
    const barY = textY + Math.round(L.option * 0.3) + 10;
    parts.push(`<rect x="${oX}" y="${barY}" width="${oW}" height="${L.bar}" rx="${L.bar / 2}" fill="${TRACK}"/>`);
    if (opt.pct > 0) {
      parts.push(`<rect x="${oX}" y="${barY}" width="${Math.max(L.bar, (oW * opt.pct) / 100)}" height="${L.bar}" rx="${L.bar / 2}" fill="${winner ? ACCENT : LOSER}"/>`);
    }
    y += rowH + (i < shown.length - 1 ? L.rowGap : 0);
  }
  if (hidden) {
    y += L.rowGap + L.option * 0.8;
    parts.push(`<text x="${oX}" y="${y}" font-size="${Math.round(L.option * 0.8)}" fill="${MUTED}">+ ${hidden} more option${hidden === 1 ? '' : 's'}</text>`);
  }

  // Footer: votes and closing date, then the link (side by side on the wide card).
  const meta = `${total.toLocaleString('en-GB')} vote${total === 1 ? '' : 's'} · Closed ${closedText}`;
  parts.push(`<rect x="${L.pad}" y="${ruleY}" width="${inner}" height="1.5" fill="${TRACK}"/>`);
  if (format === 'wide') {
    const fy = h - L.pad + L.footer * 0.2;
    parts.push(`<text x="${L.pad}" y="${fy}" font-size="${L.footer}" fill="${MUTED}">${esc(meta)}</text>`);
    if (link) parts.push(`<text x="${w - L.pad}" y="${fy}" font-size="${L.footer}" font-weight="700" fill="${ACCENT}" text-anchor="end">${esc(truncate(link, L.footer, inner * 0.5, true))}</text>`);
  } else {
    const fy = ruleY + L.footer * 1.7;
    parts.push(`<text x="${L.pad}" y="${fy}" font-size="${L.footer}" fill="${MUTED}">${esc(meta)}</text>`);
    if (link) parts.push(`<text x="${L.pad}" y="${fy + L.footer * 1.45}" font-size="${L.footer}" font-weight="700" fill="${ACCENT}">${esc(truncate(link, L.footer, inner, true))}</text>`);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${SVG_FONT}">${parts.join('')}</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return { png, filename: `${poll.slug}-results-${format}.png` };
}
