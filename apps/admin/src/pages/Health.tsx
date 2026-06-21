import { useEffect, useRef, useState, useCallback } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import { apiClient } from '../services/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCircleCheck, faTriangleExclamation, faCircleXmark,
  faRotate, faServer, faDatabase, faMicrochip, faMemory,
} from '@fortawesome/free-solid-svg-icons';
import styles from './Health.module.css';

interface HealthData {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  environment: string;
  uptime: number;
  timestamp: string;
  responseTime: number;
  services: {
    api:      { status: 'ok' | 'error'; latency: number };
    database: { status: 'ok' | 'error'; latency: number; version: string | null };
  };
  memory: { heapUsed: number; heapTotal: number; rss: number; external: number };
  system: {
    loadAvg: number[];
    totalMem: number;
    freeMem: number;
    platform: string;
    arch: string;
    nodeVersion: string;
    cpus: number;
    hostname: string;
  };
}

const HISTORY = 20;

function fmt(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${sec % 60}s`;
}

function Sparkline({ data, color = 'var(--accent)', height = 48 }: { data: number[]; color?: string; height?: number }) {
  if (data.length < 2) {
    return <div className={styles.sparklinePlaceholder} style={{ height }} />;
  }
  const max = Math.max(...data, 1);
  const W = 220;
  const pad = 4;
  const points = data
    .map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (W - pad * 2);
      const y = pad + ((max - v) / max) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const last = data[data.length - 1];
  const lastX = W - pad;
  const lastY = pad + ((max - last) / max) * (height - pad * 2);

  return (
    <svg width={W} height={height} className={styles.sparklineSvg} aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="3" fill={color} />
    </svg>
  );
}

function MemBar({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = Math.min(100, (used / total) * 100);
  const color = pct > 85 ? 'var(--danger)' : pct > 65 ? 'var(--warning)' : 'var(--accent)';
  return (
    <div className={styles.memRow}>
      <div className={styles.memLabel}>
        <span>{label}</span>
        <span className={styles.memVal}>{fmt(used)} / {fmt(total)}</span>
      </div>
      <div className={styles.memTrack}>
        <div className={styles.memFill} style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: 'ok' | 'error' | 'degraded' | 'down' }) {
  if (status === 'ok')       return <FontAwesomeIcon icon={faCircleCheck}      className={styles.iconOk} />;
  if (status === 'degraded') return <FontAwesomeIcon icon={faTriangleExclamation} className={styles.iconWarn} />;
  return <FontAwesomeIcon icon={faCircleXmark} className={styles.iconError} />;
}

export default function HealthPage() {
  const [data, setData]       = useState<HealthData | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const rtHistory  = useRef<number[]>([]);
  const dbHistory  = useRef<number[]>([]);
  const [charts, setCharts] = useState<{ rt: number[]; db: number[] }>({ rt: [], db: [] });

  const fetch = useCallback(async () => {
    try {
      const res = await apiClient.get('/health');
      const d: HealthData = res.data.data;
      setData(d);
      setError(null);
      setLastFetch(new Date());
      rtHistory.current = [...rtHistory.current, d.responseTime].slice(-HISTORY);
      dbHistory.current = [...dbHistory.current, d.services.database.latency].slice(-HISTORY);
      setCharts({ rt: [...rtHistory.current], db: [...dbHistory.current] });
    } catch {
      setError('Unable to reach the health endpoint.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, 15_000);
    return () => clearInterval(id);
  }, [fetch]);

  const overallColor =
    !data || data.status === 'down'     ? 'var(--danger)'  :
    data.status === 'degraded'          ? 'var(--warning)' :
                                          'var(--success)';

  return (
    <AdminLayout>
      <div className={styles.page}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>System Health</h1>
            {lastFetch && (
              <p className={styles.subtitle}>
                Last updated {lastFetch.toLocaleTimeString()} · auto-refreshes every 15 s
              </p>
            )}
          </div>
          <button className={styles.refreshBtn} onClick={fetch} disabled={loading} title="Refresh now">
            <FontAwesomeIcon icon={faRotate} spin={loading} /> Refresh
          </button>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        {/* Summary cards */}
        <div className={styles.cards}>
          <div className={styles.card}>
            <p className={styles.cardLabel}>Status</p>
            <p className={styles.cardValue} style={{ color: overallColor }}>
              <StatusIcon status={data?.status ?? 'ok'} />
              {' '}{data ? data.status.charAt(0).toUpperCase() + data.status.slice(1) : '—'}
            </p>
          </div>
          <div className={styles.card}>
            <p className={styles.cardLabel}>Uptime</p>
            <p className={styles.cardValue}>{data ? fmtUptime(data.uptime) : '—'}</p>
          </div>
          <div className={styles.card}>
            <p className={styles.cardLabel}>Version</p>
            <p className={styles.cardValue}>{data?.version ?? '—'}</p>
          </div>
          <div className={styles.card}>
            <p className={styles.cardLabel}>Environment</p>
            <p className={styles.cardValue}>{data?.environment ?? '—'}</p>
          </div>
        </div>

        <div className={styles.grid}>
          {/* Services */}
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>
              <FontAwesomeIcon icon={faServer} /> Services
            </h2>
            <div className={styles.serviceList}>
              {data && Object.entries(data.services).map(([name, svc]) => (
                <div key={name} className={styles.serviceRow}>
                  <StatusIcon status={svc.status} />
                  <span className={styles.serviceName}>
                    {name.charAt(0).toUpperCase() + name.slice(1)}
                  </span>
                  <span className={styles.serviceDetail}>
                    {svc.status === 'ok' ? `${svc.latency} ms` : 'Unavailable'}
                  </span>
                  {name === 'database' && (data.services.database.version) && (
                    <span className={styles.serviceVersion}>{data.services.database.version}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Response time sparklines */}
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>
              <FontAwesomeIcon icon={faMicrochip} /> Response Times
            </h2>
            <div className={styles.chartRow}>
              <div className={styles.chartBlock}>
                <p className={styles.chartLabel}>
                  API &nbsp;<span className={styles.chartCurrent}>{data ? `${data.responseTime} ms` : '—'}</span>
                </p>
                <Sparkline data={charts.rt} color="var(--accent)" />
              </div>
              <div className={styles.chartBlock}>
                <p className={styles.chartLabel}>
                  DB &nbsp;<span className={styles.chartCurrent}>{data ? `${data.services.database.latency} ms` : '—'}</span>
                </p>
                <Sparkline data={charts.db} color="var(--success)" />
              </div>
            </div>
            <p className={styles.chartHint}>Last {HISTORY} readings, polled every 15 s</p>
          </div>

          {/* Memory */}
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>
              <FontAwesomeIcon icon={faMemory} /> Memory
            </h2>
            {data ? (
              <div className={styles.memBars}>
                <MemBar used={data.memory.heapUsed}  total={data.memory.heapTotal} label="Heap" />
                <MemBar used={data.memory.rss}        total={data.system.totalMem}  label="RSS" />
                <MemBar used={data.system.totalMem - data.system.freeMem} total={data.system.totalMem} label="System" />
              </div>
            ) : <p className={styles.empty}>—</p>}
          </div>

          {/* System info */}
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>
              <FontAwesomeIcon icon={faDatabase} /> System
            </h2>
            {data ? (
              <table className={styles.infoTable}>
                <tbody>
                  <tr><td>Hostname</td>   <td>{data.system.hostname}</td></tr>
                  <tr><td>Platform</td>   <td>{data.system.platform} / {data.system.arch}</td></tr>
                  <tr><td>Node.js</td>    <td>{data.system.nodeVersion}</td></tr>
                  <tr><td>CPUs</td>       <td>{data.system.cpus} cores</td></tr>
                  <tr><td>Load (1/5/15)</td>
                      <td>{data.system.loadAvg.join(' · ')}</td></tr>
                  <tr><td>Total Memory</td><td>{fmt(data.system.totalMem)}</td></tr>
                  <tr><td>Free Memory</td> <td>{fmt(data.system.freeMem)}</td></tr>
                </tbody>
              </table>
            ) : <p className={styles.empty}>—</p>}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
