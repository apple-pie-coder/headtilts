import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';
import { prisma } from '../config/database';
import { EmailContent, renderEmail } from './emailLayout';
import type { BuiltEmail } from './emailContent';

export interface MailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Where replies go, e.g. the visitor who wrote in, instead of our own address. */
  replyTo?: string;
  /** Inline images (referenced as cid:…) and files. */
  attachments?: Mail.Attachment[];
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

/** A bare address gets the site's name, so inboxes show "Headtilts" rather than the address. */
function withName(from: string, name?: string): string {
  if (!from || from.includes('<') || !name) return from;
  return `"${name.replace(/["\\]/g, '')}" <${from}>`;
}

async function getSmtpConfig(): Promise<SmtpConfig | null> {
  // DB settings take priority; fall back to environment variables
  try {
    const keys = ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from', 'smtp_enabled', 'site_title'];
    const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
    const db: Record<string, string> = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    // Honour the global enable/disable toggle (defaults to enabled when not set)
    if (db.smtp_enabled === 'false') return null;

    const host = db.smtp_host || process.env.SMTP_HOST || '';
    if (!host) return null;

    return {
      host,
      port: parseInt(db.smtp_port || process.env.SMTP_PORT || '587', 10) || 587,
      secure: (db.smtp_secure ?? process.env.SMTP_SECURE) === 'true',
      user: db.smtp_user || process.env.SMTP_USER || '',
      pass: db.smtp_pass || process.env.SMTP_PASS || '',
      from: withName(db.smtp_from || process.env.SMTP_FROM || db.smtp_user || process.env.SMTP_USER || '', db.site_title),
    };
  } catch {
    // DB not ready — fall back to env
    const host = process.env.SMTP_HOST || '';
    if (!host) return null;
    return {
      host,
      port: parseInt(process.env.SMTP_PORT || '587', 10) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
    };
  }
}

export async function isMailConfigured(): Promise<boolean> {
  return (await getSmtpConfig()) !== null;
}

/**
 * Connect to and authenticate with the SMTP server without sending anything.
 * Returns null when SMTP isn't configured.
 */
export async function verifySmtp(timeoutMs = 5000): Promise<{ ok: boolean; host: string; error?: string } | null> {
  const config = await getSmtpConfig();
  if (!config) return null;
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs,
  });
  try {
    await transport.verify();
    return { ok: true, host: `${config.host}:${config.port}` };
  } catch (err) {
    return { ok: false, host: `${config.host}:${config.port}`, error: err instanceof Error ? err.message : String(err) };
  } finally {
    transport.close();
  }
}

/**
 * Send an email via the configured SMTP server (DB settings take priority over
 * environment variables). When SMTP is not configured the message is logged
 * instead so dev flows keep working. Returns true when handed to the server.
 */
export async function sendMail(input: MailInput): Promise<boolean> {
  const config = await getSmtpConfig();
  if (!config) {
    console.log(`[mail] SMTP not configured — would have sent to ${input.to}: "${input.subject}"`);
    console.log(`[mail] ${input.text}`);
    return false;
  }

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
  });

  await transport.sendMail({
    from: config.from,
    to: input.to,
    replyTo: input.replyTo,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: input.attachments,
    // Marks these as automatic, so out-of-office replies don't bounce back.
    headers: { 'Auto-Submitted': 'auto-generated' },
  });
  return true;
}

/** Send an email built with the shared layout (emailLayout.ts). */
export async function sendTemplate(input: Omit<MailInput, 'text' | 'html'> & { content: EmailContent }): Promise<boolean> {
  const { html, text } = await renderEmail(input.content);
  const { content: _content, ...rest } = input;
  return sendMail({ ...rest, html, text });
}

/** Send one of the emails defined in emailContent.ts. */
export function sendBuilt(to: string, email: BuiltEmail): Promise<boolean> {
  return sendTemplate({ to, subject: email.subject, replyTo: email.replyTo, attachments: email.attachments, content: email.content });
}
