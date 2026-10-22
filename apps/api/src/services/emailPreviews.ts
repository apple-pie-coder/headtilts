import { prisma } from '../config/database';
import { NotFoundError } from '../utils/errors';
import { buildPostPath, getPermalinkStructure } from '../utils/permalinks';
import { renderEmail, siteUrl } from './emailLayout';
import * as emails from './emailContent';
import { sendBuilt } from './mail.service';
import { formatNow } from './security.service';

/**
 * Settings → Email → Previews: every email the site sends, built by the same
 * functions the real sends use, filled with sample data (a real upcoming event
 * and a real post where there is one).
 */

interface PreviewDef {
  id: string;
  group: 'Readers' | 'Your team' | 'Notifications';
  name: string;
  when: string;
  to: string;
  build: () => Promise<emails.BuiltEmail>;
}

async function samples() {
  const [event, post, user] = await Promise.all([
    prisma.event.findFirst({ where: { status: 'published', startAt: { gt: new Date() } }, orderBy: { startAt: 'asc' } }),
    prisma.post.findFirst({ where: { status: 'published', type: 'post' }, orderBy: { publishedAt: 'desc' }, select: { id: true, slug: true, title: true, publishedAt: true } }),
    prisma.user.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: { username: true, firstName: true } }),
  ]);
  const start = new Date(Date.now() + 14 * 86_400_000);
  start.setUTCHours(13, 30, 0, 0);
  const sampleEvent: emails.EmailEvent = event ?? {
    title: 'Headtilts Live: Summer Sessions', slug: 'sample-event', startAt: start,
    endAt: new Date(start.getTime() + 5 * 3_600_000), timezone: 'Asia/Kolkata', type: 'in_person',
    venueName: 'Blue Frog', venueAddress: 'Mathuradas Mills Compound', venueCity: 'Mumbai', venueCountry: 'India',
  };
  const postUrl = post ? `${siteUrl()}${buildPostPath(await getPermalinkStructure(), post)}` : `${siteUrl()}/`;
  return {
    event: sampleEvent,
    reg: { name: 'Aditi Rao', ticketCode: '3f6c2a91-8d4e-4b7a-a5c0-1e2f9b7d6c54', quantity: 2, paymentStatus: 'paid' },
    comment: { postTitle: post?.title ?? 'A sample post', postUrl, authorName: 'Rahul Menon', authorEmail: 'rahul@example.com',
      content: 'Caught them live in Pune last year and the new material sounds even heavier. Any word on a Bengaluru date?' },
    staffName: user?.firstName || user?.username || 'there',
  };
}

const PREVIEWS: PreviewDef[] = [
  { id: 'ticket', group: 'Readers', name: 'Ticket confirmed', to: 'The person who registered',
    when: 'A free registration is confirmed, a payment goes through, or you approve a registration.',
    build: async () => { const s = await samples(); return emails.registrationEmail('confirmed', s.reg, s.event); } },
  { id: 'ticket-live', group: 'Readers', name: 'Ticket confirmed (live ticket)', to: 'The person who registered',
    when: 'As above, for an event with live tickets turned on: no QR code in the email, a button to the live ticket instead.',
    build: async () => { const s = await samples(); return emails.registrationEmail('confirmed', s.reg, { ...s.event, liveTicketQr: true }); } },
  { id: 'registration-confirm-email', group: 'Readers', name: 'Confirm your email', to: 'The person who registered',
    when: 'Someone books a free ticket for an event that asks people to confirm their email first.',
    build: async () => {
      const s = await samples();
      return emails.registrationEmail('confirm-email', s.reg, s.event, { confirmUrl: `${siteUrl()}/events/${s.event.slug}?confirm=sample` });
    } },
  { id: 'registration-pending', group: 'Readers', name: 'Registration received', to: 'The person who registered',
    when: 'Someone registers for an event that needs approval.',
    build: async () => { const s = await samples(); return emails.registrationEmail('pending', s.reg, s.event); } },
  { id: 'waitlist', group: 'Readers', name: 'On the waitlist', to: 'The person who registered',
    when: 'Someone registers for an event that’s already full.',
    build: async () => { const s = await samples(); return emails.registrationEmail('waitlisted', s.reg, s.event); } },
  { id: 'registration-cancelled', group: 'Readers', name: 'Registration cancelled', to: 'The person who registered',
    when: 'They cancel from their booking page, or you cancel the registration.',
    build: async () => { const s = await samples(); return emails.registrationEmail('cancelled', s.reg, s.event, { cancelledBy: 'you' }); } },
  { id: 'contact', group: 'Your team', name: 'Contact form message', to: 'Administration email (Settings → General)',
    when: 'Someone uses the contact form. Reply goes to them.',
    build: async () => emails.contactMessage({ name: 'Priya Sharma', email: 'priya@example.com', subject: 'Interview request for our new EP',
      message: 'Hi team,\n\nWe’re a five-piece from Shillong releasing our debut EP next month. Would you be open to an interview or a premiere?\n\nThanks,\nPriya' }) },
  { id: 'comment-pending', group: 'Your team', name: 'Comment to approve', to: 'Administration email',
    when: 'A comment is held for approval (Settings → Discussion).',
    build: async () => emails.commentAwaitingApproval((await samples()).comment) },
  { id: 'comment-new', group: 'Your team', name: 'New comment on your post', to: 'The post’s author',
    when: 'A comment is published without needing approval.',
    build: async () => emails.commentOnYourPost((await samples()).comment) },
  { id: 'password-reset', group: 'Your team', name: 'Password reset', to: 'The staff member',
    when: 'Someone clicks “Forgot password” on the admin sign-in page.',
    build: async () => emails.passwordReset({ name: (await samples()).staffName, resetUrl: `${siteUrl()}/admin/reset-password?token=sample-preview-only` }) },
  { id: 'backup-failed', group: 'Your team', name: 'Backup failed', to: 'The notify address on the Backups page',
    when: 'A backup finishes or fails (this shows the failure version).',
    build: async () => emails.backupResult({ label: 'Nightly backup', success: false, error: 'S3 upload timed out after 600 s' }) },
  { id: 'test', group: 'Your team', name: 'Test email', to: 'You',
    when: '“Send test email” in Settings → Email.',
    build: async () => emails.testEmail({ to: 'you@example.com', when: await formatNow() }) },
  { id: 'notify-failed-login', group: 'Notifications', name: 'Failed sign-ins', to: 'Admins, and the account owner',
    when: 'Wrong passwords for one account reach someone’s threshold within 15 minutes.',
    build: async () => emails.notificationEmail({ type: 'failed_login', title: '5 failed sign-ins on editor@headtilts.com',
      body: 'Someone has entered the wrong password for this account several times in the last 15 minutes. If it wasn’t you, change the password and turn on two-step sign-in.',
      link: '/admin/logs', details: [{ label: 'Attempts', value: '5 in 15 minutes' }, { label: 'From IP address', value: '203.0.113.42' }] }) },
  { id: 'notify-new-sign-in', group: 'Notifications', name: 'New sign-in', to: 'The account owner',
    when: 'An account signs in from a network it hasn’t used in 90 days.',
    build: async () => emails.notificationEmail({ type: 'security_alert', title: 'New sign-in to your account',
      body: 'Your account was just signed in to from a network it hasn’t used in the last 90 days. If this was you, there’s nothing to do. If not, change your password now and turn on two-step sign-in.',
      link: '/admin/profile', details: [{ label: 'When', value: await formatNow() }, { label: 'Device', value: 'Chrome on Windows' }, { label: 'IP address', value: '203.0.113.42' }] }) },
  { id: 'notify-scheduled', group: 'Notifications', name: 'Post scheduled', to: 'Editors and the author',
    when: 'A post is scheduled, or its time changes.',
    build: async () => emails.notificationEmail({ type: 'post_scheduled', title: 'Scheduled: "Album review: the year’s heaviest record"',
      body: 'It will be published automatically on Friday, 30 October 2026 at 09:00.', link: '/admin/posts' }) },
  { id: 'notify-storage', group: 'Notifications', name: 'Storage filling up', to: 'Admins',
    when: 'The disk passes someone’s threshold (checked hourly, at most once a day).',
    build: async () => emails.notificationEmail({ type: 'media_storage_high', title: 'Storage is 90% full',
      body: 'The disk that holds uploads and backups is filling up. When it’s full, uploads and backups fail.',
      link: '/admin/media', details: [{ label: 'Used', value: '101 GB of 117 GB' }] }) },
];

/** Inline images (cid:…) become data URLs, so the preview shows them in the browser. */
function inlineImages(html: string, built: emails.BuiltEmail): string {
  let out = html;
  for (const a of built.attachments ?? []) {
    if (!a.cid || !Buffer.isBuffer(a.content)) continue;
    out = out.split(`cid:${a.cid}`).join(`data:image/png;base64,${a.content.toString('base64')}`);
  }
  return out;
}

export async function listPreviews() {
  return Promise.all(PREVIEWS.map(async (p) => {
    const built = await p.build();
    const { html } = await renderEmail(built.content);
    return { id: p.id, group: p.group, name: p.name, when: p.when, to: p.to, subject: built.subject, html: inlineImages(html, built) };
  }));
}

/** Send one sample to the signed-in user, marked as a preview. */
export async function sendPreview(id: string, to: string) {
  const def = PREVIEWS.find((p) => p.id === id);
  if (!def) throw new NotFoundError('No such email');
  const built = await def.build();
  return sendBuilt(to, { ...built, subject: `[Preview] ${built.subject}`, replyTo: undefined });
}
