/** "Closes in 3 days", "Closes today", "Closed 5 Oct" — friendly poll timing. */
export function pollTiming(status: string, endsAt: string | null | undefined, startsAt?: string | null): string | null {
  const now = Date.now();
  if (status === 'scheduled' && startsAt) {
    return `Opens ${new Date(startsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  }
  if (!endsAt) return status === 'open' ? 'No closing date' : null;
  const end = new Date(endsAt).getTime();
  if (status === 'closed' || end < now) return `Closed ${new Date(endsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const hours = (end - now) / 3_600_000;
  if (hours < 1) return 'Closes within the hour';
  if (hours < 24) return `Closes in ${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `Closes in ${days} day${days === 1 ? '' : 's'}`;
}

export const votesLabel = (n: number) => `${n.toLocaleString()} vote${n === 1 ? '' : 's'}`;
