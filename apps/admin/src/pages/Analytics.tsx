import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChartPie, faRotate, faDownload, faFileLines, faImages, faUsers, faComments,
  faChartLine, faKey, faLayerGroup, faTags, faArrowTrendUp, faArrowTrendDown,
  faBolt, faCircleCheck, faCircleXmark, faLayerGroup as faOverview,
  faSquarePollVertical,
} from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/ToastContext';
import { fetchDashboardStats } from '../services/dashboard';
import {
  fetchOverview, fetchCallsOverTime, fetchCallsPerKey, fetchTopEndpoints,
  OverviewStats, CallsOverTimePoint, CallsPerKey, TopEndpoint, Granularity,
} from '../services/apiAnalytics';
import { fetchPollAnalytics, PollAnalyticsData, PollBreakdownItem } from '../services/polls';
import { PERMISSIONS } from '@headtilts/shared';
import { DashboardStats } from '../types';
import styles from './Analytics.module.css';

// ─── Sub-components ───────────────────────────────────────────────────────────

type Trend = 'up' | 'down' | 'flat';

function StatCard({ label, value, sub, icon, accent, to, trend, trendVal }: {
  label: string; value: string | number; sub?: string; icon: typeof faBolt;
  accent?: boolean; to?: string; trend?: Trend; trendVal?: string;
}) {
  const inner = (
    <div className={`${styles.statCard} ${accent ? styles.statCardAccent : ''} ${to ? styles.statCardLink : ''}`}>
      <div className={styles.statCardIcon}><FontAwesomeIcon icon={icon} /></div>
      <div className={styles.statCardBody}>
        <div className={styles.statCardValue}>{value}</div>
        <div className={styles.statCardLabel}>{label}</div>
        {(sub || (trend && trend !== 'flat' && trendVal)) && (
          <div className={styles.statCardMeta}>
            {sub && <span className={styles.statCardSub}>{sub}</span>}
            {trend && trend !== 'flat' && trendVal && (
              <span className={`${styles.trendBadge} ${trend === 'up' ? styles.trendUp : styles.trendDown}`}>
                <FontAwesomeIcon icon={trend === 'up' ? faArrowTrendUp : faArrowTrendDown} />
                {trendVal}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
  return to ? <Link to={to} style={{ textDecoration: 'none' }}>{inner}</Link> : inner;
}

function DonutChart({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total === 0) return <div className={styles.empty}>No post data yet</div>;

  // Stroke-based ring — cleaner than filled path slices
  const R = 48; const CX = 64; const CY = 64;
  const C = 2 * Math.PI * R;   // full circumference
  const SW = 13;                // stroke width (ring thickness)
  const GAP = 9;                // arc-length gap between segments (> SW/2 so rounded caps don't overlap)

  let cum = 0;
  const segs = slices
    .filter((s) => s.value > 0)
    .map((sl, i) => {
      const arcLen = (sl.value / total) * C;
      const visLen = Math.max(0, arcLen - GAP);
      const seg = { ...sl, i, pct: Math.round((sl.value / total) * 100), visLen, offset: cum };
      cum += arcLen;
      return seg;
    });

  const active = hovered !== null ? segs.find((s) => s.i === hovered) ?? null : null;

  return (
    <div className={styles.donutWrap}>
      {/* Ring + centered overlay */}
      <div className={styles.donutOuter}>
        <svg viewBox="0 0 128 128" className={styles.donutSvg} aria-hidden>
          {/* Background track */}
          <circle cx={CX} cy={CY} r={R} fill="none"
            stroke="var(--surface3)" strokeWidth={SW} />
          {/* Coloured segments */}
          {segs.map((s) => (
            <circle key={s.i}
              cx={CX} cy={CY} r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={hovered === s.i ? SW + 5 : SW}
              strokeDasharray={`${s.visLen} ${C}`}
              strokeDashoffset={-s.offset}
              strokeLinecap="round"
              opacity={hovered === null || hovered === s.i ? 1 : 0.22}
              style={{
                transform: `rotate(-90deg)`,
                transformOrigin: `${CX}px ${CY}px`,
                transition: 'stroke-width 0.18s ease, opacity 0.15s ease',
                cursor: 'pointer',
                filter: hovered === s.i ? `drop-shadow(0 0 5px ${s.color}88)` : 'none',
              }}
              onMouseEnter={() => setHovered(s.i)}
              onMouseLeave={() => setHovered(null)}
            >
              <title>{s.label}: {s.value} ({s.pct}%)</title>
            </circle>
          ))}
        </svg>
        {/* Center text — plain HTML so we can use proper fonts */}
        <div className={styles.donutCenter}>
          <span className={styles.donutCenterNum}>
            {active ? active.value : total}
          </span>
          <span className={styles.donutCenterLabel}>
            {active ? active.label : 'total'}
          </span>
        </div>
      </div>

      {/* Legend */}
      <ul className={styles.legend}>
        {segs.map((s) => (
          <li key={s.i}
            className={`${styles.legendRow} ${hovered === s.i ? styles.legendRowActive : ''}`}
            onMouseEnter={() => setHovered(s.i)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className={styles.legendDot} style={{ background: s.color }} />
            <span className={styles.legendLabel}>{s.label}</span>
            <span className={styles.legendCount}>{s.value}</span>
            <span className={styles.legendPct}>{s.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BarList({ items, max }: {
  items: { label: string; value: number; sub?: string; color?: string }[];
  max: number;
}) {
  return (
    <ul className={styles.barList}>
      {items.map((item, i) => (
        <li key={i} className={styles.barRow}>
          <div className={styles.barMeta}>
            <span className={styles.barLabel}>{item.label}</span>
            {item.sub && <span className={styles.barSub}>{item.sub}</span>}
          </div>
          <div className={styles.barTrack}>
            <div className={styles.barFill}
              style={{ width: `${max > 0 ? (item.value / max) * 100 : 0}%`, background: item.color ?? 'var(--accent)' }} />
          </div>
          <span className={styles.barVal}>{item.value.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}

function TimelineChart({ data, gran }: { data: CallsOverTimePoint[]; gran: Granularity }) {
  const [tip, setTip] = useState<{ x: number; y: number; d: CallsOverTimePoint } | null>(null);
  if (data.length === 0) return <div className={styles.empty}>No API call data for this period</div>;
  const maxVal = Math.max(...data.map((d) => d.total), 1);
  const W = 600; const H = 130; const px = 8; const py = 10;
  const pts = data.map((d, i) => ({
    x: px + (i / (data.length - 1 || 1)) * (W - px * 2),
    y: H - py - (d.total / maxVal) * (H - py * 2), d,
  }));
  const ePts = data.map((d, i) => ({
    x: px + (i / (data.length - 1 || 1)) * (W - px * 2),
    y: H - py - (d.errors / maxVal) * (H - py * 2),
  }));
  const range = gran === 'day' ? 'Last 30 days' : gran === 'week' ? 'Last 12 weeks' : 'Last 12 months';
  return (
    <div className={styles.chartWrap}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chartSvg} onMouseLeave={() => setTip(null)}>
        <defs>
          <linearGradient id="tlg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon fill="url(#tlg)"
          points={`${px},${H} ${pts.map((p) => `${p.x},${p.y}`).join(' ')} ${W - px},${H}`} />
        <polyline fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round"
          points={pts.map((p) => `${p.x},${p.y}`).join(' ')} />
        <polyline fill="none" stroke="var(--error,#ef4444)" strokeWidth="1.5" strokeLinejoin="round"
          strokeDasharray="5 3" points={ePts.map((p) => `${p.x},${p.y}`).join(' ')} />
        {pts.map((p, i) => (
          <rect key={i} x={p.x - W / data.length / 2} y={0} width={W / data.length} height={H}
            fill="transparent" onMouseEnter={() => setTip({ x: p.x, y: p.y, d: p.d })} />
        ))}
        {tip && <>
          <line x1={tip.x} y1={py} x2={tip.x} y2={H - py} stroke="var(--border)" strokeWidth="1" />
          <circle cx={tip.x} cy={tip.y} r="4.5" fill="var(--accent)" />
        </>}
      </svg>
      {tip && (
        <div className={styles.tooltip} style={{ left: `${(tip.x / W) * 100}%` }}>
          <strong>{tip.d.date}</strong>
          <span>{tip.d.total.toLocaleString()} calls</span>
          {tip.d.errors > 0 && <span className={styles.tooltipErr}>{tip.d.errors} errors</span>}
        </div>
      )}
      <div className={styles.xAxis}>
        <span>{data[0]?.date}</span>
        {data.length > 2 && <span>{data[Math.floor(data.length / 2)]?.date}</span>}
        <span>{data[data.length - 1]?.date}</span>
      </div>
      <div className={styles.chartLegend}>
        <span><i className={styles.ldot} style={{ background: 'var(--accent)' }} />Total calls</span>
        <span><i className={styles.ldot} style={{ background: 'var(--error,#ef4444)' }} />Errors</span>
        <span className={styles.legendRange}>{range}</span>
      </div>
    </div>
  );
}

function PollVotesChart({ data }: { data: { date: string; votes: number }[] }) {
  const [tip, setTip] = useState<{ x: number; y: number; d: { date: string; votes: number } } | null>(null);
  if (data.length === 0) return <div className={styles.empty}>No vote activity in the last 30 days</div>;
  const maxVal = Math.max(...data.map((d) => d.votes), 1);
  const W = 600; const H = 100; const px = 8; const py = 10;
  const pts = data.map((d, i) => ({
    x: px + (i / (data.length - 1 || 1)) * (W - px * 2),
    y: H - py - (d.votes / maxVal) * (H - py * 2),
    d,
  }));
  return (
    <div className={styles.chartWrap}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chartSvg} onMouseLeave={() => setTip(null)}>
        <defs>
          <linearGradient id="pvg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon fill="url(#pvg)"
          points={`${px},${H} ${pts.map((p) => `${p.x},${p.y}`).join(' ')} ${W - px},${H}`} />
        <polyline fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinejoin="round"
          points={pts.map((p) => `${p.x},${p.y}`).join(' ')} />
        {pts.map((p, i) => (
          <rect key={i} x={p.x - W / data.length / 2} y={0} width={W / data.length} height={H}
            fill="transparent" onMouseEnter={() => setTip({ x: p.x, y: p.y, d: p.d })} />
        ))}
        {tip && <>
          <line x1={tip.x} y1={py} x2={tip.x} y2={H - py} stroke="var(--border)" strokeWidth="1" />
          <circle cx={tip.x} cy={tip.y} r="4.5" fill="#f59e0b" />
        </>}
      </svg>
      {tip && (
        <div className={styles.tooltip} style={{ left: `${(tip.x / W) * 100}%` }}>
          <strong>{tip.d.date}</strong>
          <span>{tip.d.votes} vote{tip.d.votes !== 1 ? 's' : ''}</span>
        </div>
      )}
      <div className={styles.xAxis}>
        <span>{data[0]?.date}</span>
        {data.length > 2 && <span>{data[Math.floor(data.length / 2)]?.date}</span>}
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  open: 'var(--pollOpen, #22c55e)',
  closed: 'var(--pollClosed, #94a3b8)',
  draft: 'var(--accent)',
  scheduled: '#f59e0b',
};

function PollResultsList({ polls }: { polls: PollBreakdownItem[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className={styles.pollResultsList}>
      {polls.map((poll) => {
        const isOpen = expanded.has(poll.id);
        const winner = poll.options.length > 0
          ? poll.options.reduce((a, b) => (b.votes > a.votes ? b : a), poll.options[0])
          : null;
        return (
          <div key={poll.id} className={styles.pollResultItem}>
            <div className={styles.pollResultHeader} onClick={() => toggle(poll.id)}>
              <span className={`${styles.pollStatusDot} ${styles[`pollDot_${poll.status}`]}`} />
              <Link to={`/admin/polls/${poll.id}/edit`} className={styles.pollResultTitle}
                onClick={(e) => e.stopPropagation()}>
                {poll.title}
              </Link>
              <span className={`${styles.pollChip} ${styles[`pollChip_${poll.status}`]}`}>{poll.status}</span>
              <span className={styles.pollResultVotes}>{poll.totalVotes.toLocaleString()} votes</span>
              {!isOpen && winner && poll.totalVotes > 0 && (
                <span className={styles.pollWinner}>↑ {winner.text} ({winner.percentage}%)</span>
              )}
              <button type="button" className={styles.pollExpandBtn} aria-expanded={isOpen}>
                {isOpen ? '▲' : '▼'}
              </button>
            </div>
            {isOpen && (
              <div className={styles.pollOptions}>
                {poll.totalVotes === 0
                  ? <span className={styles.pollNoVotes}>No votes yet</span>
                  : poll.options.map((opt) => (
                    <div key={opt.id} className={styles.pollOption}>
                      <span className={styles.pollOptionText}>{opt.text}</span>
                      <div className={styles.barTrack}>
                        <div className={styles.barFill}
                          style={{ width: `${opt.percentage}%`, background: STATUS_COLORS[poll.status] ?? '#f59e0b' }} />
                      </div>
                      <span className={styles.pollOptionPct}>{opt.percentage}%</span>
                      <span className={styles.pollOptionVotes}>{opt.votes}</span>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RecentList({ items }: { items: { avatar?: string | null; title: string; meta: string; color?: string; initial?: string }[] }) {
  if (items.length === 0) return <div className={styles.empty}>Nothing to show yet</div>;
  return (
    <ul className={styles.recentList}>
      {items.map((it, i) => (
        <li key={i} className={styles.recentRow}>
          <div className={styles.recentAvatar} style={it.color ? { background: it.color } : undefined}>
            {it.avatar ? <img src={it.avatar} alt="" /> : (it.initial ?? '?')}
          </div>
          <div className={styles.recentInfo}>
            <span className={styles.recentTitle}>{it.title}</span>
            <span className={styles.recentMeta}>{it.meta}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'content' | 'api' | 'polls';

const TABS: { id: Tab; label: string; icon: typeof faBolt }[] = [
  { id: 'overview', label: 'Overview',  icon: faOverview           },
  { id: 'content',  label: 'Content',   icon: faFileLines          },
  { id: 'api',      label: 'API',       icon: faBolt               },
  { id: 'polls',    label: 'Polls',     icon: faSquarePollVertical },
];

export default function AnalyticsPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const canViewApi = hasPermission(PERMISSIONS.API_ANALYTICS_VIEW);

  const [tab, setTab] = useState<Tab>('overview');
  const [gran, setGran] = useState<Granularity>('day');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [apiOver, setApiOver] = useState<OverviewStats | null>(null);
  const [apiCalls, setApiCalls] = useState<CallsOverTimePoint[]>([]);
  const [apiKeys, setApiKeys] = useState<CallsPerKey[]>([]);
  const [topEps, setTopEps] = useState<TopEndpoint[]>([]);
  const [pollAnalytics, setPollAnalytics] = useState<PollAnalyticsData | null>(null);
  const [pollsLoading, setPollsLoading] = useState(false);

  const arRef = useRef(autoRefresh);
  arRef.current = autoRefresh;

  const load = useCallback(async (g: Granularity) => {
    try {
      const [s, ov, cot, cpk, te] = await Promise.all([
        fetchDashboardStats(),
        canViewApi ? fetchOverview()         : Promise.resolve(null),
        canViewApi ? fetchCallsOverTime(g)   : Promise.resolve([]),
        canViewApi ? fetchCallsPerKey()      : Promise.resolve([]),
        canViewApi ? fetchTopEndpoints()     : Promise.resolve([]),
      ]);
      setStats(s);
      if (canViewApi) {
        setApiOver(ov as OverviewStats);
        setApiCalls(cot as CallsOverTimePoint[]);
        setApiKeys(cpk as CallsPerKey[]);
        setTopEps(te as TopEndpoint[]);
      }
      setLastRefreshed(new Date());
    } catch {
      toast.error('Failed to load analytics');
    }
  }, [canViewApi, toast]);

  useEffect(() => {
    setLoading(true);
    load(gran).finally(() => setLoading(false));
  }, [load, gran]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => { if (arRef.current) load(gran); }, 30_000);
    return () => clearInterval(id);
  }, [autoRefresh, gran, load]);

  useEffect(() => {
    if (tab !== 'polls' || pollAnalytics !== null || pollsLoading) return;
    setPollsLoading(true);
    fetchPollAnalytics()
      .then(setPollAnalytics)
      .catch(() => toast.error('Failed to load poll analytics'))
      .finally(() => setPollsLoading(false));
  }, [tab, pollAnalytics, pollsLoading, toast]);

  async function handleRefresh() {
    setRefreshing(true);
    await load(gran);
    setRefreshing(false);
  }

  function handleExport() {
    const rows = ['Category,Metric,Value'];
    if (stats) {
      [
        ['Content', 'Published Posts', stats.posts.published],
        ['Content', 'Draft Posts', stats.posts.draft],
        ['Content', 'Scheduled Posts', stats.posts.scheduled],
        ['Content', 'Pages', stats.pages.count],
        ['Content', 'Media Files', stats.media.count],
        ['Content', 'Categories', stats.categories.count],
        ['Content', 'Tags', stats.tags.count],
        ['Content', 'Users', stats.users.count],
        ['Content', 'Pending Comments', stats.comments.pending],
      ].forEach(([c, m, v]) => rows.push(`${c},${m},${v}`));
    }
    if (canViewApi && apiOver) {
      [
        ['API', 'Total Calls', apiOver.totalCalls],
        ['API', 'Last 24h', apiOver.last24hCalls],
        ['API', 'Error Rate', `${apiOver.errorRate}%`],
        ['API', 'Avg Response', `${apiOver.avgDurationMs}ms`],
        ['API', 'Active Keys', apiOver.activeApiKeys],
      ].forEach(([c, m, v]) => rows.push(`${c},${m},${v}`));
    }
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' })),
      download: `analytics-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
  }

  // ─── Tab content ─────────────────────────────────────────────────────────

  function renderOverview() {
    return (
      <div className={styles.tabContent}>
        {/* Hero stat row */}
        <div className={styles.heroRow}>
          <StatCard label="Published Posts" value={stats?.posts.published ?? '—'}
            icon={faFileLines} to="/admin/posts?status=published" />
          <StatCard label="Total Users" value={stats?.users.count ?? '—'}
            sub={stats?.users.active ? `${stats.users.active} active` : undefined}
            icon={faUsers} to="/admin/users" />
          <StatCard label="Media Files" value={stats?.media.count ?? '—'}
            sub={stats?.media.totalSize ? `${(stats.media.totalSize / 1_048_576).toFixed(1)} MB` : undefined}
            icon={faImages} to="/admin/media" />
          <StatCard label="Pending Comments" value={stats?.comments.pending ?? '—'}
            icon={faComments} accent={(stats?.comments.pending ?? 0) > 0}
            to="/admin/comments?status=pending" />
        </div>

        {/* Main split */}
        <div className={styles.overviewBody}>
          {/* Left: stat tiles + donut */}
          <div className={styles.overviewLeft}>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Content Breakdown</h2>
              <div className={styles.miniGrid}>
                <StatCard label="Drafts"      value={stats?.posts.draft ?? '—'}      icon={faFileLines} to="/admin/posts?status=draft" />
                <StatCard label="Scheduled"   value={stats?.posts.scheduled ?? '—'}  icon={faFileLines} to="/admin/posts?status=scheduled" />
                <StatCard label="Pages"       value={stats?.pages.count ?? '—'}      icon={faFileLines} to="/admin/pages" />
                <StatCard label="Categories"  value={stats?.categories.count ?? '—'} icon={faLayerGroup} to="/admin/categories" />
                <StatCard label="Tags"        value={stats?.tags.count ?? '—'}       icon={faTags}       to="/admin/tags" />
                <StatCard label="Active Users" value={stats?.users.active ?? '—'}    icon={faCircleCheck} />
              </div>
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Post Status</h2>
              <DonutChart slices={[
                { label: 'Published', value: stats?.posts.published ?? 0, color: '#22c55e' },
                { label: 'Draft',     value: stats?.posts.draft ?? 0,     color: 'var(--accent)' },
                { label: 'Scheduled', value: stats?.posts.scheduled ?? 0, color: '#f59e0b' },
                { label: 'Trash',     value: stats?.posts.trash ?? 0,     color: '#94a3b8' },
              ]} />
            </section>
          </div>

          {/* Right: recent lists */}
          <div className={styles.overviewRight}>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Recent Posts</h2>
              <ul className={styles.recentList}>
                {(stats?.recentPosts ?? []).slice(0, 6).map((p) => (
                  <li key={p.id} className={styles.recentRow}>
                    <span className={`${styles.statusPip} ${
                      p.status === 'published' ? styles.pipPublished :
                      p.status === 'scheduled' ? styles.pipScheduled : styles.pipDraft
                    }`} />
                    <div className={styles.recentInfo}>
                      <Link to={`/admin/posts/${p.id}/edit`} className={styles.recentTitle}>
                        {p.title || '(untitled)'}
                      </Link>
                      <span className={styles.recentMeta}>
                        {p.status} · {new Date(p.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </li>
                ))}
                {(stats?.recentPosts ?? []).length === 0 && <li className={styles.empty}>No posts yet</li>}
              </ul>
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Recent Users</h2>
              <RecentList items={(stats?.recentUsers ?? []).slice(0, 5).map((u) => ({
                avatar: u.avatar,
                initial: (u.firstName?.[0] ?? u.username[0]).toUpperCase(),
                title: u.firstName ? `${u.firstName} ${u.lastName ?? ''}`.trim() : u.username,
                meta: u.email,
              }))} />
            </section>
          </div>
        </div>
      </div>
    );
  }

  function renderContent() {
    return (
      <div className={styles.tabContent}>
        <div className={styles.contentBody}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>All Content Metrics</h2>
            <div className={styles.fullGrid}>
              <StatCard label="Published"  value={stats?.posts.published ?? '—'} icon={faFileLines} to="/admin/posts?status=published" />
              <StatCard label="Drafts"     value={stats?.posts.draft ?? '—'}     icon={faFileLines} to="/admin/posts?status=draft" />
              <StatCard label="Scheduled"  value={stats?.posts.scheduled ?? '—'} icon={faFileLines} to="/admin/posts?status=scheduled" />
              <StatCard label="Trash"      value={stats?.posts.trash ?? '—'}     icon={faFileLines} />
              <StatCard label="Pages"      value={stats?.pages.count ?? '—'}     icon={faFileLines} to="/admin/pages" />
              <StatCard label="Media"      value={stats?.media.count ?? '—'}
                sub={stats?.media.totalSize ? `${(stats.media.totalSize / 1_048_576).toFixed(1)} MB` : undefined}
                icon={faImages} to="/admin/media" />
              <StatCard label="Categories" value={stats?.categories.count ?? '—'} icon={faLayerGroup} to="/admin/categories" />
              <StatCard label="Tags"       value={stats?.tags.count ?? '—'}       icon={faTags}      to="/admin/tags" />
              <StatCard label="Total Users"  value={stats?.users.count ?? '—'}  icon={faUsers}       to="/admin/users" />
              <StatCard label="Active Users" value={stats?.users.active ?? '—'} icon={faCircleCheck} />
              <StatCard label="Pending Comments" value={stats?.comments.pending ?? '—'}
                icon={faComments} accent={(stats?.comments.pending ?? 0) > 0}
                to="/admin/comments?status=pending" />
            </div>
          </section>

          <div className={styles.contentLower}>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Post Status</h2>
              <DonutChart slices={[
                { label: 'Published', value: stats?.posts.published ?? 0, color: '#22c55e' },
                { label: 'Draft',     value: stats?.posts.draft ?? 0,     color: 'var(--accent)' },
                { label: 'Scheduled', value: stats?.posts.scheduled ?? 0, color: '#f59e0b' },
                { label: 'Trash',     value: stats?.posts.trash ?? 0,     color: '#94a3b8' },
              ]} />
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Recent Comments</h2>
              <RecentList items={(stats?.comments.recent ?? []).slice(0, 5).map((c) => ({
                initial: c.authorName[0]?.toUpperCase(),
                color: 'color-mix(in srgb, #f59e0b 15%, var(--surface2))',
                title: c.authorName,
                meta: c.content.length > 70 ? c.content.slice(0, 70) + '…' : c.content,
              }))} />
            </section>
          </div>
        </div>
      </div>
    );
  }

  function renderApi() {
    if (!canViewApi) {
      return (
        <div className={styles.tabContent}>
          <div className={styles.permWall}>
            <FontAwesomeIcon icon={faKey} className={styles.permIcon} />
            <p>You need the <strong>API Analytics</strong> permission to view this section.</p>
          </div>
        </div>
      );
    }
    const keyMax = Math.max(...apiKeys.map((k) => k.calls), 1);
    const epMax  = Math.max(...topEps.map((e) => e.calls), 1);
    return (
      <div className={styles.tabContent}>
        {/* API stat row */}
        <div className={styles.apiRow}>
          <StatCard label="Total Calls"  value={apiOver?.totalCalls.toLocaleString() ?? '—'} icon={faBolt} sub="all time" />
          <StatCard label="Last 24 h"    value={apiOver?.last24hCalls.toLocaleString() ?? '—'} icon={faChartLine} />
          <StatCard label="Successful"   value={apiOver?.successCount.toLocaleString() ?? '—'} icon={faCircleCheck} />
          <StatCard label="Error Rate"   value={`${apiOver?.errorRate ?? 0}%`}
            accent={(apiOver?.errorRate ?? 0) > 5} icon={faCircleXmark}
            sub={`${apiOver?.errorCount ?? 0} errors`} />
          <StatCard label="Avg Response" value={`${apiOver?.avgDurationMs ?? 0} ms`} icon={faBolt} />
          <StatCard label="Active Keys"  value={apiOver?.activeApiKeys ?? '—'} icon={faKey} to="/admin/api-keys" />
        </div>

        {/* Timeline */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>API Calls Over Time</h2>
          <TimelineChart data={apiCalls} gran={gran} />
        </section>

        {/* Bottom row */}
        <div className={styles.apiBottom}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Top API Keys</h2>
            {apiKeys.length === 0
              ? <div className={styles.empty}>No key usage logged yet</div>
              : <BarList items={apiKeys.map((k) => ({
                  label: k.name, value: k.calls,
                  sub: `${k.prefix}… · avg ${k.avgDurationMs} ms`,
                }))} max={keyMax} />}
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Top Endpoints</h2>
            {topEps.length === 0
              ? <div className={styles.empty}>No endpoint data yet</div>
              : <BarList items={topEps.slice(0, 8).map((e) => ({
                  label: e.endpoint, value: e.calls,
                  sub: `${e.method} · avg ${e.avgDurationMs} ms`,
                  color: e.method === 'GET' ? '#22c55e' : e.method === 'POST' ? '#f59e0b' : e.method === 'DELETE' ? '#ef4444' : 'var(--accent)',
                }))} max={epMax} />}
          </section>
        </div>
      </div>
    );
  }

  function renderPolls() {
    if (pollsLoading) {
      return (
        <div className={styles.tabContent}>
          <div className={styles.loadingState}>
            <FontAwesomeIcon icon={faRotate} className={styles.spin} /> Loading poll analytics…
          </div>
        </div>
      );
    }
    const ov = pollAnalytics?.overview;
    const breakdown = pollAnalytics?.pollBreakdown ?? [];
    const votes = pollAnalytics?.votesOverTime ?? [];
    return (
      <div className={styles.tabContent}>
        {/* Hero stat row */}
        <div className={styles.pollsHeroRow}>
          <StatCard label="Total Polls"  value={ov?.total ?? '—'}      icon={faSquarePollVertical} to="/admin/polls" />
          <StatCard label="Open Polls"   value={ov?.open ?? '—'}       icon={faCircleCheck} />
          <StatCard label="Total Votes"  value={ov?.totalVotes.toLocaleString() ?? '—'} icon={faChartLine} />
          <StatCard label="Most Voted"   value={ov?.mostVotedCount ?? '—'}
            sub={ov?.mostVotedTitle ?? undefined} icon={faArrowTrendUp} />
        </div>

        {/* Middle row */}
        <div className={styles.pollsBody}>
          <div className={styles.pollsLeft}>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Poll Status</h2>
              <DonutChart slices={[
                { label: 'Open',      value: ov?.open      ?? 0, color: '#22c55e' },
                { label: 'Scheduled', value: ov?.scheduled ?? 0, color: '#f59e0b' },
                { label: 'Draft',     value: ov?.draft     ?? 0, color: 'var(--accent)' },
                { label: 'Closed',    value: ov?.closed    ?? 0, color: '#94a3b8' },
              ]} />
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Votes — Last 30 Days</h2>
              <PollVotesChart data={votes} />
            </section>
          </div>

          <div className={styles.pollsRight}>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Poll Results</h2>
              {breakdown.length === 0
                ? <div className={styles.empty}>No polls yet</div>
                : <PollResultsList polls={breakdown} />
              }
            </section>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const visibleTabs = TABS.filter((t) => t.id !== 'api' || canViewApi);

  return (
    <AdminLayout>
      <div className={styles.page}>

        {/* Page header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>
              <FontAwesomeIcon icon={faChartPie} className={styles.pageTitleIcon} />
              Analytics
            </h1>
            <p className={styles.pageSubtitle}>
              Site-wide metrics and performance overview
              {lastRefreshed && <span> · Updated {lastRefreshed.toLocaleTimeString()}</span>}
            </p>
          </div>
          <div className={styles.pageActions}>
            <div className={styles.granSwitch}>
              {(['day', 'week', 'month'] as Granularity[]).map((g) => (
                <button key={g} type="button"
                  className={`${styles.granBtn} ${gran === g ? styles.granBtnActive : ''}`}
                  onClick={() => setGran(g)}>
                  {g === 'day' ? '30d' : g === 'week' ? '12w' : '12m'}
                </button>
              ))}
            </div>
            <button type="button"
              className={`${styles.iconBtn} ${autoRefresh ? styles.iconBtnOn : ''}`}
              title={autoRefresh ? 'Auto-refresh on — click to stop' : 'Enable auto-refresh (30s)'}
              onClick={() => setAutoRefresh((v) => !v)}>
              <FontAwesomeIcon icon={faRotate} className={autoRefresh ? styles.spin : ''} />
            </button>
            <button type="button" className={styles.iconBtn} onClick={handleRefresh}
              disabled={refreshing} title="Refresh now">
              <FontAwesomeIcon icon={faRotate} className={refreshing ? styles.spin : ''} />
            </button>
            <button type="button" className={styles.exportBtn} onClick={handleExport}>
              <FontAwesomeIcon icon={faDownload} /> Export CSV
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className={styles.tabBar}>
          {visibleTabs.map((t) => (
            <button key={t.id} type="button"
              className={`${styles.tabBtn} ${tab === t.id ? styles.tabBtnActive : ''}`}
              onClick={() => setTab(t.id)}>
              <FontAwesomeIcon icon={t.icon} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className={styles.loadingState}>
            <FontAwesomeIcon icon={faRotate} className={styles.spin} />
            Loading analytics…
          </div>
        ) : (
          <>
            {tab === 'overview' && renderOverview()}
            {tab === 'content'  && renderContent()}
            {tab === 'api'      && renderApi()}
            {tab === 'polls'    && renderPolls()}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
