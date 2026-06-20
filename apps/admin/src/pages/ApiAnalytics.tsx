import { useEffect, useState, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChartLine, faDownload, faRotate, faCircleCheck, faCircleXmark,
  faClock, faKey,
} from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { useToast } from '../components/ToastContext';
import {
  fetchOverview, fetchCallsOverTime, fetchCallsPerKey,
  fetchTopEndpoints, fetchPeakHours,
  exportCsvUrl,
  OverviewStats, CallsOverTimePoint, CallsPerKey, TopEndpoint, PeakHour,
  Granularity,
} from '../services/apiAnalytics';
import styles from './ApiAnalytics.module.css';

// ─── Mini SVG chart helpers ───────────────────────────────────────────────────

function LineChart({ data, yKey, color = 'var(--accent)' }: {
  data: Record<string, number | string>[];
  xKey?: string;
  yKey: string;
  color?: string;
}) {
  if (data.length === 0) return <div className={styles.chartEmpty}>No data</div>;
  const vals = data.map((d) => Number(d[yKey]));
  const max = Math.max(...vals, 1);
  const W = 400; const H = 100; const pad = 8;
  const pts = data.map((d, i) => {
    const x = pad + (i / (data.length - 1 || 1)) * (W - pad * 2);
    const y = H - pad - (Number(d[yKey]) / max) * (H - pad * 2);
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.svgChart} aria-hidden>
      <polyline fill="none" stroke={color} strokeWidth="2" points={pts.join(' ')} />
      {data.map((d, i) => {
        const x = pad + (i / (data.length - 1 || 1)) * (W - pad * 2);
        const y = H - pad - (Number(d[yKey]) / max) * (H - pad * 2);
        return <circle key={i} cx={x} cy={y} r="3" fill={color} />;
      })}
    </svg>
  );
}

function BarChart({ data, xKey, yKey, color = 'var(--accent)' }: {
  data: Record<string, number | string>[];
  xKey: string;
  yKey: string;
  color?: string;
}) {
  if (data.length === 0) return <div className={styles.chartEmpty}>No data</div>;
  const vals = data.map((d) => Number(d[yKey]));
  const max = Math.max(...vals, 1);
  const W = 400; const H = 100; const pad = 4;
  const barW = Math.max(2, (W - pad * 2) / data.length - 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.svgChart} aria-hidden>
      {data.map((d, i) => {
        const x = pad + i * ((W - pad * 2) / data.length);
        const h = Math.max(1, (Number(d[yKey]) / max) * (H - pad));
        return (
          <rect key={i} x={x} y={H - h} width={barW} height={h} fill={color} rx="1">
            <title>{`${d[xKey]}: ${d[yKey]}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function HourHeatmap({ data }: { data: PeakHour[] }) {
  if (data.length === 0) return <div className={styles.chartEmpty}>No data</div>;
  const max = Math.max(...data.map((d) => d.calls), 1);
  return (
    <div className={styles.heatmap} role="img" aria-label="Hourly call distribution">
      {data.map((d) => {
        const intensity = d.calls / max;
        return (
          <div
            key={d.hour}
            className={styles.heatCell}
            style={{ opacity: 0.15 + intensity * 0.85 }}
            title={`${d.hour}:00 — ${d.calls} calls`}
          >
            <span className={styles.heatLabel}>{d.hour}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, accent }: {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof faKey;
  accent?: boolean;
}) {
  return (
    <div className={`${styles.statCard} ${accent ? styles.statCardAccent : ''}`}>
      <div className={styles.statIcon}><FontAwesomeIcon icon={icon} /></div>
      <div className={styles.statBody}>
        <div className={styles.statValue}>{value}</div>
        <div className={styles.statLabel}>{label}</div>
        {sub && <div className={styles.statSub}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ApiAnalyticsPage() {
  const toast = useToast();

  const [granularity, setGranularity] = useState<Granularity>('day');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [callsOverTime, setCallsOverTime] = useState<CallsOverTimePoint[]>([]);
  const [callsPerKey, setCallsPerKey] = useState<CallsPerKey[]>([]);
  const [topEndpoints, setTopEndpoints] = useState<TopEndpoint[]>([]);
  const [peakHours, setPeakHours] = useState<PeakHour[]>([]);

  const load = useCallback(async (gran: Granularity) => {
    try {
      const [ov, cot, cpk, te, ph] = await Promise.all([
        fetchOverview(),
        fetchCallsOverTime(gran),
        fetchCallsPerKey(),
        fetchTopEndpoints(),
        fetchPeakHours(),
      ]);
      setOverview(ov);
      setCallsOverTime(cot);
      setCallsPerKey(cpk);
      setTopEndpoints(te);
      setPeakHours(ph);
    } catch {
      toast.error('Failed to load analytics data');
    }
  }, [toast]);

  useEffect(() => {
    setLoading(true);
    load(granularity).finally(() => setLoading(false));
  }, [load, granularity]);

  async function handleRefresh() {
    setRefreshing(true);
    await load(granularity);
    setRefreshing(false);
  }

  function handleGranularity(g: Granularity) {
    setGranularity(g);
  }

  function handleExport() {
    const from = granularity === 'day'
      ? new Date(Date.now() - 30 * 24 * 3600_000).toISOString()
      : granularity === 'week'
        ? new Date(Date.now() - 84 * 24 * 3600_000).toISOString()
        : new Date(Date.now() - 365 * 24 * 3600_000).toISOString();
    const url = exportCsvUrl(from);
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.click();
  }

  const maxKeyCallsForBar = Math.max(...callsPerKey.map((k) => k.calls), 1);

  return (
    <AdminLayout>
      <div className={styles.page}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>
              <FontAwesomeIcon icon={faChartLine} className={styles.titleIcon} />
              API Analytics
            </h1>
            <p className={styles.subtitle}>Usage metrics for all API keys</p>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.granularitySwitch}>
              {(['day', 'week', 'month'] as Granularity[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`${styles.granBtn} ${granularity === g ? styles.granBtnActive : ''}`}
                  onClick={() => handleGranularity(g)}
                >
                  {g === 'day' ? '30d' : g === 'week' ? '12w' : '12m'}
                </button>
              ))}
            </div>
            <button type="button" className={styles.iconBtn} onClick={handleRefresh} title="Refresh" disabled={refreshing}>
              <FontAwesomeIcon icon={faRotate} className={refreshing ? styles.spinning : ''} />
            </button>
            <button type="button" className={styles.exportBtn} onClick={handleExport}>
              <FontAwesomeIcon icon={faDownload} /> Export CSV
            </button>
          </div>
        </div>

        {loading ? (
          <div className={styles.loadingState}>Loading analytics…</div>
        ) : (
          <>
            {/* Overview stat cards */}
            <div className={styles.statGrid}>
              <StatCard label="Total API Calls" value={overview?.totalCalls.toLocaleString() ?? '—'} icon={faChartLine} />
              <StatCard label="Last 24 Hours" value={overview?.last24hCalls.toLocaleString() ?? '—'} icon={faClock} />
              <StatCard label="Successful Calls" value={overview?.successCount.toLocaleString() ?? '—'} icon={faCircleCheck} />
              <StatCard
                label="Error Rate"
                value={`${overview?.errorRate ?? 0}%`}
                sub={`${overview?.errorCount.toLocaleString() ?? 0} errors`}
                icon={faCircleXmark}
                accent={(overview?.errorRate ?? 0) > 10}
              />
              <StatCard label="Avg Response" value={`${overview?.avgDurationMs ?? 0}ms`} icon={faClock} />
              <StatCard label="Active API Keys" value={overview?.activeApiKeys ?? '—'} icon={faKey} />
            </div>

            {/* Charts row */}
            <div className={styles.chartsRow}>
              {/* Calls over time */}
              <div className={styles.chartCard}>
                <h2 className={styles.chartTitle}>Calls Over Time</h2>
                {callsOverTime.length > 0 ? (
                  <>
                    <LineChart
                      data={callsOverTime as unknown as Record<string, number | string>[]}
                      xKey="date"
                      yKey="total"
                    />
                    <LineChart
                      data={callsOverTime as unknown as Record<string, number | string>[]}
                      xKey="date"
                      yKey="errors"
                      color="var(--error, #e74c3c)"
                    />
                    <div className={styles.chartLegend}>
                      <span className={styles.legendDot} style={{ background: 'var(--accent)' }} /> Total
                      <span className={styles.legendDot} style={{ background: 'var(--error, #e74c3c)' }} /> Errors
                    </div>
                    <div className={styles.chartDates}>
                      <span>{callsOverTime[0]?.date}</span>
                      <span>{callsOverTime[callsOverTime.length - 1]?.date}</span>
                    </div>
                  </>
                ) : (
                  <div className={styles.chartEmpty}>No data for this period</div>
                )}
              </div>

              {/* Peak hours heatmap */}
              <div className={styles.chartCard}>
                <h2 className={styles.chartTitle}>Peak Hours (last 30d)</h2>
                <HourHeatmap data={peakHours} />
                <div className={styles.chartLegend}>
                  <span className={styles.legendNote}>Hour of day (UTC) · darker = more calls</span>
                </div>
              </div>
            </div>

            {/* Second charts row */}
            <div className={styles.chartsRow}>
              {/* Top API keys */}
              <div className={styles.chartCard}>
                <h2 className={styles.chartTitle}>Top API Keys by Usage</h2>
                {callsPerKey.length === 0 ? (
                  <div className={styles.chartEmpty}>No API key usage logged</div>
                ) : (
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Key</th>
                        <th className={styles.numCol}>Calls</th>
                        <th className={styles.numCol}>Avg ms</th>
                        <th className={styles.barCol} />
                      </tr>
                    </thead>
                    <tbody>
                      {callsPerKey.map((k) => (
                        <tr key={k.apiKeyId}>
                          <td>
                            <span className={styles.keyName}>{k.name}</span>
                            <span className={styles.keyPrefix}>{k.prefix}…</span>
                          </td>
                          <td className={styles.numCol}>{k.calls.toLocaleString()}</td>
                          <td className={styles.numCol}>{k.avgDurationMs}</td>
                          <td className={styles.barCol}>
                            <div className={styles.inlineBar}>
                              <div
                                className={styles.inlineBarFill}
                                style={{ width: `${(k.calls / maxKeyCallsForBar) * 100}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Top endpoints */}
              <div className={styles.chartCard}>
                <h2 className={styles.chartTitle}>Top Endpoints</h2>
                {topEndpoints.length === 0 ? (
                  <div className={styles.chartEmpty}>No endpoint data yet</div>
                ) : (
                  <>
                    <BarChart
                      data={topEndpoints.map((e, i) => ({ label: `${i + 1}`, calls: e.calls }))}
                      xKey="label"
                      yKey="calls"
                    />
                    <table className={styles.table} style={{ marginTop: '0.75rem' }}>
                      <thead>
                        <tr>
                          <th>Method</th>
                          <th>Endpoint</th>
                          <th className={styles.numCol}>Calls</th>
                          <th className={styles.numCol}>Avg ms</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topEndpoints.map((e, i) => (
                          <tr key={i}>
                            <td><span className={`${styles.methodBadge} ${styles[`method${e.method}`]}`}>{e.method}</span></td>
                            <td className={styles.endpointCell}>{e.endpoint}</td>
                            <td className={styles.numCol}>{e.calls.toLocaleString()}</td>
                            <td className={styles.numCol}>{e.avgDurationMs}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
