import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faCalendarAlt, faUsers, faCompress, faGripVertical, faExpand, faGear } from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmDialog';
import { fetchEvents, deleteEvent, EventSummary } from '../services/events';
import { fetchSettings, updateSettings } from '../services/settings';
import { PERMISSIONS } from '@headtilts/shared';
import { useAuth } from '../hooks/useAuth';
import styles from './Events.module.css';

// ── Carousel Settings Modal ──────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <label className={`${styles.csToggle}${disabled ? ` ${styles.csToggleDisabled}` : ''}`}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
      <span className={styles.csToggleSlider} />
    </label>
  );
}

function CarouselSettingsModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfgState] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchSettings()
      .then((all) => {
        const c: Record<string, string> = {};
        for (const s of all) {
          if (s.key.startsWith('event_carousel_')) c[s.key] = s.value;
        }
        setCfgState(c);
      })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function get(key: string, def = ''): string {
    return cfg[`event_carousel_${key}`] ?? def;
  }
  function set(key: string, val: string) {
    setCfgState((prev) => ({ ...prev, [`event_carousel_${key}`]: val }));
  }
  function toggle(key: string, def: string) {
    set(key, get(key, def) === 'false' ? 'true' : 'false');
  }

  async function save() {
    setSaving(true);
    try {
      await updateSettings(cfg);
      toast.success('Carousel settings saved');
      onClose();
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  const autoplay = get('autoplay', 'true') !== 'false';

  return (
    <div className={styles.csOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.csModal}>
        <div className={styles.csHeader}>
          <h3>Carousel Settings</h3>
          <button className={styles.csClose} onClick={onClose} aria-label="Close">×</button>
        </div>

        {loading ? (
          <div className={styles.csBody}><p className={styles.csLoading}>Loading…</p></div>
        ) : (
          <div className={styles.csBody}>
            <div className={styles.csSection}>
              <p className={styles.csSectionLabel}>Content</p>
              <div className={styles.csRow}>
                <span className={styles.csRowLabel}>Featured events count</span>
                <input
                  type="number" min={1} max={10}
                  value={get('count', '5')}
                  onChange={(e) => set('count', e.target.value)}
                  className={styles.csInput}
                />
              </div>
              <div className={styles.csRow}>
                <span className={styles.csRowLabel}>Transition effect</span>
                <select
                  value={get('transition', 'slide')}
                  onChange={(e) => set('transition', e.target.value)}
                  className={styles.csSelect}
                >
                  <option value="slide">Slide</option>
                  <option value="fade">Fade</option>
                </select>
              </div>
            </div>

            <div className={styles.csSection}>
              <p className={styles.csSectionLabel}>Autoplay</p>
              <div className={styles.csRow}>
                <span className={styles.csRowLabel}>Enable autoplay</span>
                <Toggle checked={autoplay} onChange={() => toggle('autoplay', 'true')} />
              </div>
              <div className={styles.csRow}>
                <span className={styles.csRowLabel}>Interval</span>
                <select
                  value={get('interval', '5')}
                  onChange={(e) => set('interval', e.target.value)}
                  disabled={!autoplay}
                  className={styles.csSelect}
                >
                  <option value="3">3 seconds</option>
                  <option value="5">5 seconds</option>
                  <option value="8">8 seconds</option>
                  <option value="10">10 seconds</option>
                </select>
              </div>
              <div className={styles.csRow}>
                <span className={styles.csRowLabel}>Pause on hover</span>
                <Toggle
                  checked={get('pause_on_hover', 'true') !== 'false'}
                  onChange={() => toggle('pause_on_hover', 'true')}
                  disabled={!autoplay}
                />
              </div>
            </div>

            <div className={styles.csSection}>
              <p className={styles.csSectionLabel}>Navigation</p>
              <div className={styles.csRow}>
                <span className={styles.csRowLabel}>Show arrows</span>
                <Toggle checked={get('show_arrows', 'true') !== 'false'} onChange={() => toggle('show_arrows', 'true')} />
              </div>
              <div className={styles.csRow}>
                <span className={styles.csRowLabel}>Show dots</span>
                <Toggle checked={get('show_dots', 'true') !== 'false'} onChange={() => toggle('show_dots', 'true')} />
              </div>
              <div className={styles.csRow}>
                <span className={styles.csRowLabel}>Loop</span>
                <Toggle checked={get('loop', 'true') !== 'false'} onChange={() => toggle('loop', 'true')} />
              </div>
            </div>
          </div>
        )}

        <div className={styles.csFooter}>
          <button className={styles.csCancel} onClick={onClose}>Cancel</button>
          <button className={styles.csSave} onClick={save} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', published: 'Published', cancelled: 'Cancelled', postponed: 'Postponed',
};
const TYPE_LABELS: Record<string, string> = {
  in_person: 'In Person', online: 'Online', hybrid: 'Hybrid',
};
const LIMIT = 20;

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function EventsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
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
  const [density, setDensity]   = useState<'compact' | 'condensed' | 'relaxed'>('compact');
  const [showCarouselSettings, setShowCarouselSettings] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem('eventsDensity');
      if (v === 'compact' || v === 'condensed' || v === 'relaxed') setDensity(v);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem('eventsDensity', density); } catch { /* ignore */ }
  }, [density]);

  useEffect(() => { load(); }, [page, search, statusFilter, typeFilter, timeframe]);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchEvents({
        page, limit: LIMIT,
        search: search || undefined,
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        timeframe: timeframe || undefined,
      });
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
        <div className={styles.headerActions}>
          <button
            className={styles.gearButton}
            onClick={() => setShowCarouselSettings(true)}
            title="Carousel settings"
            aria-label="Carousel settings"
          >
            <FontAwesomeIcon icon={faGear} />
          </button>
          {canCreate && (
            <Link to="/admin/events/new" className={styles.addButton}>
              <FontAwesomeIcon icon={faPlus} /> New Event
            </Link>
          )}
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <div className={styles.filter}>
            <label>Search</label>
            <input
              type="search"
              placeholder="Search events…"
              value={search}
              autoFocus
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <div className={styles.filter}>
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="cancelled">Cancelled</option>
              <option value="postponed">Postponed</option>
            </select>
          </div>
          <div className={styles.filter}>
            <label>Type</label>
            <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
              <option value="">All types</option>
              <option value="in_person">In Person</option>
              <option value="online">Online</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div className={styles.filter}>
            <label>Timeframe</label>
            <select value={timeframe} onChange={(e) => { setTimeframe(e.target.value); setPage(1); }}>
              <option value="">All time</option>
              <option value="upcoming">Upcoming</option>
              <option value="past">Past</option>
            </select>
          </div>
          <div className={styles.filter}>
            <label>Density</label>
            <div className={styles.densitySwitch} role="group" aria-label="List density">
              <button type="button" className={`${styles.densityOption} ${density === 'compact' ? styles.densityOptionActive : ''}`} onClick={() => setDensity('compact')} title="Compact" aria-pressed={density === 'compact'}>
                <FontAwesomeIcon icon={faCompress} />
              </button>
              <button type="button" className={`${styles.densityOption} ${density === 'condensed' ? styles.densityOptionActive : ''}`} onClick={() => setDensity('condensed')} title="Condensed" aria-pressed={density === 'condensed'}>
                <FontAwesomeIcon icon={faGripVertical} />
              </button>
              <button type="button" className={`${styles.densityOption} ${density === 'relaxed' ? styles.densityOptionActive : ''}`} onClick={() => setDensity('relaxed')} title="Relaxed" aria-pressed={density === 'relaxed'}>
                <FontAwesomeIcon icon={faExpand} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <p className={styles.empty}>Loading…</p>
      ) : events.length === 0 ? (
        <div className={styles.emptyState}>
          <FontAwesomeIcon icon={faCalendarAlt} className={styles.emptyIcon} />
          <p>No events found.</p>
          {canCreate && (
            <Link to="/admin/events/new" className={styles.addButton}>
              <FontAwesomeIcon icon={faPlus} /> Create First Event
            </Link>
          )}
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles[`density_${density}`]} aria-label="Events">
            <thead>
              <tr>
                <th>Title</th>
                <th>Featured</th>
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
                    <button
                      className={styles.titleLink}
                      onClick={() => navigate(`/admin/events/${ev.id}/edit`)}
                    >
                      {ev.title}
                    </button>
                    <div className={styles.titleMeta}>
                      {ev.isRecurring && <span className={styles.recurrenceBadge}>↻ Recurring</span>}
                      {ev.parentEventId && <span className={styles.recurrenceBadge}>↻ Occurrence</span>}
                    </div>
                  </td>
                  <td>
                    {ev.isFeatured ? <span className={styles.featuredBadge}>Featured</span> : '—'}
                  </td>
                  <td>
                    <span className={styles.typeBadge}>{TYPE_LABELS[ev.type] ?? ev.type}</span>
                  </td>
                  <td>
                    <div className={styles.date}>{formatDate(ev.startAt)}</div>
                    <div className={styles.dateSub}>→ {formatDate(ev.endAt)}</div>
                  </td>
                  <td>
                    {[ev.venueName, ev.venueCity].filter(Boolean).join(', ') || (ev.type === 'online' ? 'Online' : '—')}
                  </td>
                  <td>
                    <span className={`${styles.statusBadge} ${styles[`status_${ev.status}`] ?? ''}`}>
                      {STATUS_LABELS[ev.status] ?? ev.status}
                    </span>
                  </td>
                  <td>
                    <Link to={`/admin/events/${ev.id}/registrations`} className={styles.regLink}>
                      <FontAwesomeIcon icon={faUsers} />
                      {ev._count.registrations}
                      {ev.maxAttendees ? ` / ${ev.maxAttendees}` : ''}
                    </Link>
                  </td>
                  <td>
                    <div className={styles.actions}>
                      {canEdit && (
                        <button onClick={() => navigate(`/admin/events/${ev.id}/edit`)}>Edit</button>
                      )}
                      {canDelete && (
                        <button className={styles.deleteButton} onClick={() => handleDelete(ev)}>Delete</button>
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
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
      {showCarouselSettings && (
        <CarouselSettingsModal onClose={() => setShowCarouselSettings(false)} />
      )}
    </AdminLayout>
  );
}
