import { prisma } from '../config/database';
import { NotFoundError } from '../utils/errors';
import { sendMail } from './mail.service';
import * as notifications from './notifications.service';

export async function listSubmissions(page: number, limit: number, unreadOnly = false) {
  const where = unreadOnly ? { isRead: false } : {};
  const [items, total, unread] = await Promise.all([
    prisma.contactSubmission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.contactSubmission.count({ where }),
    prisma.contactSubmission.count({ where: { isRead: false } }),
  ]);
  return { items, total, unread };
}

export async function markRead(id: number, isRead: boolean) {
  const existing = await prisma.contactSubmission.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Submission not found');
  return prisma.contactSubmission.update({ where: { id }, data: { isRead } });
}

export async function deleteSubmission(id: number) {
  const existing = await prisma.contactSubmission.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Submission not found');
  await prisma.contactSubmission.delete({ where: { id } });
}

export async function createSubmission(input: {
  name: string;
  email: string;
  subject?: string;
  message: string;
}) {
  const submission = await prisma.contactSubmission.create({
    data: {
      name: input.name,
      email: input.email,
      subject: input.subject || null,
      message: input.message,
    },
  });

  // Notify the site admin; never fail the submission if email delivery fails.
  const adminEmail = await prisma.setting.findUnique({ where: { key: 'admin_email' } });
  if (adminEmail?.value) {
    sendMail({
      to: adminEmail.value,
      subject: `New contact submission: ${input.subject || '(no subject)'}`,
      text: `From: ${input.name} <${input.email}>\n\n${input.message}`,
    }).catch((error) => console.error('Contact notification email failed:', error));
  }

  // Real-time in-app notification to settings admins (fire-and-forget).
  notifications
    .notifyNewContact({ id: submission.id, name: input.name, subject: input.subject })
    .catch((error) => console.error('Contact notification failed:', error));

  return submission;
}
