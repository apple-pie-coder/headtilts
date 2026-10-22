import { useCallback, useEffect, useState } from 'react';
import { faRotate } from '@fortawesome/free-solid-svg-icons';
import { Button, Card, Pagination, StatusBadge, absoluteTime, relativeTime } from '../../components/ui';
import t from '../../components/ui/table.module.css';
import { CheckInLogEntry, DoorStats, fetchCheckInLog } from '../../services/checkIn';
import styles from './DoorLog.module.css';

const VERDICT_LABEL: Record<string, string> = {
  already: 'Already in', flagged: 'Payment disputed', cancelled: 'Cancelled', refunded: 'Refunded', unpaid: 'Not paid',
  awaiting_approval: 'Not approved', waitlisted: 'Waitlisted', unconfirmed: 'Email not confirmed', not_found: 'Not found',
  wrong_event: 'Wrong event', expired: 'Expired live code', invalid: 'Not a ticket', live_required: 'Needed live ticket',
};
const SOURCE_LABEL: Record<string, string> = { scan: 'Scan', manual: 'By name', offline: 'Scan (offline)' };

function describe(e: CheckInLogEntry) {
  if (e.action === 'admit') return <StatusBadge tone={e.override ? 'warning' : 'success'}>{e.override ? 'Override' : 'Admitted'} {e.count}</StatusBadge>;
  if (e.action === 'undo') return <StatusBadge tone="info">Undone {e.count}</StatusBadge>;
  return <StatusBadge tone="danger">{VERDICT_LABEL[e.verdict ?? ''] ?? 'Refused'}</StatusBadge>;
}

/**
 * Every scan at the door for one event: who was let in, refused, overridden
 * or undone, by which phone and person. Overrides show their reason.
 */
export function DoorLog({ eventId, onStats, refreshKey = 0 }: { eventId: number; onStats?: (s: DoorStats) => void; refreshKey?: number }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: CheckInLogEntry[]; total: number } | null>(null);
  const [error, setError] = useState('');
  const LIMIT = 25;

  const load = useCallback(async () => {
    try {
      const res = await fetchCheckInLog(eventId, page, LIMIT);
      setData(res);
      onStats?.(res.stats);
      setError('');
    } catch {
      setError('Couldn’t load the door log.');
    }
  }, [eventId, page, onStats, refreshKey]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className={styles.section} aria-labelledby="door-log-title">
      <div className={styles.head}>
        <h2 id="door-log-title" className={styles.title}>Door log</h2>
        <Button size="sm" icon={faRotate} onClick={() => { void load(); }}>Refresh</Button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      {data && data.items.length === 0 && <p className={styles.empty}>Nothing scanned yet. Scans from the door phones appear here.</p>}
      {data && data.items.length > 0 && (
        <Card>
          <div className={t.scroll}>
            <table className={t.table} aria-label="Door log">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Ticket</th>
                  <th>Result</th>
                  <th className={t.hideSm}>Door</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id}>
                    <td className={`${t.nowrap} ${t.muted}`} title={absoluteTime(e.scannedAt)}>{relativeTime(e.scannedAt)}</td>
                    <td className={t.primaryCell}>
                      <div className={t.stack}>
                        <span className={t.primary}>{e.registration?.name ?? 'Unknown ticket'}</span>
                        {e.reason && <span className={t.secondary}>Reason: {e.reason}</span>}
                      </div>
                    </td>
                    <td>{describe(e)}</td>
                    <td className={t.hideSm}>
                      <div className={t.stack}>
                        <span>{e.device ?? '—'}</span>
                        <span className={t.secondary}>{[e.staffName, SOURCE_LABEL[e.source]].filter(Boolean).join(' · ')}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {data && data.total > LIMIT && <Pagination page={page} pageSize={LIMIT} total={data.total} onPage={setPage} />}
      <p className={styles.note}>Overrides need a supervisor and a reason; door staff can only undo their own check-ins, within 5 minutes.</p>
    </section>
  );
}
