import qrcode from 'qrcode';
import type Mail from 'nodemailer/lib/mailer';
import { adminUrl, EmailBlock, EmailContent, siteUrl } from './emailLayout';

/**
 * The words and structure of every email the CMS sends, in one place. The
 * services call these when something happens; Settings → Email → Previews
 * calls the same functions with sample data, so a preview is always exactly
 * what people receive.
 */

export interface BuiltEmail {
  subject: string;
  content: EmailContent;
  replyTo?: string;
  attachments?: Mail.Attachment[];
}

/** "Name <address>", with characters that would break the header removed. */
export function mailbox(name: string, email: string): string {
  return `"${name.replace(/["\\<>]/g, '')}" <${email}>`;
}

// ── Contact form ────────────────────────────────────────────────────────────

export function contactMessage(m: { name: string; email: string; subject?: string | null; message: string }): BuiltEmail {
  const subject = m.subject?.trim();
  return {
    // Hitting Reply in the inbox answers the visitor, not ourselves.
    replyTo: mailbox(m.name, m.email),
    subject: `Message from ${m.name}${subject ? `: ${subject}` : ''}`,
    content: {
      audience: 'staff',
      tag: 'Contact form',
      preheader: m.message.slice(0, 120),
      heading: subject || `A message from ${m.name}`,
      blocks: [
        { type: 'details', rows: [
          { label: 'From', value: m.name },
          { label: 'Email', value: m.email, href: `mailto:${m.email}` },
        ] },
        { type: 'quote', text: m.message },
      ],
      button: { label: `Reply to ${m.name.split(' ')[0]}`, url: `mailto:${m.email}?subject=${encodeURIComponent(`Re: ${subject || 'Your message to us'}`)}` },
      secondary: [{ label: 'Open in the admin', url: adminUrl('/admin/contact') }],
      footnote: 'Replying to this email goes straight to them. It’s also saved under Contact in the admin.',
    },
  };
}

// ── Comments ────────────────────────────────────────────────────────────────

interface CommentFacts { postTitle: string; postUrl: string; authorName: string; authorEmail?: string | null; content: string }

export function commentAwaitingApproval(c: CommentFacts): BuiltEmail {
  return {
    replyTo: c.authorEmail ? mailbox(c.authorName, c.authorEmail) : undefined,
    subject: `Comment to approve on "${c.postTitle}"`,
    content: {
      audience: 'staff',
      tag: 'Needs approval',
      preheader: `${c.authorName}: ${c.content.slice(0, 100)}`,
      heading: 'A comment is waiting for approval',
      blocks: [
        { type: 'details', rows: [
          { label: 'On', value: c.postTitle, href: c.postUrl },
          { label: 'From', value: c.authorEmail ? `${c.authorName} (${c.authorEmail})` : c.authorName },
        ] },
        { type: 'quote', text: c.content, cite: c.authorName },
      ],
      button: { label: 'Review comments', url: adminUrl('/admin/comments?status=pending') },
      secondary: [{ label: 'Open the post', url: c.postUrl }],
      footnote: 'It stays hidden until someone approves it. Replying to this email goes to the commenter.',
    },
  };
}

export function commentOnYourPost(c: CommentFacts): BuiltEmail {
  return {
    replyTo: c.authorEmail ? mailbox(c.authorName, c.authorEmail) : undefined,
    subject: `New comment on "${c.postTitle}"`,
    content: {
      audience: 'staff',
      tag: 'New comment',
      preheader: `${c.authorName}: ${c.content.slice(0, 100)}`,
      heading: `${c.authorName} commented on your post`,
      blocks: [{ type: 'quote', text: c.content, cite: `On “${c.postTitle}”` }],
      button: { label: 'See it on the post', url: `${c.postUrl}#comments` },
      secondary: [{ label: 'Moderate comments', url: adminUrl('/admin/comments') }],
      footnote: 'Replying to this email goes to the commenter.',
    },
  };
}

// ── Event registrations ─────────────────────────────────────────────────────

export type RegistrationEmailKind = 'confirm-email' | 'confirmed' | 'pending' | 'waitlisted' | 'cancelled';

export interface EmailEvent {
  title: string; slug: string; startAt: Date; endAt: Date; timezone: string; type: string;
  venueName?: string | null; venueAddress?: string | null; venueCity?: string | null; venueCountry?: string | null;
  onlineUrl?: string | null;
  /** Tickets are a QR that changes every few seconds on the booking page, not a code in the email. */
  liveTicketQr?: boolean;
}

export interface EmailRegistration { name: string; ticketCode: string; quantity: number; paymentStatus?: string }

/** "Monday, 16 November 2026 · 2:00 pm – 11:00 pm IST", in the event's own time zone. */
export function eventWhen(start: Date, end: Date, timezone: string): string {
  const tz = (() => { try { new Intl.DateTimeFormat('en-IN', { timeZone: timezone }); return timezone; } catch { return 'UTC'; } })();
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IN', { ...o, timeZone: tz });
  const day = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = fmt({ hour: 'numeric', minute: '2-digit', hour12: true });
  const zone = fmt({ timeZoneName: 'short' }).formatToParts(start).find((part) => part.type === 'timeZoneName')?.value ?? '';
  return day.format(start) === day.format(end)
    ? `${day.format(start)}\n${time.format(start)} – ${time.format(end)} ${zone}`
    : `${day.format(start)}, ${time.format(start)} –\n${day.format(end)}, ${time.format(end)} ${zone}`;
}

function googleCalendarLink(event: EmailEvent, where: string, pageUrl: string): string {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE', text: event.title, dates: `${stamp(event.startAt)}/${stamp(event.endAt)}`,
    details: pageUrl, location: where,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/**
 * To the person who registered: their ticket (QR code for the door),
 * "waiting for approval", "on the waitlist" or "cancelled".
 */
export async function registrationEmail(
  kind: RegistrationEmailKind,
  reg: EmailRegistration,
  event: EmailEvent,
  opts: { cancelledBy?: 'you' | 'organisers'; replyTo?: string; confirmUrl?: string } = {},
): Promise<BuiltEmail> {
  const base = siteUrl();
  const pageUrl = `${base}/events/${event.slug}`;
  const manageUrl = `${pageUrl}?ticket=${encodeURIComponent(reg.ticketCode)}`;
  const online = event.type === 'online';
  const address = [event.venueName, event.venueAddress, event.venueCity, event.venueCountry].filter(Boolean).join(', ');
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  const where = online ? 'Online' : ([event.venueName, event.venueCity].filter(Boolean).join(', ') || 'To be announced');
  const when = eventWhen(event.startAt, event.endAt, event.timezone);
  const first = reg.name.trim().split(/\s+/)[0] || reg.name;

  const facts: EmailBlock = { type: 'details', rows: [
    { label: 'When', value: when },
    { label: 'Where', value: where, ...(address && !online ? { href: mapUrl } : {}) },
    ...(online && event.onlineUrl && kind === 'confirmed' ? [{ label: 'Join online', value: event.onlineUrl, href: event.onlineUrl }] : []),
    { label: reg.quantity === 1 ? 'Ticket' : 'Tickets', value: `${reg.quantity} × ${reg.name}` },
  ] };

  // Fake sellers on social media are the most common ticket scam; say where real tickets come from.
  const officialSales: EmailBlock = {
    type: 'notice', tone: 'info',
    text: `Tickets are only sold at ${new URL(base).host}. Tickets bought anywhere else may be refused at the door.`,
  };

  if (kind === 'confirm-email') {
    return {
      replyTo: opts.replyTo,
      subject: `Confirm your email to get your ticket: ${event.title}`,
      content: {
        audience: 'reader', tag: 'Confirm',
        preheader: 'One click and your ticket is on its way.',
        heading: 'Confirm your email address',
        intro: `Hi ${first}, thanks for signing up for ${event.title}. Confirm this is your email address and we'll send your ticket straight away.`,
        blocks: [facts],
        button: { label: 'Confirm and get my ticket', url: opts.confirmUrl ?? pageUrl },
        footnote: 'The link works for 24 hours. Your place isn’t held until you confirm. If you didn’t sign up, ignore this email.',
      },
    };
  }

  if (kind === 'confirmed' && event.liveTicketQr) {
    return {
      replyTo: opts.replyTo,
      subject: `Your ticket: ${event.title}`,
      content: {
        audience: 'reader', tag: 'Ticket',
        preheader: `${when.replace('\n', ', ')} · ${where}`,
        heading: `You're in: ${event.title}`,
        intro: `Hi ${first}, your place is confirmed. This event uses live tickets: at the door, open your ticket from the button below and show the QR code on your screen.`,
        blocks: [
          facts,
          { type: 'notice', tone: 'warning', text: 'The QR code changes every few seconds, so screenshots and printouts won’t work. Open the ticket page before you join the queue.' },
          { type: 'code', label: 'Ticket code', code: reg.ticketCode },
          officialSales,
          { type: 'links', links: [
            { label: 'Add to Google Calendar', url: googleCalendarLink(event, online ? 'Online' : address || where, pageUrl) },
            { label: 'Calendar file (.ics)', url: `${base}/api/public/events/${event.slug}/calendar.ics` },
            ...(address && !online ? [{ label: 'Directions', url: mapUrl }] : []),
          ] },
        ],
        button: { label: 'Open my live ticket', url: manageUrl },
        secondary: [{ label: 'View the event', url: pageUrl }],
      },
    };
  }

  if (kind === 'confirmed') {
    const qr = await qrcode.toBuffer(reg.ticketCode, { width: 360, margin: 1 });
    return {
      replyTo: opts.replyTo,
      subject: `Your ticket: ${event.title}`,
      attachments: [{ filename: 'ticket-qr.png', content: qr, cid: 'ticket-qr' }],
      content: {
        audience: 'reader', tag: 'Ticket',
        preheader: `${when.replace('\n', ', ')} · ${where}`,
        heading: `You're in: ${event.title}`,
        intro: `Hi ${first}, your place is confirmed. Show the QR code below at the door.`,
        blocks: [
          facts,
          { type: 'image', cid: 'ticket-qr', alt: `QR code for ticket ${reg.ticketCode}`, width: 180, caption: 'Scan at the entrance' },
          { type: 'code', label: 'Ticket code', code: reg.ticketCode },
          officialSales,
          { type: 'links', links: [
            { label: 'Add to Google Calendar', url: googleCalendarLink(event, online ? 'Online' : address || where, pageUrl) },
            { label: 'Calendar file (.ics)', url: `${base}/api/public/events/${event.slug}/calendar.ics` },
            ...(address && !online ? [{ label: 'Directions', url: mapUrl }] : []),
          ] },
        ],
        button: { label: 'View the event', url: pageUrl },
        secondary: [{ label: 'Can’t make it? Manage or cancel your booking', url: manageUrl }],
      },
    };
  }
  if (kind === 'pending') {
    return {
      replyTo: opts.replyTo,
      subject: `Registration received: ${event.title}`,
      content: {
        audience: 'reader', tag: 'Registration',
        heading: 'We’ve got your registration',
        intro: `Hi ${first}, thanks for signing up for ${event.title}. The organisers check registrations for this event, and we'll email your ticket as soon as yours is approved.`,
        blocks: [facts],
        button: { label: 'View the event', url: pageUrl },
        secondary: [{ label: 'Changed your mind? Cancel your registration', url: manageUrl }],
      },
    };
  }
  if (kind === 'waitlisted') {
    return {
      replyTo: opts.replyTo,
      subject: `You're on the waitlist: ${event.title}`,
      content: {
        audience: 'reader', tag: 'Waitlist',
        heading: 'You’re on the waitlist',
        intro: `Hi ${first}, ${event.title} is full right now, so we've added you to the waitlist. If a place opens up, the organisers will be in touch.`,
        blocks: [facts],
        button: { label: 'View the event', url: pageUrl },
        secondary: [{ label: 'Leave the waitlist', url: manageUrl }],
      },
    };
  }
  return {
    replyTo: opts.replyTo,
    subject: `Registration cancelled: ${event.title}`,
    content: {
      audience: 'reader', tag: 'Cancelled',
      heading: 'Your registration is cancelled',
      intro: opts.cancelledBy === 'you'
        ? `Hi ${first}, as you asked, we've cancelled your registration for ${event.title}. Your place has been freed up for someone else.`
        : `Hi ${first}, the organisers have cancelled your registration for ${event.title}.`,
      blocks: [
        { type: 'details', rows: [{ label: 'Event', value: event.title, href: pageUrl }, { label: 'Was on', value: when }, { label: 'Ticket code', value: reg.ticketCode }] },
        ...(reg.paymentStatus === 'paid' ? [{ type: 'notice' as const, tone: 'info' as const, text: 'You paid for this ticket. Reply to this email about a refund.' }] : []),
      ],
      footnote: 'If this is a mistake, reply to this email and we’ll sort it out.',
    },
  };
}

// ── Account and system ──────────────────────────────────────────────────────

export function passwordReset(p: { name: string; resetUrl: string }): BuiltEmail {
  return {
    subject: 'Reset your password',
    content: {
      audience: 'staff',
      tag: 'Account',
      preheader: 'Choose a new password. The link works for 1 hour.',
      heading: 'Reset your password',
      intro: `Hi ${p.name},\n\nSomeone asked to reset the password for your admin account. If it was you, choose a new one below.`,
      button: { label: 'Choose a new password', url: p.resetUrl },
      blocks: [{ type: 'links', links: [{ label: 'Or open this link', url: p.resetUrl }] }],
      footnote: 'The link works once and expires in 1 hour. If you didn’t ask for this, ignore this email: your password stays the same.',
    },
  };
}

export function backupResult(b: { label: string; success: boolean; error?: string }): BuiltEmail {
  return {
    subject: b.success ? `Backup finished: ${b.label}` : `Backup failed: ${b.label}`,
    content: {
      audience: 'staff',
      tag: 'Backups',
      heading: b.success ? 'Backup finished' : 'A backup failed',
      blocks: b.success
        ? [{ type: 'notice', tone: 'success', text: `“${b.label}” completed and is ready to restore from.` }]
        : [
          { type: 'notice', tone: 'danger', text: `“${b.label}” didn’t complete, so there’s no new copy of the site.` },
          { type: 'details', rows: [{ label: 'Error', value: b.error || 'Unknown error' }] },
        ],
      button: { label: 'Open backups', url: adminUrl('/admin/backups') },
    },
  };
}

export function testEmail(t: { to: string; when: string }): BuiltEmail {
  return {
    subject: 'Test email: sending works',
    content: {
      audience: 'staff',
      tag: 'Test',
      heading: 'Email is working',
      intro: 'This is the test from Settings → Email. If you’re reading it, the site can send email: ticket confirmations, contact form messages, password resets and notifications will all arrive like this one.',
      blocks: [{ type: 'details', rows: [{ label: 'Sent', value: t.when }, { label: 'To', value: t.to }] }],
      button: { label: 'Back to email settings', url: adminUrl('/admin/settings?tab=email') },
    },
  };
}

// ── Admin notifications (Settings → Notifications, "Email" channel) ─────────

export const NOTIFICATION_EMAIL_STYLE: Record<string, { tag: string; button: string }> = {
  comment: { tag: 'Comment', button: 'Open comments' },
  contact: { tag: 'Contact form', button: 'Open messages' },
  post_published: { tag: 'Published', button: 'Open the post' },
  post_scheduled: { tag: 'Scheduled', button: 'Open the post' },
  user_registered: { tag: 'New user', button: 'Open users' },
  failed_login: { tag: 'Security', button: 'Open activity logs' },
  security_alert: { tag: 'Security', button: 'Review your account' },
  api_key_created: { tag: 'API key', button: 'Open API keys' },
  user_deactivated: { tag: 'Users', button: 'Open users' },
  media_storage_high: { tag: 'Storage', button: 'Open media' },
};

export function notificationEmail(n: {
  type: string; title: string; body?: string | null; link?: string | null; details?: { label: string; value: string }[];
}): BuiltEmail {
  const style = NOTIFICATION_EMAIL_STYLE[n.type] ?? { tag: 'Notification', button: 'Open the admin' };
  return {
    subject: n.title,
    content: {
      audience: 'staff',
      tag: style.tag,
      preheader: n.body ?? undefined,
      heading: n.title,
      intro: n.body ?? undefined,
      blocks: n.details?.length ? [{ type: 'details', rows: n.details }] : [],
      button: n.link ? { label: style.button, url: adminUrl(n.link) } : undefined,
    },
  };
}
