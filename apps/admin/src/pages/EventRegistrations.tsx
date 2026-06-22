import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faDownload, faCheck, faBan, faQrcode, faSearch } from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmDialog';
import { fetchEvent, fetchRegistrations, patchRegistration, exportRegistrationsUrl, Registration, EventSummary } from '../services/events';
import styles from './Events.module.css';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending', confirmed: 'Confirmed', waitlisted: 'Waitlisted', cancelled: 'Cancelled',
};
const STATUS_CLASS: Record<string, string> = {
  confirmed: styles.statusPublished, pending: styles.statusPostponed,
  waitlisted: styles.statusDraft, cancelled: styles.statusCancelled,
};
const PAY_LABELS: Record<string, string> = {
  free: 'Free', pending: 'Pending', paid: 'Paid', refunded: 'Refunded',
};

const LIMIT = 50;

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function EventRegistrationsPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = Number(id);
  const toast = useToast();
  const confirm = useConfirm();

  const [event, setEvent]           = useState<EventSummary | null>(null);
  const [regs, setRegs]             = useState<Registration[]>([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(true);

  useEffect(() => { loadEvent(); }, []);
  useEffect(() => { loadRegs(); }, [page, statusFilter, search]);

  async function loadEvent() {
    try {
      const ev = await fetchEvent(eventId);
      setEvent(ev as unknown as EventSummary);
    } catch { /* ignore */ }
  }

  async function loadRegs() {
    setLoading(true);
    try {
      const data = await fetchRegistrations(eventId, { page, limit: LIMIT, status: statusFilter || undefined, search: search || undefined });
      setRegs(data.items);
      setTotal(data.pagination.total);
    } catch {
      toast.error('Failed to load registrations');
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(reg: Registration, action: 'approve' | 'cancel' | 'check-in') {
    const labels: Record<string, string> = { approve: 'Approve', cancel: 'Cancel', 'check-in': 'Check In' };
    if (action === 'cancel') {
      const yes = await confirm({ title: 'Cancel registration?', message: `Cancel registration for ${reg.name}?`, confirmLabel: 'Yes, cancel', danger: true });
      if (!yes) return;
    }
    try {
      await patchRegistration(eventId, reg.id, action);
      toast.success(`${labels[action]} applied`);
      loadRegs();
    } catch {
      toast.error(`Failed to ${labels[action].toLowerCase()} registration`);
    }
  }

  const pages = Math.ceil(total / LIMIT);
  const exportUrl = exportRegistrationsUrl(eventId);

  return (
    <AdminLayout>
      <div className={styles.header}>
        <div>
          <Link to="/admin/events" className={styles.regLink} style={{ marginBottom: '0.5rem', display: 'inline-flex' }}>
            <FontAwesomeIcon icon={faArrowLeft} />&nbsp;Events
          </Link>
          <h1 className={styles.title}>{event ? `${event.title} — Registrations` : 'Registrations'}</h1>
          <p className={styles.subtitle}>{total} registration{total !== 1 ? 's' : ''}</p>
        </div>
        <a href={exportUrl} download className={styles.addButton} style={{ background: 'var(--ghost)', color: 'var(--t1)', border: '1px solid var(--sep)' }}>
          <FontAwesomeIcon icon={faDownload} /> Export CSV
        </a>
      </div>

      <div className={styles.filters}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <FontAwesomeIcon icon={faSearch} style={{ position: 'absolute', left: '0.625rem', color: 'var(--t3)', fontSize: '0.8rem' }} />
          <input
            className={styles.searchInput}
            style={{ paddingLeft: '2rem' }}
            type="search"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select className={styles.filterSelect} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="waitlisted">Waitlisted</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <p style={{ color: 'var(--t3)', textAlign: 'center', padding: '3rem 0' }}>Loading…</p>
      ) : regs.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No registrations yet.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="Registrations">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Ticket</th>
                <th>Qty</th>
                <th>Status</th>
                <th>Payment</th>
                <th>Checked In</th>
                <th>Registered</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {regs.map((reg) => (
                <tr key={reg.id}>
                  <td>
                    <strong>{reg.name}</strong>
                    {reg.phone && <div style={{ color: 'var(--t3)', fontSize: '0.8rem' }}>{reg.phone}</div>}
                  </td>
                  <td style={{ fontSize: '0.875rem' }}>{reg.email}</td>
                  <td style={{ fontSize: '0.875rem' }}>{reg.ticketTier?.name ?? 'General'}</td>
                  <td style={{ textAlign: 'center' }}>{reg.quantity}</td>
                  <td>
                    <span className={`${styles.statusBadge} ${STATUS_CLASS[reg.status] ?? ''}`}>
                      {STATUS_LABELS[reg.status] ?? reg.status}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.8125rem', color: reg.paymentStatus === 'paid' ? 'var(--success-t)' : 'var(--t3)' }}>
                      {PAY_LABELS[reg.paymentStatus] ?? reg.paymentStatus}
                      {reg.paymentAmount ? ` ₹${(reg.paymentAmount / 100).toFixed(0)}` : ''}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8125rem', color: reg.checkInAt ? 'var(--success-t)' : 'var(--t3)' }}>
                    {reg.checkInAt ? formatDate(reg.checkInAt) : '—'}
                  </td>
                  <td style={{ fontSize: '0.8125rem', color: 'var(--t2)' }}>{formatDate(reg.registeredAt)}</td>
                  <td>
                    <div className={styles.actions}>
                      {reg.status === 'pending' && (
                        <button className={styles.actionBtn} title="Approve" onClick={() => handleAction(reg, 'approve')}>
                          <FontAwesomeIcon icon={faCheck} />
                        </button>
                      )}
                      {!reg.checkInAt && reg.status === 'confirmed' && (
                        <button className={styles.actionBtn} title="Check In" onClick={() => handleAction(reg, 'check-in')}>
                          <FontAwesomeIcon icon={faQrcode} />
                        </button>
                      )}
                      {reg.status !== 'cancelled' && (
                        <button className={`${styles.actionBtn} ${styles.danger}`} title="Cancel" onClick={() => handleAction(reg, 'cancel')}>
                          <FontAwesomeIcon icon={faBan} />
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
