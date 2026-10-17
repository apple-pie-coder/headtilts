import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { uploadDir } from '../middleware/upload';
import { NotFoundError, ValidationError } from '../utils/errors';
import { gh, github } from '../utils/github';
import { forgetSummary } from './issues.service';

/**
 * Admin feedback: saved locally, then mirrored to a GitHub issue when
 * GITHUB_FEEDBACK_TOKEN / GITHUB_FEEDBACK_REPO are configured. The token stays
 * on the server. Issues carry usernames and page paths only — no emails or IPs —
 * because the repository may be public.
 */

export const FEEDBACK_TYPES = ['bug', 'idea', 'question'] as const;
type FeedbackType = (typeof FEEDBACK_TYPES)[number];

const TYPE_LABEL: Record<FeedbackType, { name: string; github: string }> = {
  bug: { name: 'Bug', github: 'bug' },
  idea: { name: 'Idea', github: 'enhancement' },
  question: { name: 'Question', github: 'question' },
};
const BASE_LABEL = 'admin-feedback';
// Repo visibility, cached for an hour — shown in the form so people know where reports go.
let repoInfo: { at: number; value: { repo: string; private: boolean } | null } | null = null;

export async function getStatus() {
  const cfg = github();
  if (!cfg) return { configured: false, repo: process.env.GITHUB_FEEDBACK_REPO || null, private: null as boolean | null };
  if (!repoInfo || Date.now() - repoInfo.at > 3_600_000) {
    try {
      const r = await gh<{ full_name: string; private: boolean }>('GET', `/repos/${cfg.repo}`);
      repoInfo = { at: Date.now(), value: { repo: r.full_name, private: r.private } };
    } catch {
      repoInfo = { at: Date.now(), value: null };
    }
  }
  return { configured: true, repo: cfg.repo, private: repoInfo.value?.private ?? null };
}

/** data:image/png;base64,… → saved file URL. Only real PNG/JPEG/WebP, up to 3 MB. */
function saveScreenshot(dataUrl: unknown): string | null {
  if (dataUrl === undefined || dataUrl === null || dataUrl === '') return null;
  const m = typeof dataUrl === 'string' ? dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/) : null;
  if (!m) throw new ValidationError('Screenshot must be a PNG, JPEG or WebP image');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3 * 1024 * 1024) throw new ValidationError('Screenshot is larger than 3 MB');
  const magic = buf.subarray(0, 12);
  const isPng = magic.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = magic[0] === 0xff && magic[1] === 0xd8;
  const isWebp = magic.subarray(0, 4).toString('ascii') === 'RIFF' && magic.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!(isPng || isJpeg || isWebp)) throw new ValidationError('Screenshot is not a valid image');
  const dir = path.join(uploadDir, 'feedback');
  fs.mkdirSync(dir, { recursive: true });
  const name = `${randomUUID()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  fs.writeFileSync(path.join(dir, name), buf);
  return `/uploads/feedback/${name}`;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Keep only the context fields we know, with sane lengths. */
function cleanContext(raw: unknown): Record<string, unknown> {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const errors = Array.isArray(c.errors) ? c.errors.slice(-10).map((e) => str(e, 500)).filter(Boolean) : [];
  return {
    browser: str(c.browser, 300),
    viewport: str(c.viewport, 40),
    theme: str(c.theme, 20),
    appVersion: str(c.appVersion, 40),
    errors,
  };
}

function issueBody(f: { id: number; type: string; description: string; pagePath: string | null; screenshot: string | null; createdAt: Date; context: Prisma.JsonValue },
  reporter: string): string {
  const ctx = (f.context ?? {}) as { browser?: string; viewport?: string; theme?: string; appVersion?: string; errors?: string[] };
  const rows: [string, string | undefined][] = [
    ['Page', f.pagePath ? `\`${f.pagePath}\`` : undefined],
    ['Reporter', reporter],
    ['Browser', ctx.browser],
    ['Window', [ctx.viewport, ctx.theme && `${ctx.theme} theme`].filter(Boolean).join(' · ') || undefined],
    ['App version', ctx.appVersion],
    ['Reported', f.createdAt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'],
  ];
  const table = rows.filter(([, v]) => v).map(([k, v]) => `| ${k} | ${String(v).replace(/\|/g, '\\|')} |`).join('\n');
  const errs = ctx.errors?.length
    ? `\n\n<details><summary>Recent errors in the browser (${ctx.errors.length})</summary>\n\n\`\`\`\n${ctx.errors.join('\n').replace(/```/g, "'''")}\n\`\`\`\n</details>`
    : '';
  // The site isn't reachable from GitHub (and the repo may be public), so the
  // image stays on our server and shows in the admin's issue view.
  const shot = f.screenshot ? '\n\n**Screenshot:** attached in the Headtilts admin — open this issue under _System → Issues_ to see it.' : '';
  return `${f.description}${shot}\n\n---\n_Raised from the Headtilts admin panel · ${TYPE_LABEL[f.type as FeedbackType]?.name ?? f.type}_\n\n| | |\n|---|---|\n${table}${errs}\n\n<!-- headtilts-feedback-id: ${f.id} -->`;
}

/** Push one feedback row to GitHub, recording the outcome on the row. */
export async function syncToGithub(id: number) {
  const f = await prisma.feedback.findUnique({ where: { id }, include: { user: { select: { username: true, userRoles: { select: { role: { select: { name: true } } } } } } } });
  if (!f) throw new NotFoundError('Feedback not found');
  if (!github()) {
    return prisma.feedback.update({ where: { id }, data: { syncStatus: 'disabled', syncError: null } });
  }
  if (f.issueNumber) return f;
  const reporter = f.user ? `${f.user.username}${f.user.userRoles.length ? ` (${f.user.userRoles.map((r) => r.role.name).join(', ')})` : ''}` : 'unknown';
  try {
    const issue = await gh<{ number: number; html_url: string; state: string }>('POST', `/repos/${github()!.repo}/issues`, {
      title: f.title,
      body: issueBody(f, reporter),
      labels: [BASE_LABEL, TYPE_LABEL[f.type as FeedbackType]?.github ?? f.type],
    });
    forgetSummary(); // the dashboard and badges should see the new issue straight away
    return prisma.feedback.update({
      where: { id },
      data: { syncStatus: 'synced', syncError: null, issueNumber: issue.number, issueUrl: issue.html_url, issueState: issue.state },
    });
  } catch (err) {
    return prisma.feedback.update({ where: { id }, data: { syncStatus: 'failed', syncError: String(err instanceof Error ? err.message : err).slice(0, 500) } });
  }
}

export async function createFeedback(userId: string, input: Record<string, unknown>) {
  const type = (FEEDBACK_TYPES as readonly string[]).includes(String(input.type)) ? (input.type as FeedbackType) : null;
  if (!type) throw new ValidationError('Choose bug, idea or question');
  const title = str(input.title, 200);
  const description = str(input.description, 10_000);
  if (title.length < 4) throw new ValidationError('Give it a short title');
  if (description.length < 4) throw new ValidationError('Describe what happened or what you need');
  const pagePath = str(input.pagePath, 500).replace(/^https?:\/\/[^/]+/, '') || null;

  const created = await prisma.feedback.create({
    data: {
      type, title, description, pagePath, userId,
      context: cleanContext(input.context) as Prisma.InputJsonValue,
      screenshot: saveScreenshot(input.screenshot),
      syncStatus: github() ? 'pending' : 'disabled',
    },
  });
  return github() ? syncToGithub(created.id) : created;
}

// Issue states refreshed from GitHub at most once a minute.
let lastRefresh = 0;
async function refreshStates() {
  const cfg = github();
  if (!cfg || Date.now() - lastRefresh < 60_000) return;
  lastRefresh = Date.now();
  try {
    const issues = await gh<{ number: number; state: string }[]>('GET', `/repos/${cfg.repo}/issues?labels=${BASE_LABEL}&state=all&per_page=100&sort=updated`);
    await Promise.all(issues.map((i) =>
      prisma.feedback.updateMany({ where: { issueNumber: i.number, NOT: { issueState: i.state } }, data: { issueState: i.state } })));
  } catch {
    /* GitHub unreachable: keep the last known states */
  }
}

export async function listFeedback(page: number, limit: number, filters: { type?: string; state?: string }) {
  await refreshStates();
  const where: Prisma.FeedbackWhereInput = {
    ...(filters.type && (FEEDBACK_TYPES as readonly string[]).includes(filters.type) ? { type: filters.type } : {}),
    ...(filters.state === 'open' ? { OR: [{ issueState: 'open' }, { issueState: null }] } : filters.state === 'closed' ? { issueState: 'closed' } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.feedback.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
      include: { user: { select: { id: true, username: true, firstName: true, lastName: true, avatar: true } } },
    }),
    prisma.feedback.count({ where }),
  ]);
  return { items, total };
}

export async function deleteFeedback(id: number) {
  const f = await prisma.feedback.findUnique({ where: { id } });
  if (!f) throw new NotFoundError('Feedback not found');
  await prisma.feedback.delete({ where: { id } });
  // Screenshots only belong to their report; remove the file with it.
  if (f.screenshot?.startsWith('/uploads/feedback/')) {
    fs.promises.unlink(path.join(uploadDir, 'feedback', path.basename(f.screenshot))).catch(() => {});
  }
}
