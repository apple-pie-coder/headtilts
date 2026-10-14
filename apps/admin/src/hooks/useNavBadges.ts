import { useCallback, useEffect, useState } from 'react';
import { PERMISSIONS } from '@headtilts/shared';
import { fetchComments } from '../services/comments';
import { fetchSubmissions } from '../services/contact';
import type { BadgeKey } from '../nav';

const REFRESH_EVENT = 'admin:badges-refresh';

/** Ask the sidebar to re-count its badges, e.g. after moderating a comment. */
export function refreshNavBadges() {
  window.dispatchEvent(new Event(REFRESH_EVENT));
}

/** Work-queue counts shown next to nav items (pending comments, unread messages). */
export function useNavBadges(hasPermission: (p: string) => boolean): Partial<Record<BadgeKey, number>> {
  const [counts, setCounts] = useState<Partial<Record<BadgeKey, number>>>({});
  const canComments = hasPermission(PERMISSIONS.COMMENT_READ);
  const canContact = hasPermission(PERMISSIONS.CONTACT_READ);

  const load = useCallback(async () => {
    const [comments, contact] = await Promise.all([
      canComments ? fetchComments(1, 1, { status: 'pending' }).catch(() => null) : null,
      canContact ? fetchSubmissions(1, 1, true).catch(() => null) : null,
    ]);
    setCounts({
      comments: comments?.statusCounts?.pending ?? 0,
      contact: contact?.unread ?? 0,
    });
  }, [canComments, canContact]);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
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
