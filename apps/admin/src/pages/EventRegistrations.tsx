import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AxiosError } from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft, faDownload, faCheck, faBan, faUserCheck, faEnvelope, faCopy, faUsers, faMagnifyingGlass,
} from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmDialog';
import {
  BulkBar, Button, Card, Checkbox, EmptyState, LoadingBar, MenuItem, PageHeader, Pagination, RowMenu, SearchInput,
  StatusBadge, TableSkeleton, Tabs, absoluteTime, relativeTime, useRowSelection,
} from '../components/ui';
import t from '../components/ui/table.module.css';
import { useUrlState } from '../hooks/useUrlState';
import { fetchEvent, fetchRegistrations, patchRegistration, exportRegistrationsUrl, Registration, EventSummary } from '../services/events';
import styles from './EventRegistrations.module.css';

const STATUS_META: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  pending: { label: 'Pending', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  waitlisted: { label: 'Waitlisted', tone: 'info' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};
const PAY_LABELS: Record<string, string> = {
  free: 'Free', pending: 'Payment pending', paid: 'Paid', refunded: 'Refunded',
};
type Action = 'approve' | 'cancel' | 'check-in';
const ACTION_DONE: Record<Action, string> = { approve: 'Approved', cancel: 'Cancelled', 'check-in': 'Checked in' };

/** The API only confirms free or paid orders that aren't cancelled. */
function canApprove(r: Registration): boolean {
  return (r.status === 'pending' || r.status === 'waitlisted') && (r.paymentStatus === 'free' || r.paymentStatus === 'paid');
}

function errorMessage(err: unknown, fallback: string): string {
  return (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback;
}

export default function EventRegistrationsPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = Number(id);
  const toast = useToast();
  const confirm = useConfirm();

  const [q, setQ] = useUrlState({ status: '', search: '', page: '1' });
  const page = Math.max(1, Number(q.page) || 1);
  const LIMIT = 50;

  const [event, setEvent] = useState<EventSummary | null>(null);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    fetchEvent(eventId).then((ev) => setEvent(ev as unknown as EventSummary)).catch(() => {});
  }, [eventId]);

  const load = useCallback(async () => {
    const rid = ++reqId.current;
    setLoading(true);
    try {
      const data = await fetchRegistrations(eventId, { page, limit: LIMIT, status: q.status || undefined, search: q.search || undefined });
      if (rid !== reqId.current) return;
      setRegs(data.items);
      setTotal(data.pagination.total);
      setLoaded(true);
    } catch (err) {
      if (rid === reqId.current) toast.error(errorMessage(err, 'Failed to load registrations'));
    } finally {
      if (rid === reqId.current) setLoading(false);
    }
  }, [eventId, page, q.status, q.search]);

  useEffect(() => { load(); }, [load]);

  const ids = useMemo(() => regs.map((r) => r.id), [regs]);
  const sel = useRowSelection(ids);

  async function act(targets: Registration[], action: Action) {
    if (targets.length === 0) {
      toast.info('None of the selected registrations can do that');
      return;
    }
    if (action === 'cancel' && !(await confirm({
      title: targets.length === 1 ? `Cancel ${targets[0].name}'s registration?` : `Cancel ${targets.length} registrations?`,
      message: 'Their spot will be released. This cannot be undone from here.',
      confirmLabel: 'Cancel registration',
      cancelLabel: 'Keep',
      danger: true,
    }))) return;
    setBusy(true);
    try {
      const updated = await Promise.all(targets.map((r) => patchRegistration(eventId, r.id, action)));
      const byId = new Map(updated.map((u) => [u.id, u]));
      setRegs((list) => list.map((r) => byId.get(r.id) ?? r));
      toast.success(targets.length === 1 ? `${ACTION_DONE[action]}: ${targets[0].name}` : `${ACTION_DONE[action]} ${targets.length} attendees`);
      sel.clear();
    } catch (err) {
      toast.error(errorMessage(err, 'Action failed'));
    } finally {
      setBusy(false);
      load();
    }
  }

  function menu(r: Registration): MenuItem[] {
    return [
      { label: 'Approve', icon: faCheck, onClick: () => act([r], 'approve'), hidden: !canApprove(r) },
      { label: 'Check in', icon: faUserCheck, onClick: () => act([r], 'check-in'), hidden: r.status !== 'confirmed' || !!r.checkInAt },
      { label: 'Email attendee', icon: faEnvelope, onClick: () => { window.location.href = `mailto:${r.email}?subject=${encodeURIComponent(event?.title ?? 'Your registration')}`; } },
      {
        label: 'Copy ticket code',
        icon: faCopy,
        onClick: () => navigator.clipboard.writeText(r.ticketCode).then(() => toast.success('Ticket code copied'), () => toast.error('Could not copy')),
      },
      { label: 'Cancel registration', icon: faBan, onClick: () => act([r], 'cancel'), danger: true, hidden: r.status === 'cancelled', divider: true },
    ];
  }

  const selected = regs.filter((r) => sel.selected.has(r.id));
  const checkedInOnPage = regs.filter((r) => r.checkInAt).length;
  const seats = regs.filter((r) => r.status === 'confirmed').reduce((n, r) => n + r.quantity, 0);

  return (
    <AdminLayout>
      <Link to="/admin/events" className={styles.back}><FontAwesomeIcon icon={faArrowLeft} /> All events</Link>
      <PageHeader
        title={event ? event.title : 'Registrations'}
        subtitle={event
          ? `${new Date(event.startAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · ${total} registration${total === 1 ? '' : 's'}${event.maxAttendees ? ` · capacity ${event.maxAttendees}` : ''}`
          : `${total} registration${total === 1 ? '' : 's'}`}
        actions={
          <a href={exportRegistrationsUrl(eventId)} download className={styles.exportBtn}>
            <FontAwesomeIcon icon={faDownload} /> Export CSV
          </a>
        }
      />

      {loaded && regs.length > 0 && (
        <div className={styles.stats}>
          <div><strong>{seats}</strong><span>seats confirmed{q.page !== '1' || total > LIMIT ? ' (this page)' : ''}</span></div>
          <div><strong>{checkedInOnPage}</strong><span>checked in</span></div>
          {event?.maxAttendees ? (
            <div className={styles.capWrap}>
              <span className={styles.cap}><span style={{ width: `${Math.min(100, (seats / event.maxAttendees) * 100)}%` }} /></span>
              <span>{Math.round((seats / event.maxAttendees) * 100)}% full</span>
            </div>
          ) : null}
        </div>
      )}

      <Tabs
        tabs={[{ key: '', label: 'All' }, ...Object.entries(STATUS_META).map(([key, m]) => ({ key, label: m.label }))]}
        value={q.status}
        onChange={(status) => { setQ({ status }); sel.clear(); }}
      />

      <div className={t.toolbar}>
        <SearchInput value={q.search} onChange={(search) => setQ({ search })} placeholder="Search name, email or ticket code" />
      </div>

      <Card>
        <LoadingBar active={loading && loaded} />
        <div className={t.scroll}>
          <table className={t.table} aria-label="Registrations">
            <thead>
              <tr>
                <th className={t.checkCol}>
                  <Checkbox label="Select all on this page" checked={sel.allSelected} indeterminate={sel.someSelected} onChange={() => sel.toggleAll()} />
                </th>
                <th>Attendee</th>
                <th className={t.hideMd}>Ticket</th>
                <th>Status</th>
                <th className={t.hideSm}>Registered</th>
                <th>Check-in</th>
                <th className={t.actionsCol}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {!loaded && <TableSkeleton rows={6} cols={7} />}
              {regs.map((r) => (
                <tr key={r.id} className={[sel.selected.has(r.id) && t.rowSelected, r.status === 'cancelled' && t.rowDim].filter(Boolean).join(' ') || undefined}>
                  <td className={t.checkCol}>
                    <Checkbox label={`Select ${r.name}`} checked={sel.selected.has(r.id)} onChange={(shift) => sel.toggle(r.id, shift)} />
                  </td>
                  <td className={t.primaryCell}>
                    <div className={t.stack}>
                      <span className={t.primary}>{r.name}{r.quantity > 1 && <span className={t.faint}> ×{r.quantity}</span>}</span>
                      <span className={t.secondary}>
                        <a href={`mailto:${r.email}`} className={styles.email}>{r.email}</a>
                        {r.phone && <span>· {r.phone}</span>}
                      </span>
                    </div>
                  </td>
                  <td className={t.hideMd}>
                    <div className={t.stack}>
                      <span>{r.ticketTier?.name ?? 'General'}</span>
                      <span className={t.secondary}>
                        <span className={t.mono}>{r.ticketCode}</span>
                        <span className={r.paymentStatus === 'paid' ? styles.paid : undefined}>
                          · {PAY_LABELS[r.paymentStatus] ?? r.paymentStatus}
                          {r.paymentAmount ? ` ₹${(r.paymentAmount / 100).toFixed(0)}` : ''}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td><StatusBadge tone={STATUS_META[r.status]?.tone ?? 'neutral'}>{STATUS_META[r.status]?.label ?? r.status}</StatusBadge></td>
                  <td className={`${t.muted} ${t.hideSm} ${t.nowrap}`} title={absoluteTime(r.registeredAt)}>{relativeTime(r.registeredAt)}</td>
                  <td>
                    {r.checkInAt ? (
                      <span className={styles.checkedIn} title={absoluteTime(r.checkInAt)}><FontAwesomeIcon icon={faUserCheck} /> {relativeTime(r.checkInAt)}</span>
                    ) : r.status === 'confirmed' ? (
                      <Button size="sm" icon={faUserCheck} disabled={busy} onClick={() => act([r], 'check-in')}>Check in</Button>
                    ) : canApprove(r) ? (
                      <Button size="sm" icon={faCheck} disabled={busy} onClick={() => act([r], 'approve')}>Approve</Button>
                    ) : r.status === 'pending' ? (
                      <span className={t.faint}>Awaiting payment</span>
                    ) : <span className={t.faint}>—</span>}
                  </td>
                  <td className={t.actionsCol}>
                    <RowMenu items={menu(r)} label={`Actions for ${r.name}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loaded && regs.length === 0 && (
          q.search || q.status ? (
            <EmptyState icon={faMagnifyingGlass} title="No registrations match" action={<Button onClick={() => setQ({ search: '', status: '' })}>Clear filters</Button>} />
          ) : (
            <EmptyState icon={faUsers} title="No registrations yet" description="People who sign up for this event will appear here." />
          )
        )}
      </Card>

      {loaded && total > LIMIT && (
        <Pagination page={page} pageSize={LIMIT} total={total} onPage={(p) => setQ({ page: String(p) })} />
      )}

      <BulkBar count={sel.selected.size} noun="registration" onClear={sel.clear}>
        <Button size="sm" icon={faCheck} disabled={busy} onClick={() => act(selected.filter(canApprove), 'approve')}>Approve</Button>
        <Button size="sm" icon={faUserCheck} disabled={busy} onClick={() => act(selected.filter((r) => r.status === 'confirmed' && !r.checkInAt), 'check-in')}>Check in</Button>
        <Button size="sm" variant="danger" icon={faBan} disabled={busy} onClick={() => act(selected.filter((r) => r.status !== 'cancelled'), 'cancel')}>Cancel</Button>
      </BulkBar>
    </AdminLayout>
  );
}
