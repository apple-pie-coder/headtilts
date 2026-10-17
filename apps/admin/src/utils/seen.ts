/**
 * "New since you last looked" for the feedback queue and issue board. Stored
 * per browser; the first time, anything from the past week counts as new.
 */
export type SeenKey = 'feedback' | 'issues';

const key = (k: SeenKey) => `htilts:seen:${k}`;
const WEEK = 7 * 24 * 3600 * 1000;

export function lastSeen(k: SeenKey): number {
  try {
    const v = Number(localStorage.getItem(key(k)));
    if (v > 0) return v;
  } catch { /* storage unavailable */ }
  return Date.now() - WEEK;
}

export function markSeen(k: SeenKey) {
  try { localStorage.setItem(key(k), String(Date.now())); } catch { /* non-fatal */ }
}

export const countNewer = (dates: (string | null | undefined)[], since: number) =>
  dates.filter((d) => d && new Date(d).getTime() > since).length;

/**
 * New feedback/issues for this user: excludes their own reports (and the issues
 * those reports opened) — you don't need telling about something you just sent.
 */
export function newCounts(
  me: string | undefined,
  feedback: { createdAt: string; user: { id: string } | null; issueNumber: number | null }[] | null,
  issues: { createdAt: string[]; created?: { number: number; createdAt: string }[] } | null,
) {
  const mine = feedback?.filter((f) => me && f.user?.id === me) ?? [];
  const mineIssues = new Set(mine.map((f) => f.issueNumber).filter((n): n is number => n != null));
  const fb = feedback ? countNewer(feedback.filter((f) => !mine.includes(f)).map((f) => f.createdAt), lastSeen('feedback')) : 0;
  const iss = issues
    ? countNewer(issues.created ? issues.created.filter((i) => !mineIssues.has(i.number)).map((i) => i.createdAt) : issues.createdAt, lastSeen('issues'))
    : 0;
  return { feedback: fb, issues: iss };
}
