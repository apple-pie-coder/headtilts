import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFilter, faRotateRight, faTrash, faChevronDown, faChevronRight,
  faDownload, faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmDialog';
import { useAuth } from '../hooks/useAuth';
import { PERMISSIONS } from '@headtilts/shared';
import { fetchLogs, purgeLogs, ActivityLog, LogFilters } from '../services/logs';
import styles from './Logs.module.css';

const CATEGORIES = [
  'auth', 'post', 'page', 'user', 'media', 'poll', 'comment', 'category',
  'tag', 'role', 'setting', 'backup', 'redirect', 'menu', 'widget', 'sitemap',
  'api_key', 'api_analytics', 'celebration', 'contact', 'notification', 'misc',
];
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const STATUS_RANGES = [
  { label: 'All', min: undefined, max: undefined },
  { label: '2xx Success', min: 200, max: 299 },
  { label: '3xx Redirect', min: 300, max: 399 },
  { label: '4xx Client error', min: 400, max: 499 },
  { label: '5xx Server error', min: 500, max: 599 },
];

const LEVEL_CLASS: Record<string, string> = {
  info:  styles.levelInfo,
  warn:  styles.levelWarn,
  error: styles.levelError,
};

const SITE_CLASS: Record<string, string> = {
  admin:  styles.siteAdmin,
  public: styles.sitePublic,
};

const LIMIT = 50;

function fmtDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtDate(ts: string): { date: string; time: string } {
  const d = new Date(ts);
  return {
    date: d.toLocaleDateString(),
    time: d.toLocaleTimeString(),
  };
}

interface FilterState {
  search: string;
  site: string;
  level: string;
  category: string;
  action: string;
  method: string;
  actorEmail: string;
  ip: string;
  from: string;
  to: string;
  statusRange: string; // index into STATUS_RANGES
}

const DEFAULT_FILTERS: FilterState = {
  search: '', site: '', level: '', category: '', action: '',
  method: '', actorEmail: '', ip: '', from: '', to: '', statusRange: '0',
};

export default function LogsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { hasPermission } = useAuth();
  const canDelete = hasPermission(PERMISSIONS.LOG_DELETE);

  const [logs,    setLogs]    = useState<ActivityLog[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [pending, setPending] = useState<FilterState>(DEFAULT_FILTERS);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeDate, setPurgeDate] = useState('');

  useEffect(() => { load(1, filters); }, [filters]);

  async function load(p: number, f: FilterState) {
    setLoading(true);
    setPage(p);
    const sr = STATUS_RANGES[parseInt(f.statusRange)];
    const params: LogFilters = {
      page: p, limit: LIMIT,
      search: f.search || undefined,
      site: f.site || undefined,
      level: f.level || undefined,
      category: f.category || undefined,
      action: f.action || undefined,
      method: f.method || undefined,
      actorEmail: f.actorEmail || undefined,
      ip: f.ip || undefined,
      from: f.from || undefined,
      to: f.to ? f.to + 'T23:59:59' : undefined,
      statusMin: sr?.min,
      statusMax: sr?.max,
    };
    try {
      const data = await fetchLogs(params);
      setLogs(data.items);
      setTotal(data.pagination.total);
    } catch {
      toast.error('Failed to load logs');
    } finally {
      setLoading(false);
    }
  }

  function applyFilters() {
    setFilters({ ...pending });
  }

  function resetFilters() {
    setPending(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
  }

  function setPendingField(key: keyof FilterState, value: string) {
    setPending((p) => ({ ...p, [key]: value }));
  }

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handlePurge() {
    const label = purgeDate
      ? `Delete all logs before ${purgeDate}?`
      : 'Delete ALL activity logs? This cannot be undone.';
    const ok = await confirm({ title: 'Purge logs', message: label, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      const { deleted } = await purgeLogs(purgeDate || undefined);
      toast.success(`Deleted ${deleted} log${deleted !== 1 ? 's' : ''}`);
      setPurgeOpen(false);
      setPurgeDate('');
      load(1, filters);
    } catch {
      toast.error('Failed to purge logs');
    }
  }

  function exportCSV() {
    const header = ['id','timestamp','site','level','category','action','actorEmail','targetType','targetTitle','method','path','statusCode','duration','ip'];
    const rows = logs.map((l) => header.map((k) => {
      const v = (l as any)[k];
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    }).join(','));
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `activity-logs-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const pages = Math.max(1, Math.ceil(total / LIMIT));
  const activeFilterCount = Object.entries(filters).filter(([k, v]) => k !== 'statusRange' ? !!v : v !== '0').length;

  return (
    <AdminLayout>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Activity Logs</h1>
          <p className={styles.subtitle}>{total.toLocaleString()} event{total !== 1 ? 's' : ''}</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.iconBtn} onClick={exportCSV} title="Export current page as CSV">
            <FontAwesomeIcon icon={faDownload} /> Export CSV
          </button>
          {canDelete && (
            <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => setPurgeOpen(true)}>
              <FontAwesomeIcon icon={faTrash} /> Purge
            </button>
          )}
        </div>
      </div>

      {/* Filter panel */}
      <div className={styles.filterPanel}>
        <button
          className={styles.filterToggle}
          onClick={() => setFiltersOpen((o) => !o)}
        >
          <FontAwesomeIcon icon={faFilter} />
          Filters
          {activeFilterCount > 0 && <span className={styles.filterCount}>{activeFilterCount}</span>}
          <FontAwesomeIcon icon={filtersOpen ? faChevronDown : faChevronRight} className={styles.chevron} />
        </button>

        {filtersOpen && (
          <div className={styles.filterGrid}>

            {/* Row 1 — Search (wide) + Date range */}
            <div className={styles.filterFieldWide}>
              <label>Search</label>
              <input
                placeholder="action, path, actor email, IP…"
                value={pending.search}
                onChange={(e) => setPendingField('search', e.target.value)}
              />
            </div>
            <div className={styles.filterField}>
              <label>From date</label>
              <input
                type="date"
                value={pending.from}
                onChange={(e) => setPendingField('from', e.target.value)}
              />
            </div>
            <div className={styles.filterField}>
              <label>To date</label>
              <input
                type="date"
                value={pending.to}
                onChange={(e) => setPendingField('to', e.target.value)}
              />
            </div>

            <hr className={styles.filterDivider} />

            {/* Row 2 — Classification dropdowns */}
            <div className={styles.filterField}>
              <label>Site</label>
              <select value={pending.site} onChange={(e) => setPendingField('site', e.target.value)}>
                <option value="">All sites</option>
                <option value="admin">Admin</option>
                <option value="public">Public</option>
              </select>
            </div>
            <div className={styles.filterField}>
              <label>Level</label>
              <select value={pending.level} onChange={(e) => setPendingField('level', e.target.value)}>
                <option value="">All levels</option>
                <option value="info">Info</option>
                <option value="warn">Warning</option>
                <option value="error">Error</option>
              </select>
            </div>
            <div className={styles.filterField}>
              <label>Category</label>
              <select value={pending.category} onChange={(e) => setPendingField('category', e.target.value)}>
                <option value="">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className={styles.filterField}>
              <label>Action contains</label>
              <input
                placeholder="e.g. post.create"
                value={pending.action}
                onChange={(e) => setPendingField('action', e.target.value)}
              />
            </div>

            <hr className={styles.filterDivider} />

            {/* Row 3 — Request details */}
            <div className={styles.filterField}>
              <label>HTTP Method</label>
              <select value={pending.method} onChange={(e) => setPendingField('method', e.target.value)}>
                <option value="">All methods</option>
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className={styles.filterField}>
              <label>Status code</label>
              <select value={pending.statusRange} onChange={(e) => setPendingField('statusRange', e.target.value)}>
                {STATUS_RANGES.map((s, i) => (
                  <option key={i} value={i}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className={styles.filterField}>
              <label>Actor email</label>
              <input
                placeholder="contains…"
                value={pending.actorEmail}
                onChange={(e) => setPendingField('actorEmail', e.target.value)}
              />
            </div>
            <div className={styles.filterField}>
              <label>IP address</label>
              <input
                placeholder="contains…"
                value={pending.ip}
                onChange={(e) => setPendingField('ip', e.target.value)}
              />
            </div>

            {/* Actions row */}
            <div className={styles.filterActions}>
              <button className={styles.applyBtn} onClick={applyFilters}>Apply filters</button>
              <button className={styles.resetBtn} onClick={resetFilters}>
                <FontAwesomeIcon icon={faXmark} /> Reset
              </button>
            </div>

          </div>
        )}
      </div>

      {/* Refresh bar */}
      <div className={styles.toolbar}>
        <span className={styles.resultCount}>
          {loading ? 'Loading…' : `${total.toLocaleString()} result${total !== 1 ? 's' : ''}`}
        </span>
        <button className={styles.refreshBtn} onClick={() => load(page, filters)} disabled={loading}>
          <FontAwesomeIcon icon={faRotateRight} spin={loading} /> Refresh
        </button>
      </div>

      {/* Table */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.colTime}>Time</th>
              <th className={styles.colLevel}>Level</th>
              <th className={styles.colSite}>Site</th>
              <th className={styles.colCat}>Category</th>
              <th className={styles.colAction}>Action</th>
              <th className={styles.colActor}>Actor</th>
              <th className={styles.colReq}>Request</th>
              <th className={styles.colStatus}>Status</th>
              <th className={styles.colDur}>Duration</th>
              <th className={styles.colIP}>IP</th>
              <th className={styles.colMeta}></th>
            </tr>
          </thead>
          <tbody>
            {loading && logs.length === 0 ? (
              <tr><td colSpan={11} className={styles.empty}>Loading…</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={11} className={styles.empty}>No logs match the current filters.</td></tr>
            ) : logs.map((log) => {
              const { date, time } = fmtDate(log.timestamp);
              const isExpanded = expanded.has(log.id);
              const hasMeta = log.meta && Object.keys(log.meta).length > 0;
              return (
                <>
                  <tr key={log.id} className={`${styles.row} ${isExpanded ? styles.rowExpanded : ''}`}>
                    <td className={styles.colTime}>
                      <span className={styles.timeDate}>{date}</span>
                      <span className={styles.timeTime}>{time}</span>
                    </td>
                    <td className={styles.colLevel}>
                      <span className={`${styles.levelBadge} ${LEVEL_CLASS[log.level] ?? ''}`}>{log.level}</span>
                    </td>
                    <td className={styles.colSite}>
                      <span className={`${styles.siteBadge} ${SITE_CLASS[log.site] ?? ''}`}>{log.site}</span>
                    </td>
                    <td className={styles.colCat}>
                      <span className={styles.catChip}>{log.category}</span>
                    </td>
                    <td className={styles.colAction}>
                      <code className={styles.action}>{log.action}</code>
                      {log.targetTitle && (
                        <span className={styles.targetTitle}>{log.targetTitle}</span>
                      )}
                    </td>
                    <td className={styles.colActor}>
                      {log.actorEmail ? (
                        <span className={styles.actor}>{log.actorEmail}</span>
                      ) : (
                        <span className={styles.anon}>—</span>
                      )}
                    </td>
                    <td className={styles.colReq}>
                      {log.method && (
                        <span className={`${styles.methodBadge} ${styles[`method_${log.method}`]}`}>{log.method}</span>
                      )}
                      {log.path && <code className={styles.path}>{log.path}</code>}
                    </td>
                    <td className={styles.colStatus}>
                      {log.statusCode != null ? (
                        <span className={`${styles.statusCode} ${
                          log.statusCode >= 500 ? styles.status5xx :
                          log.statusCode >= 400 ? styles.status4xx :
                          log.statusCode >= 300 ? styles.status3xx : styles.status2xx
                        }`}>{log.statusCode}</span>
                      ) : '—'}
                    </td>
                    <td className={styles.colDur}>{fmtDuration(log.duration)}</td>
                    <td className={styles.colIP}>
                      <span className={styles.ipText}>{log.ip ?? '—'}</span>
                    </td>
                    <td className={styles.colMeta}>
                      {hasMeta && (
                        <button
                          className={styles.expandBtn}
                          onClick={() => toggleExpand(log.id)}
                          title={isExpanded ? 'Collapse' : 'Expand details'}
                        >
                          <FontAwesomeIcon icon={isExpanded ? faChevronDown : faChevronRight} />
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${log.id}-meta`} className={styles.metaRow}>
                      <td colSpan={11} className={styles.metaCell}>
                        <div className={styles.metaGrid}>
                          {log.userAgent && (
                            <div className={styles.metaItem}>
                              <span className={styles.metaKey}>User Agent</span>
                              <span className={styles.metaVal}>{log.userAgent}</span>
                            </div>
                          )}
                          {log.targetType && (
                            <div className={styles.metaItem}>
                              <span className={styles.metaKey}>Target</span>
                              <span className={styles.metaVal}>{log.targetType} #{log.targetId}</span>
                            </div>
                          )}
                          {log.meta && (
                            <div className={`${styles.metaItem} ${styles.metaFull}`}>
                              <span className={styles.metaKey}>Meta</span>
                              <pre className={styles.metaPre}>{JSON.stringify(log.meta, null, 2)}</pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className={styles.pagination}>
          <button disabled={page <= 1} onClick={() => load(page - 1, filters)}>← Prev</button>
          <span>Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => load(page + 1, filters)}>Next →</button>
        </div>
      )}

      {/* Purge modal */}
      {purgeOpen && (
        <div className={styles.overlay}>
          <div className={styles.purgeModal}>
            <div className={styles.purgeHeader}>
              <h2>Purge Activity Logs</h2>
              <button className={styles.purgeClose} onClick={() => setPurgeOpen(false)}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
            <p className={styles.purgeDesc}>
              Optionally set a cutoff date. Logs <em>before</em> this date will be deleted.
              Leave blank to delete <strong>all</strong> logs.
            </p>
            <label className={styles.purgeLabel}>Delete logs before</label>
            <input
              className={styles.purgeInput}
              type="date"
              value={purgeDate}
              onChange={(e) => setPurgeDate(e.target.value)}
            />
            <div className={styles.purgeActions}>
              <button className={styles.purgeCancel} onClick={() => setPurgeOpen(false)}>Cancel</button>
              <button className={styles.purgeConfirm} onClick={handlePurge}>
                <FontAwesomeIcon icon={faTrash} /> Delete logs
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
