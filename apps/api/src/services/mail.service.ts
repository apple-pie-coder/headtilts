import nodemailer from 'nodemailer';
import { prisma } from '../config/database';

export interface MailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

async function getSmtpConfig(): Promise<SmtpConfig | null> {
  // DB settings take priority; fall back to environment variables
  try {
    const keys = ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from'];
    const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
    const db: Record<string, string> = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    const host = db.smtp_host || process.env.SMTP_HOST || '';
    if (!host) return null;

    return {
      host,
      port: parseInt(db.smtp_port || process.env.SMTP_PORT || '587', 10) || 587,
      secure: (db.smtp_secure ?? process.env.SMTP_SECURE) === 'true',
      user: db.smtp_user || process.env.SMTP_USER || '',
      pass: db.smtp_pass || process.env.SMTP_PASS || '',
      from: db.smtp_from || process.env.SMTP_FROM || db.smtp_user || process.env.SMTP_USER || '',
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
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  return true;
}
