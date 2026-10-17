import { ReactNode, RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faCircleCheck, faTriangleExclamation, faCircleXmark, faCircleMinus, faRotate, faDownload,
  faDatabase, faServer, faHardDrive, faMemory, faMicrochip, faBoxArchive, faClock, faEnvelope,
  faTowerBroadcast, faBug, faArrowRight, faPause, faPlay, faGaugeHigh, faGears,
} from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { Button, PageHeader, absoluteTime, relativeTime } from '../components/ui';
import { apiClient } from '../services/api';
import styles from './Health.module.css';

/* ── API shape ─────────────────────────────────────────────── */

type CheckStatus = 'ok' | 'warn' | 'error' | 'off';

interface Check { id: string; label: string; status: CheckStatus; summary: string; detail?: string; link?: string }

interface Sample {
  t: number; requests: number; errors5xx: number; errors4xx: number; p95: number | null;
  dbLatency: number | null; eventLoopLag: number; heapUsed: number; rss: number; memUsedPct: number; load1: number;
}

interface HealthData {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  environment: string;
  uptime: number;
  startedAt: string;
  timestamp: string;
  responseTime: number;
  checks: Check[];
  database: { version: string | null; connections: number | null; maxConnections: number | null; uptime: number | null; slowQueries: number | null; sizeBytes: number } | null;
  traffic: {
    windowMinutes: number; requests: number; errors5xx: number; errors4xx: number; p50: number; p95: number;
    slowestRoutes: { route: string; count: number; avg: number; p95: number }[];
    recentErrors: { t: string; route: string; status: number; ms: number }[];
  };
  heartbeats: Record<string, number | null>;
  history: Sample[];
  storage: { disk: { total: number; free: number; writable: boolean } | null; uploadsBytes: number; backupsBytes: number; databaseBytes: number | null };
  memory: { heapUsed: number; heapTotal: number; rss: number };
  system: {
    loadAvg: number[]; totalMem: number; freeMem: number; swap: { total: number; used: number } | null; eventLoopLag: number;
    platform: string; arch: string; nodeVersion: string; cpus: number; hostname: string; osUptime: number;
  };
}

/* ── Formatting ────────────────────────────────────────────── */

function bytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} MB`;
  return `${Math.round(n / 1e3)} KB`;
}

function duration(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(Math.round(n * 10) / 10));

const STATUS_META: Record<CheckStatus, { icon: IconDefinition; label: string; cls: string }> = {
  ok: { icon: faCircleCheck, label: 'Healthy', cls: styles.ok },
  warn: { icon: faTriangleExclamation, label: 'Warning', cls: styles.warn },
  error: { icon: faCircleXmark, label: 'Failing', cls: styles.error },
  off: { icon: faCircleMinus, label: 'Off', cls: styles.off },
};

const CHECK_ICON: Record<string, IconDefinition> = {
  database: faDatabase, errors: faBug, disk: faHardDrive, memory: faMemory, cpu: faMicrochip,
  backups: faBoxArchive, scheduler: faClock, email: faEnvelope, realtime: faTowerBroadcast,
};

/* ── Time-series chart (single series, crosshair tooltip) ──── */

interface Slot { t: number; v: number | null; e?: number | null }

const RANGES = [
  { key: '1h', label: '1 hour', minutes: 60 },
  { key: '6h', label: '6 hours', minutes: 360 },
  { key: '24h', label: '24 hours', minutes: 1440 },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];
const SLOTS = 60;

/** Fold minute samples into SLOTS equal time buckets ending now. */
function bucket(history: Sample[], minutes: number, pick: (s: Sample) => number | null, mode: 'avg' | 'sum' | 'max' = 'avg', pickErr?: (s: Sample) => number): Slot[] {
  const size = (minutes * 60_000) / SLOTS;
  const end = Date.now();
  const start = end - minutes * 60_000;
  const slots: { t: number; vals: number[]; err: number; n: number }[] = Array.from({ length: SLOTS }, (_, i) => ({ t: start + i * size, vals: [], err: 0, n: 0 }));
  for (const s of history) {
    const i = Math.floor((s.t - start) / size);
    if (i < 0 || i >= SLOTS) continue;
    const v = pick(s);
    slots[i].n++;
    if (v !== null) slots[i].vals.push(v);
    if (pickErr) slots[i].err += pickErr(s);
  }
  return slots.map((s) => {
    if (!s.n) return { t: s.t, v: null, e: null };
    const v = !s.vals.length ? null
      : mode === 'sum' ? s.vals.reduce((a, b) => a + b, 0)
      : mode === 'max' ? Math.max(...s.vals)
      : s.vals.reduce((a, b) => a + b, 0) / s.vals.length;
    return { t: s.t, v, e: pickErr ? s.err : undefined };
  });
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function useWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function TimeChart({ title, slots, unit, format, kind = 'line', fixedMax, errorLabel }: {
  title: string; slots: Slot[]; unit: string; format: (v: number) => string;
  kind?: 'line' | 'bars'; fixedMax?: number; errorLabel?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 132;
  const pad = { l: 36, r: 10, t: 8, b: 20 };
  const plotW = Math.max(0, width - pad.l - pad.r);
  const plotH = H - pad.t - pad.b;
  const values = slots.map((s) => s.v).filter((v): v is number => v !== null);
  const max = fixedMax ?? niceMax(Math.max(...values, 0) * 1.1);
  const x = (i: number) => pad.l + (slots.length > 1 ? (i / (slots.length - 1)) * plotW : 0);
  const y = (v: number) => pad.t + plotH - (Math.min(v, max) / max) * plotH;
  const latestIdx = slots.reduce((acc, s, i) => (s.v !== null ? i : acc), -1);
  const latest = latestIdx >= 0 ? slots[latestIdx].v : null;
  const hasData = values.length > 0;

  // Line segments break where the API wasn't running (no samples in a slot).
  const segments: string[] = [];
  let cur: string[] = [];
  slots.forEach((s, i) => {
    if (s.v === null) { if (cur.length) segments.push(cur.join(' ')); cur = []; return; }
    cur.push(`${x(i).toFixed(1)},${y(s.v).toFixed(1)}`);
  });
  if (cur.length) segments.push(cur.join(' '));

  const slotW = plotW / slots.length;
  const barW = Math.max(1, Math.min(24, slotW - 2));

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(slots.length - 1, Math.round(rel * (slots.length - 1)))));
  }

  const hv = hover !== null ? slots[hover] : null;
  const tipLeft = hover !== null ? Math.min(Math.max(x(hover), 70), width - 70) : 0;

  return (
    <figure className={styles.chart}>
      <figcaption className={styles.chartHead}>
        <span className={styles.chartTitle}>{title}</span>
        <span className={styles.chartNow}>{latest !== null ? `${format(latest)} ${unit}` : '—'}</span>
      </figcaption>
      {errorLabel && (
        <div className={styles.legend} aria-hidden="true">
          <span><i className={styles.keyBar} /> Requests</span>
          <span><i className={`${styles.keyBar} ${styles.keyError}`} /> {errorLabel}</span>
        </div>
      )}
      <div ref={ref} className={styles.chartBox}>
        {width > 0 && (
          <svg width={width} height={H} role="img" aria-label={`${title}: latest ${latest !== null ? format(latest) : 'no data'} ${unit}`}>
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={pad.l} x2={width - pad.r} y1={y(max * f)} y2={y(max * f)} className={styles.gridLine} />
                <text x={pad.l - 6} y={y(max * f) + 3} className={styles.axis} textAnchor="end">{compact(max * f)}</text>
              </g>
            ))}
            {[0, Math.floor((slots.length - 1) / 2), slots.length - 1].map((i) => (
              <text key={i} x={x(i)} y={H - 4} className={styles.axis} textAnchor={i === 0 ? 'start' : i === slots.length - 1 ? 'end' : 'middle'}>
                {i === slots.length - 1 ? 'now' : clock(slots[i].t)}
              </text>
            ))}
            {kind === 'bars'
              ? slots.map((s, i) => {
                  if (!s.v) return null;
                  const cx = pad.l + i * slotW + slotW / 2;
                  const err = Math.min(s.e ?? 0, s.v);
                  const okH = ((s.v - err) / max) * plotH;
                  const errH = (err / max) * plotH;
                  const base = pad.t + plotH;
                  return (
                    <g key={i} className={hover === i ? styles.barHover : undefined}>
                      {okH > 0 && <rect x={cx - barW / 2} y={base - okH} width={barW} height={okH} rx={Math.min(2, barW / 2)} className={styles.bar} />}
                      {errH > 0 && <rect x={cx - barW / 2} y={base - okH - errH - (okH > 0 ? 1 : 0)} width={barW} height={errH} rx={Math.min(2, barW / 2)} className={styles.barError} />}
                    </g>
                  );
                })
              : (
                <>
                  {segments.map((pts, i) => {
                    const pairs = pts.split(' ');
                    const first = pairs[0].split(',')[0];
                    const last = pairs[pairs.length - 1].split(',')[0];
                    const base = pad.t + plotH;
                    return (
                      <g key={i}>
                        <polygon points={`${first},${base} ${pts} ${last},${base}`} className={styles.area} />
                        <polyline points={pts} className={styles.line} />
                      </g>
                    );
                  })}
                  {latest !== null && <circle cx={x(latestIdx)} cy={y(latest)} r={4} className={styles.endDot} />}
                </>
              )}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + plotH} className={styles.crosshair} />}
            {hover !== null && kind === 'line' && hv?.v != null && <circle cx={x(hover)} cy={y(hv.v)} r={4} className={styles.endDot} />}
            <rect
              x={pad.l} y={pad.t} width={plotW} height={plotH} fill="transparent"
              onPointerMove={onMove} onPointerLeave={() => setHover(null)}
            />
          </svg>
        )}
        {!hasData && <div className={styles.chartEmpty}>Collecting data — the first point appears within a minute.</div>}
        {hv && (
          <div className={styles.tooltip} style={{ left: tipLeft }} role="status">
            <strong>{hv.v !== null ? `${format(hv.v)} ${unit}` : 'No data'}</strong>
            {errorLabel && hv.e ? <span>{hv.e} {errorLabel.toLowerCase()}</span> : null}
            <span>{clock(hv.t)}</span>
          </div>
        )}
      </div>
    </figure>
  );
}

/* ── Small pieces ──────────────────────────────────────────── */

function Meter({ label, used, total, detail }: { label: string; used: number; total: number; detail?: string }) {
  const pct = total ? Math.min(100, (used / total) * 100) : 0;
  const tone = pct >= 90 ? styles.meterDanger : pct >= 75 ? styles.meterWarn : '';
  return (
    <div className={styles.meter}>
      <div className={styles.meterHead}>
        <span>{label}</span>
        <span className={styles.meterVal}><strong>{pct.toFixed(0)}%</strong> · {detail ?? `${bytes(used)} of ${bytes(total)}`}</span>
      </div>
      <div className={styles.meterTrack} role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`${styles.meterFill} ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Panel({ title, icon, action, children, className }: { title: string; icon: IconDefinition; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${styles.panel} ${className ?? ''}`}>
      <header className={styles.panelHead}>
        <h2 className={styles.panelTitle}><FontAwesomeIcon icon={icon} /> {title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
      {hint && <span className={styles.statHint}>{hint}</span>}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────── */

const INTERVALS = [
  { ms: 10_000, label: '10 s' },
  { ms: 30_000, label: '30 s' },
  { ms: 60_000, label: '1 min' },
];
const PREFS_KEY = 'htilts:health:prefs';

function loadPrefs(): { interval: number; range: RangeKey } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    return {
      interval: INTERVALS.some((i) => i.ms === p.interval) ? p.interval : 30_000,
      range: RANGES.some((r) => r.key === p.range) ? p.range : '1h',
    };
  } catch {
    return { interval: 30_000, range: '1h' };
  }
}

export default function HealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [paused, setPaused] = useState(false);
  const [prefs, setPrefs] = useState(loadPrefs);

  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* non-fatal */ }
  }, [prefs]);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    try {
      const res = await apiClient.get('/health', { params: fresh ? { fresh: 1 } : undefined });
      setData(res.data.data);
      setError(null);
      setLastFetch(new Date());
    } catch {
      setError('Can’t reach the API. The server may be down or restarting.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll while the tab is visible; a hidden tab shouldn't keep the Pi busy.
  useEffect(() => {
    load();
    if (paused) return;
    let id: ReturnType<typeof setInterval> | undefined;
    const start = () => { id = setInterval(() => load(), prefs.interval); };
    const onVis = () => {
      clearInterval(id);
      if (!document.hidden) { load(); start(); }
    };
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [load, paused, prefs.interval]);

  const range = RANGES.find((r) => r.key === prefs.range)!;
  const history = data?.history ?? [];
  const charts = useMemo(() => ({
    requests: bucket(history, range.minutes, (s) => s.requests, 'sum', (s) => s.errors5xx),
    p95: bucket(history, range.minutes, (s) => s.p95, 'max'),
    db: bucket(history, range.minutes, (s) => s.dbLatency),
    lag: bucket(history, range.minutes, (s) => s.eventLoopLag, 'max'),
    mem: bucket(history, range.minutes, (s) => s.memUsedPct),
    load: bucket(history, range.minutes, (s) => s.load1),
  }), [history, range.minutes]);
  const historySpan = history.length ? Math.round((Date.now() - history[0].t) / 60_000) : 0;

  const issues = data?.checks.filter((c) => c.status === 'warn' || c.status === 'error') ?? [];
  const failing = issues.filter((c) => c.status === 'error');

  function downloadReport() {
    if (!data) return;
    const { history: _h, ...rest } = data;
    const blob = new Blob([JSON.stringify({ ...rest, historyMinutes: _h.length }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `health-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const t = data?.traffic;
  const errorRate = t && t.requests ? (t.errors5xx / t.requests) * 100 : 0;

  return (
    <AdminLayout>
      <PageHeader
        title="System health"
        subtitle={lastFetch
          ? `Updated ${lastFetch.toLocaleTimeString()}${paused ? ' · auto-refresh paused' : ` · refreshes every ${INTERVALS.find((i) => i.ms === prefs.interval)?.label}`}`
          : 'Checking…'}
        actions={
          <>
            <div className={styles.segmented} role="group" aria-label="Auto-refresh">
              <button type="button" className={paused ? styles.segOn : ''} onClick={() => setPaused((p) => !p)} aria-pressed={paused}
                title={paused ? 'Resume auto-refresh' : 'Pause auto-refresh'}>
                <FontAwesomeIcon icon={paused ? faPlay : faPause} />
              </button>
              {INTERVALS.map((i) => (
                <button key={i.ms} type="button" className={!paused && prefs.interval === i.ms ? styles.segOn : ''}
                  aria-pressed={!paused && prefs.interval === i.ms}
                  onClick={() => { setPaused(false); setPrefs((p) => ({ ...p, interval: i.ms })); }}>{i.label}</button>
              ))}
            </div>
            <Button icon={faDownload} onClick={downloadReport} disabled={!data} title="Download a JSON diagnostics report">Report</Button>
            <Button variant="primary" icon={faRotate} onClick={() => load(true)} disabled={loading} title="Re-run every check now, skipping cached results">
              {loading ? 'Checking…' : 'Run checks'}
            </Button>
          </>
        }
      />

      {error && <div className={styles.errorBanner} role="alert"><FontAwesomeIcon icon={faCircleXmark} /> {error}</div>}

      {/* Overall verdict */}
      {data && (
        <section className={`${styles.hero} ${data.status === 'down' || failing.length ? styles.heroDown : issues.length ? styles.heroWarn : styles.heroOk}`} aria-live="polite">
          <FontAwesomeIcon icon={data.status === 'down' || failing.length ? faCircleXmark : issues.length ? faTriangleExclamation : faCircleCheck} className={styles.heroIcon} />
          <div className={styles.heroText}>
            <h2>
              {data.status === 'down' ? 'The site is down'
                : issues.length === 0 ? 'All systems operational'
                : [
                    failing.length && `${failing.length} failing`,
                    issues.length - failing.length && `${issues.length - failing.length} warning${issues.length - failing.length === 1 ? '' : 's'}`,
                  ].filter(Boolean).join(' · ')}
            </h2>
            <p>
              {issues.length
                ? issues.map((c) => c.label).join(' · ')
                : `API up ${duration(data.uptime)} · ${t?.requests.toLocaleString() ?? 0} requests in the last ${t?.windowMinutes ?? 0} min · p95 ${t?.p95 ?? 0} ms`}
            </p>
          </div>
          <dl className={styles.heroStats}>
            <div><dt>API uptime</dt><dd>{duration(data.uptime)}</dd></div>
            <div><dt>Version</dt><dd>{data.version}</dd></div>
            <div><dt>Environment</dt><dd>{data.environment}</dd></div>
          </dl>
        </section>
      )}

      {/* Checks */}
      <section className={styles.checks} aria-label="Checks">
        {(data?.checks ?? []).map((c) => {
          const meta = STATUS_META[c.status];
          return (
            <article key={c.id} className={`${styles.check} ${meta.cls}`}>
              <div className={styles.checkHead}>
                <span className={styles.checkIcon}><FontAwesomeIcon icon={CHECK_ICON[c.id] ?? faServer} /></span>
                <h3>{c.label}</h3>
                <span className={styles.pill}><FontAwesomeIcon icon={meta.icon} /> {meta.label}</span>
              </div>
              <p className={styles.checkSummary}>{c.summary}</p>
              {c.detail && <p className={styles.checkDetail}>{c.detail}</p>}
              {c.link && (c.status === 'warn' || c.status === 'error' || c.status === 'off') && (
                <Link to={c.link} className={styles.checkLink}>{c.status === 'off' ? 'Set up' : 'Investigate'} <FontAwesomeIcon icon={faArrowRight} /></Link>
              )}
            </article>
          );
        })}
        {!data && !error && Array.from({ length: 6 }, (_, i) => <div key={i} className={`${styles.check} ${styles.checkSkeleton}`} aria-hidden="true" />)}
      </section>

      {/* Trends */}
      <div className={styles.toolbar}>
        <h2 className={styles.sectionTitle}>Trends</h2>
        <div className={styles.segmented} role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r.key} type="button" className={prefs.range === r.key ? styles.segOn : ''} aria-pressed={prefs.range === r.key}
              onClick={() => setPrefs((p) => ({ ...p, range: r.key }))}>{r.label}</button>
          ))}
        </div>
        {data && historySpan < range.minutes && (
          <span className={styles.toolbarHint}>
            {historySpan ? `${duration(historySpan * 60)} of history` : 'No history yet'} — kept in memory since the API started {relativeTime(data.startedAt)}
          </span>
        )}
      </div>
      <div className={`${styles.charts} ${loading && data ? styles.refetching : ''}`}>
        <TimeChart title="Requests" slots={charts.requests} unit="req" kind="bars" format={(v) => Math.round(v).toLocaleString()} errorLabel="Server errors" />
        <TimeChart title="Response time (p95)" slots={charts.p95} unit="ms" format={(v) => Math.round(v).toLocaleString()} />
        <TimeChart title="Database latency" slots={charts.db} unit="ms" format={(v) => v.toFixed(1)} />
        <TimeChart title="Event loop delay (p99)" slots={charts.lag} unit="ms" format={(v) => v.toFixed(1)} />
        <TimeChart title="System memory used" slots={charts.mem} unit="%" fixedMax={100} format={(v) => v.toFixed(0)} />
        <TimeChart title="CPU load (1 min)" slots={charts.load} unit="" format={(v) => v.toFixed(2)} />
      </div>

      <div className={styles.grid}>
        {/* Traffic */}
        <Panel title="Traffic" icon={faGaugeHigh} className={styles.wide}
          action={<span className={styles.panelHint}>Last {t?.windowMinutes ?? 0} min, excluding health checks</span>}>
          <div className={styles.stats}>
            <Stat label="Requests" value={t ? t.requests.toLocaleString() : '—'} />
            <Stat label="Server errors" value={t ? `${errorRate.toFixed(1)}%` : '—'} hint={t ? `${t.errors5xx} × 5xx · ${t.errors4xx} × 4xx` : undefined} />
            <Stat label="Median" value={t ? `${t.p50} ms` : '—'} />
            <Stat label="p95" value={t ? `${t.p95} ms` : '—'} />
          </div>
          <div className={styles.tables}>
            <div>
              <h3 className={styles.subTitle}>Slowest endpoints</h3>
              {t && t.slowestRoutes.length ? (
                <table className={styles.table}>
                  <thead><tr><th>Endpoint</th><th className={styles.num}>Calls</th><th className={styles.num}>Avg</th><th className={styles.num}>p95</th></tr></thead>
                  <tbody>
                    {t.slowestRoutes.map((r) => (
                      <tr key={r.route}>
                        <td><code className={styles.route}>{r.route}</code></td>
                        <td className={styles.num}>{r.count}</td>
                        <td className={styles.num}>{r.avg} ms</td>
                        <td className={styles.num}><strong>{r.p95} ms</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className={styles.empty}>No requests recorded yet.</p>}
            </div>
            <div>
              <h3 className={styles.subTitle}>Recent server errors</h3>
              {t && t.recentErrors.length ? (
                <table className={styles.table}>
                  <thead><tr><th>When</th><th>Endpoint</th><th className={styles.num}>Status</th></tr></thead>
                  <tbody>
                    {t.recentErrors.map((e, i) => (
                      <tr key={i}>
                        <td title={absoluteTime(e.t)}>{relativeTime(e.t)}</td>
                        <td><code className={styles.route}>{e.route}</code></td>
                        <td className={styles.num}><span className={styles.statusCode}>{e.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className={styles.empty}><FontAwesomeIcon icon={faCircleCheck} className={styles.okIcon} /> No server errors in this window.</p>}
            </div>
          </div>
        </Panel>

        {/* Resources */}
        <Panel title="Resources" icon={faMemory}>
          {data ? (
            <div className={styles.meters}>
              <Meter label="System memory" used={data.system.totalMem - data.system.freeMem} total={data.system.totalMem} />
              {data.system.swap && <Meter label="Swap" used={data.system.swap.used} total={data.system.swap.total} />}
              {data.storage.disk && <Meter label="Disk" used={data.storage.disk.total - data.storage.disk.free} total={data.storage.disk.total} />}
              <Meter label="API heap" used={data.memory.heapUsed} total={data.memory.heapTotal} />
              <dl className={styles.kv}>
                <div><dt>Database</dt><dd>{data.storage.databaseBytes !== null ? bytes(data.storage.databaseBytes) : '—'}</dd></div>
                <div><dt>Uploads</dt><dd>{bytes(data.storage.uploadsBytes)}</dd></div>
                <div><dt>Backups</dt><dd>{bytes(data.storage.backupsBytes)}</dd></div>
                <div><dt>API process (RSS)</dt><dd>{bytes(data.memory.rss)}</dd></div>
              </dl>
            </div>
          ) : <p className={styles.empty}>—</p>}
        </Panel>

        {/* Database & jobs */}
        <Panel title="Database & jobs" icon={faGears}>
          {data ? (
            <dl className={styles.kv}>
              <div><dt>MySQL</dt><dd>{data.database?.version ?? '—'}</dd></div>
              <div><dt>Connections</dt><dd>{data.database ? `${data.database.connections ?? '?'} / ${data.database.maxConnections ?? '?'}` : '—'}</dd></div>
              <div><dt>Slow queries</dt><dd>{data.database?.slowQueries?.toLocaleString() ?? '—'}</dd></div>
              <div><dt>MySQL uptime</dt><dd>{data.database?.uptime != null ? duration(data.database.uptime) : '—'}</dd></div>
              <div><dt>Post publisher</dt><dd>{data.heartbeats.publisher ? `ran ${relativeTime(new Date(data.heartbeats.publisher).toISOString())}` : 'not yet'}</dd></div>
              <div><dt>Backup scheduler</dt><dd>{data.heartbeats.backupScheduler ? `ran ${relativeTime(new Date(data.heartbeats.backupScheduler).toISOString())}` : 'not yet'}</dd></div>
            </dl>
          ) : <p className={styles.empty}>—</p>}
        </Panel>

        {/* Host */}
        <Panel title="Host" icon={faServer}>
          {data ? (
            <dl className={styles.kv}>
              <div><dt>Container</dt><dd>{data.system.hostname}</dd></div>
              <div><dt>Platform</dt><dd>{data.system.platform} / {data.system.arch}</dd></div>
              <div><dt>CPUs</dt><dd>{data.system.cpus} cores</dd></div>
              <div><dt>Load (1/5/15)</dt><dd>{data.system.loadAvg.join(' · ')}</dd></div>
              <div><dt>Node.js</dt><dd>{data.system.nodeVersion}</dd></div>
              <div><dt>Host uptime</dt><dd>{duration(data.system.osUptime)}</dd></div>
              <div><dt>API started</dt><dd title={absoluteTime(data.startedAt)}>{relativeTime(data.startedAt)}</dd></div>
            </dl>
          ) : <p className={styles.empty}>—</p>}
        </Panel>
      </div>
    </AdminLayout>
  );
}
