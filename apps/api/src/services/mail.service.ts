import nodemailer from 'nodemailer';

export interface MailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

/**
 * Send an email via the configured SMTP server. When SMTP is not configured
 * (no SMTP_HOST), the message is logged instead so dev flows keep working.
 * Returns true when the message was handed to the SMTP server.
 */
export async function sendMail(input: MailInput): Promise<boolean> {
  if (!isMailConfigured()) {
    console.log(`[mail] SMTP not configured — would have sent to ${input.to}: "${input.subject}"`);
    console.log(`[mail] ${input.text}`);
    return false;
  }

  const transport = createTransport();
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  return true;
}
