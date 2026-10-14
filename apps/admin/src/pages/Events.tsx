import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faCalendarAlt, faUsers, faGear, faPen, faTrashCan, faArrowUpRightFromSquare, faMagnifyingGlass,
  faRepeat, faStar, faLocationDot, faVideo, faLink,
} from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmDialog';
import {
  ActiveFilter, ActiveFilters, Button, Card, DensityToggle, EmptyState, Field, FilterMenu, LoadingBar, MenuItem,
  PageHeader, Pagination, RowMenu, SearchInput, StatusBadge, TableSkeleton, Tabs, relativeTime,
} from '../components/ui';
import t from '../components/ui/table.module.css';
import { fetchEvents, deleteEvent, EventSummary } from '../services/events';
import { fetchSettings, updateSettings } from '../services/settings';
import { resolveMediaUrl } from '../services/media';
import { PERMISSIONS } from '@headtilts/shared';
import { useAuth } from '../hooks/useAuth';
import { useDensity } from '../hooks/useDensity';
import { useHotkeys } from '../hooks/useHotkeys';
import { useUrlState } from '../hooks/useUrlState';
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
  }, []);

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

const STATUS_META: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  published: { label: 'Published', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  postponed: { label: 'Postponed', tone: 'warning' },
};
const TYPE_LABELS: Record<string, string> = {
  in_person: 'In person', online: 'Online', hybrid: 'Hybrid',
};

function errorMessage(err: unknown, fallback: string): string {
  return (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback;
}

function timeRange(ev: EventSummary): string {
  const start = new Date(ev.startAt);
  const end = new Date(ev.endAt);
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const day = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return start.toDateString() === end.toDateString()
    ? `${day(start)} · ${time(start)}–${time(end)}`
    : `${day(start)} ${time(start)} → ${day(end)} ${time(end)}`;
}

export default function EventsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.EVENT_CREATE);
  const canEdit = hasPermission(PERMISSIONS.EVENT_EDIT);
  const canDelete = hasPermission(PERMISSIONS.EVENT_DELETE);
  const canRegs = hasPermission(PERMISSIONS.EVENT_MANAGE_REGISTRATIONS);

  const [q, setQ] = useUrlState({ when: 'upcoming', search: '', status: '', type: '', page: '1', per: '20' });
  const page = Math.max(1, Number(q.page) || 1);
  const perPage = Number(q.per) || 20;

  const [events, setEvents] = useState<EventSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [density, setDensity] = useDensity('eventsDensity');
  const [showCarouselSettings, setShowCarouselSettings] = useState(false);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const data = await fetchEvents({
        page,
        limit: perPage,
        search: q.search || undefined,
        status: q.status || undefined,
        type: q.type || undefined,
        timeframe: q.when === 'all' ? undefined : q.when,
      });
      if (id !== reqId.current) return;
      setEvents(data.items);
      setTotal(data.pagination.total);
      setLoaded(true);
    } catch (err) {
      if (id === reqId.current) toast.error(errorMessage(err, 'Failed to load events'));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [page, perPage, q.search, q.status, q.type, q.when]);

  useEffect(() => { load(); }, [load]);

  useHotkeys({ n: () => { if (canCreate) navigate('/admin/events/new'); } });

  async function handleDelete(ev: EventSummary) {
    const regs = ev._count.registrations;
    if (!(await confirm({
      title: `Delete “${ev.title}”?`,
      message: `${regs ? `Its ${regs} registration${regs === 1 ? '' : 's'} will be deleted too. ` : ''}This cannot be undone.`,
      confirmLabel: 'Delete event',
      danger: true,
    }))) return;
    try {
      await deleteEvent(ev.id);
      toast.success('Event deleted');
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete event'));
    }
  }

  function menu(ev: EventSummary): MenuItem[] {
    return [
      { label: 'Edit', icon: faPen, onClick: () => navigate(`/admin/events/${ev.id}/edit`), hidden: !canEdit },
      { label: 'Registrations', icon: faUsers, onClick: () => navigate(`/admin/events/${ev.id}/registrations`), hidden: !canRegs },
      { label: 'View on site', icon: faArrowUpRightFromSquare, onClick: () => window.open(`/events/${ev.slug}`, '_blank', 'noopener'), hidden: ev.status === 'draft' },
      {
        label: 'Copy link',
        icon: faLink,
        onClick: () => navigator.clipboard.writeText(new URL(`/events/${ev.slug}`, window.location.origin).href).then(() => toast.success('Link copied'), () => toast.error('Could not copy')),
        hidden: ev.status === 'draft',
      },
      { label: 'Delete', icon: faTrashCan, onClick: () => handleDelete(ev), danger: true, hidden: !canDelete, divider: true },
    ];
  }

  const activeFilters: ActiveFilter[] = [];
  if (q.search) activeFilters.push({ key: 'search', label: `“${q.search}”`, onRemove: () => setQ({ search: '' }) });
  if (q.status) activeFilters.push({ key: 'status', label: `Status: ${STATUS_META[q.status]?.label ?? q.status}`, onRemove: () => setQ({ status: '' }) });
  if (q.type) activeFilters.push({ key: 'type', label: `Type: ${TYPE_LABELS[q.type] ?? q.type}`, onRemove: () => setQ({ type: '' }) });
  const clearFilters = () => setQ({ search: '', status: '', type: '' });

  return (
    <AdminLayout>
      <PageHeader
        title="Events"
        subtitle={loaded ? `${total} ${q.when === 'all' ? '' : `${q.when} `}event${total === 1 ? '' : 's'}` : ' '}
        actions={
          <>
            <Button variant="ghost" icon={faGear} onClick={() => setShowCarouselSettings(true)}>Carousel</Button>
            {canCreate && <Button variant="primary" icon={faPlus} kbd="N" onClick={() => navigate('/admin/events/new')}>New event</Button>}
          </>
        }
      />

      <Tabs
        tabs={[
          { key: 'upcoming', label: 'Upcoming' },
          { key: 'past', label: 'Past' },
          { key: 'all', label: 'All' },
        ]}
        value={q.when}
        onChange={(when) => setQ({ when })}
      />

      <div className={t.toolbar}>
        <SearchInput value={q.search} onChange={(search) => setQ({ search })} placeholder="Search events" />
        <FilterMenu activeCount={activeFilters.filter((f) => f.key !== 'search').length}>
          <Field label="Status">
            <select value={q.status} onChange={(e) => setQ({ status: e.target.value })}>
              <option value="">Any status</option>
              {Object.entries(STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
            </select>
          </Field>
          <Field label="Type">
            <select value={q.type} onChange={(e) => setQ({ type: e.target.value })}>
              <option value="">Any type</option>
              {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
        </FilterMenu>
        <div className={t.spacer} />
        <DensityToggle value={density} onChange={setDensity} />
      </div>

      <ActiveFilters filters={activeFilters} onClearAll={clearFilters} />

      <Card>
        <LoadingBar active={loading && loaded} />
        <div className={t.scroll}>
          <table className={`${t.table} ${t[`d_${density}`]}`} aria-label="Events">
            <thead>
              <tr>
                <th>Event</th>
                <th className={t.hideSm}>When</th>
                <th className={t.hideMd}>Where</th>
                <th>Status</th>
                <th className={t.num}>Registrations</th>
                <th className={t.actionsCol}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {!loaded && <TableSkeleton rows={6} cols={6} />}
              {events.map((ev) => {
                const start = new Date(ev.startAt);
                const regs = ev._count.registrations;
                const pct = ev.maxAttendees ? Math.min(100, Math.round((regs / ev.maxAttendees) * 100)) : null;
                const img = ev.featuredImage || ev.bannerImage;
                return (
                  <tr key={ev.id}>
                    <td className={t.primaryCell}>
                      <div className={t.primaryWrap}>
                        <span className={styles.dateTile} aria-hidden="true">
                          {img && density !== 'compact' && <img src={resolveMediaUrl(img)} alt="" loading="lazy" />}
                          <span className={styles.dateMonth}>{start.toLocaleDateString(undefined, { month: 'short' })}</span>
                          <span className={styles.dateDay}>{start.getDate()}</span>
                        </span>
                        <div className={t.stack}>
                          {canEdit
                            ? <Link to={`/admin/events/${ev.id}/edit`} className={t.primary}>{ev.title}</Link>
                            : <span className={t.primary}>{ev.title}</span>}
                          <span className={t.secondary}>
                            <span>{TYPE_LABELS[ev.type] ?? ev.type}</span>
                            {ev.isFeatured && <span className={styles.tagFeatured}><FontAwesomeIcon icon={faStar} /> Featured</span>}
                            {(ev.isRecurring || ev.parentEventId) && (
                              <span className={t.chip}><FontAwesomeIcon icon={faRepeat} /> {ev.isRecurring ? 'Recurring' : 'Occurrence'}</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className={t.hideSm}>
                      <div className={t.stack}>
                        <span className={t.nowrap}>{timeRange(ev)}</span>
                        <span className={t.secondary}>{relativeTime(ev.startAt)}</span>
                      </div>
                    </td>
                    <td className={`${t.muted} ${t.hideMd}`}>
                      {ev.type === 'online'
                        ? <><FontAwesomeIcon icon={faVideo} /> Online</>
                        : [ev.venueName, ev.venueCity].filter(Boolean).join(', ')
                          ? <><FontAwesomeIcon icon={faLocationDot} /> {[ev.venueName, ev.venueCity].filter(Boolean).join(', ')}</>
                          : <span className={t.faint}>—</span>}
                    </td>
                    <td><StatusBadge tone={STATUS_META[ev.status]?.tone ?? 'neutral'}>{STATUS_META[ev.status]?.label ?? ev.status}</StatusBadge></td>
                    <td className={t.num}>
                      {canRegs ? (
                        <Link to={`/admin/events/${ev.id}/registrations`} className={styles.regs} title="Manage registrations">
                          <span>{regs}{ev.maxAttendees ? ` / ${ev.maxAttendees}` : ''}</span>
                          {pct !== null && (
                            <span className={styles.capacity} aria-label={`${pct}% full`}>
                              <span style={{ width: `${pct}%` }} className={pct >= 100 ? styles.full : pct >= 80 ? styles.near : undefined} />
                            </span>
                          )}
                        </Link>
                      ) : (
                        <span>{regs}{ev.maxAttendees ? ` / ${ev.maxAttendees}` : ''}</span>
                      )}
                    </td>
                    <td className={t.actionsCol}>
                      <div className={t.rowActions}>
                        {canEdit && (
                          <Link to={`/admin/events/${ev.id}/edit`} className={t.quickAction} title="Edit" aria-label={`Edit ${ev.title}`}>
                            <FontAwesomeIcon icon={faPen} />
                          </Link>
                        )}
                        <RowMenu items={menu(ev)} label={`Actions for ${ev.title}`} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {loaded && events.length === 0 && (
          activeFilters.length > 0 ? (
            <EmptyState icon={faMagnifyingGlass} title="No events match your filters" action={<Button onClick={clearFilters}>Clear filters</Button>} />
          ) : (
            <EmptyState
              icon={faCalendarAlt}
              title={q.when === 'upcoming' ? 'Nothing scheduled' : q.when === 'past' ? 'No past events' : 'No events yet'}
              description={q.when === 'upcoming' ? 'Upcoming events will appear here.' : undefined}
              action={canCreate && q.when !== 'past' && (
                <Button variant="primary" icon={faPlus} onClick={() => navigate('/admin/events/new')}>New event</Button>
              )}
            />
          )
        )}
      </Card>

      {loaded && total > 0 && (
        <Pagination
          page={page}
          pageSize={perPage}
          total={total}
          onPage={(p) => setQ({ page: String(p) })}
          onPageSize={(n) => setQ({ per: String(n) })}
        />
      )}

      {showCarouselSettings && <CarouselSettingsModal onClose={() => setShowCarouselSettings(false)} />}
    </AdminLayout>
  );
}
