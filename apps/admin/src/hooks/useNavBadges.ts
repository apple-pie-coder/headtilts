import { useCallback, useEffect, useState } from 'react';
import { PERMISSIONS } from '@headtilts/shared';
import { fetchComments } from '../services/comments';
import { fetchSubmissions } from '../services/contact';
import { fetchFeedback } from '../services/feedback';
import { fetchIssueSummary } from '../services/issues';
import { newCounts } from '../utils/seen';
import { useAuth } from './useAuth';
import type { BadgeKey } from '../nav';

export const REFRESH_EVENT = 'admin:badges-refresh';

/** Ask the sidebar to re-count its badges, e.g. after moderating a comment. */
export function refreshNavBadges() {
  window.dispatchEvent(new Event(REFRESH_EVENT));
}

/** Work-queue counts shown next to nav items (pending comments, unread messages). */
export function useNavBadges(hasPermission: (p: string) => boolean): Partial<Record<BadgeKey, number>> {
  const [counts, setCounts] = useState<Partial<Record<BadgeKey, number>>>({});
  const canComments = hasPermission(PERMISSIONS.COMMENT_READ);
  const canContact = hasPermission(PERMISSIONS.CONTACT_READ);
  const canTrack = hasPermission(PERMISSIONS.SETTING_READ);
  const me = useAuth().user?.id;

  const load = useCallback(async () => {
    const [comments, contact, feedback, issues] = await Promise.all([
      canComments ? fetchComments(1, 1, { status: 'pending' }).catch(() => null) : null,
      canContact ? fetchSubmissions(1, 1, true).catch(() => null) : null,
      canTrack ? fetchFeedback(1, 20).catch(() => null) : null,
      canTrack ? fetchIssueSummary().catch(() => null) : null,
    ]);
    setCounts({
      comments: comments?.statusCounts?.pending ?? 0,
      contact: contact?.unread ?? 0,
      // "New since you last opened the page", leaving out your own reports.
      ...newCounts(me, feedback?.items ?? null, issues?.configured ? issues : null),
    });
  }, [canComments, canContact, canTrack, me]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    window.addEventListener(REFRESH_EVENT, load);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(REFRESH_EVENT, load);
    };
  }, [load]);

  return counts;
}
