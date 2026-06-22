import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faEdit, faTrash, faUsers, faCalendarAlt } from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmDialog';
import { fetchEvents, deleteEvent, EventSummary } from '../services/events';
import { PERMISSIONS } from '@headtilts/shared';
import { useAuth } from '../hooks/useAuth';
import styles from './Events.module.css';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', published: 'Published', cancelled: 'Cancelled', postponed: 'Postponed',
};
const STATUS_CLASS: Record<string, string> = {
  draft: styles.statusDraft, published: styles.statusPublished,
  cancelled: styles.statusCancelled, postponed: styles.statusPostponed,
};
const TYPE_LABELS: Record<string, string> = {
  in_person: 'In Person', online: 'Online', hybrid: 'Hybrid',
};
const LIMIT = 20;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function EventsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.EVENT_CREATE);
  const canEdit   = hasPermission(PERMISSIONS.EVENT_EDIT);
  const canDelete = hasPermission(PERMISSIONS.EVENT_DELETE);

  const [events, setEvents]     = useState<EventSummary[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [timeframe, setTimeframe] = useState('');
  const [loading, setLoading]   = useState(true);

  useEffect(() => { load(); }, [page, search, statusFilter, typeFilter, timeframe]);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchEvents({ page, limit: LIMIT, search: search || undefined, status: statusFilter || undefined, type: typeFilter || undefined, timeframe: timeframe || undefined });
      setEvents(data.items);
      setTotal(data.pagination.total);
    } catch {
      toast.error('Failed to load events');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(ev: EventSummary) {
    const yes = await confirm({
      title: 'Delete event?',
      message: `"${ev.title}" and all its registrations will be permanently deleted.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!yes) return;
    try {
      await deleteEvent(ev.id);
      toast.success('Event deleted');
      load();
    } catch {
      toast.error('Failed to delete event');
    }
  }

  const pages = Math.ceil(total / LIMIT);

  return (
    <AdminLayout>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Events</h1>
          <p className={styles.subtitle}>{total} event{total !== 1 ? 's' : ''} total</p>
        </div>
        {canCreate && (
          <Link to="/admin/events/new" className={styles.addButton}>
            <FontAwesomeIcon icon={faPlus} /> New Event
          </Link>
        )}
      </div>

      <div className={styles.filters}>
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search events…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select className={styles.filterSelect} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="cancelled">Cancelled</option>
          <option value="postponed">Postponed</option>
        </select>
        <select className={styles.filterSelect} value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
          <option value="">All types</option>
          <option value="in_person">In Person</option>
          <option value="online">Online</option>
          <option value="hybrid">Hybrid</option>
        </select>
        <select className={styles.filterSelect} value={timeframe} onChange={(e) => { setTimeframe(e.target.value); setPage(1); }}>
          <option value="">All time</option>
          <option value="upcoming">Upcoming</option>
          <option value="past">Past</option>
        </select>
      </div>

      {loading ? (
        <p className={styles.empty}>Loading…</p>
      ) : events.length === 0 ? (
        <div className={styles.emptyState}>
          <FontAwesomeIcon icon={faCalendarAlt} className={styles.emptyIcon} />
          <p>No events found.</p>
          {canCreate && <Link to="/admin/events/new" className={styles.addButton}><FontAwesomeIcon icon={faPlus} /> Create First Event</Link>}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="Events">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Date</th>
                <th>Location</th>
                <th>Status</th>
                <th>Registrations</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td>
                    <strong>{ev.title}</strong>
                    {ev.isFeatured && <span className={styles.featuredBadge}> ★ Featured</span>}
                    {ev.isRecurring && <span className={styles.recurrenceBadge}> ↻</span>}
                    {ev.parentEventId && <span className={styles.recurrenceBadge}> ↻ Occurrence</span>}
                  </td>
                  <td>{TYPE_LABELS[ev.type] ?? ev.type}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <div>{formatDate(ev.startAt)}</div>
                    <div style={{ color: 'var(--t3)', fontSize: '0.8rem' }}>→ {formatDate(ev.endAt)}</div>
                  </td>
                  <td>{[ev.venueName, ev.venueCity].filter(Boolean).join(', ') || (ev.type === 'online' ? 'Online' : '—')}</td>
                  <td>
                    <span className={`${styles.statusBadge} ${STATUS_CLASS[ev.status] ?? ''}`}>
                      {STATUS_LABELS[ev.status] ?? ev.status}
                    </span>
                  </td>
                  <td>
                    <Link to={`/admin/events/${ev.id}/registrations`} className={styles.regLink}>
                      <FontAwesomeIcon icon={faUsers} />
                      &nbsp;{ev._count.registrations}
                      {ev.maxAttendees ? ` / ${ev.maxAttendees}` : ''}
                    </Link>
                  </td>
                  <td>
                    <div className={styles.actions}>
                      {canEdit && (
                        <Link to={`/admin/events/${ev.id}/edit`} className={styles.actionBtn} title="Edit">
                          <FontAwesomeIcon icon={faEdit} />
                        </Link>
                      )}
                      {canDelete && (
                        <button className={`${styles.actionBtn} ${styles.danger}`} onClick={() => handleDelete(ev)} title="Delete">
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className={styles.pagination}>
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
          <span>Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      )}
    </AdminLayout>
  );
}
