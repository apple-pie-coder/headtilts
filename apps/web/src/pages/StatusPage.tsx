import { useEffect, useRef, useState } from 'react';
import './StatusPage.css';

const HEALTH_URL = '/health';

interface HealthData {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  uptime: number;
  timestamp: string;
  services: {
    api:      { status: 'ok' | 'error'; latency: number };
    database: { status: 'ok' | 'error'; latency: number };
  };
}

function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtAgo(secs: number): string {
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}

export default function StatusPage() {
  const [data, setData]   = useState<HealthData | null>(null);
  const [err, setErr]     = useState(false);
  const [age, setAge]     = useState(0);
  const lastFetch         = useRef<number>(0);

  async function check() {
    try {
      const res = await fetch(HEALTH_URL);
      const json = await res.json();
      setData(json);
      setErr(false);
      lastFetch.current = Date.now();
      setAge(0);
    } catch {
      setErr(true);
    }
  }

  useEffect(() => {
    check();
    const poll = setInterval(check, 30_000);
    const tick = setInterval(() => {
      if (lastFetch.current) setAge(Math.floor((Date.now() - lastFetch.current) / 1000));
    }, 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, []);

  const status = err ? 'down' : (data?.status ?? null);
  const statusLabel =
    status === 'ok'       ? 'All Systems Operational'  :
    status === 'degraded' ? 'Partial Outage'            :
    status === 'down'     ? 'Major Outage'              :
                            'Checking…';
  const statusClass =
    status === 'ok' ? 'sp-ok' : status === 'degraded' ? 'sp-warn' : status === 'down' ? 'sp-err' : 'sp-unknown';

  return (
    <div className="sp-root">
      <nav className="sp-nav">
        <a href="/" className="sp-nav-brand">Headtilts</a>
        <a href="/" className="sp-nav-back">← Back to site</a>
      </nav>

      <div className="sp-page">
      <div className="sp-container">
        <h1 className="sp-title">System Status</h1>

        <div className={`sp-banner ${statusClass}`}>
          <span className="sp-banner-dot" />
          <span className="sp-banner-label">{statusLabel}</span>
        </div>

        {data && (
          <>
            <div className="sp-services">
              {Object.entries(data.services).map(([name, svc]) => (
                <div key={name} className="sp-service">
                  <div className="sp-service-info">
                    <span className={`sp-dot ${svc.status === 'ok' ? 'sp-dot-ok' : 'sp-dot-err'}`} />
                    <span className="sp-service-name">
                      {name === 'api' ? 'API' : name.charAt(0).toUpperCase() + name.slice(1)}
                    </span>
                  </div>
                  <div className="sp-service-right">
                    <span className={`sp-badge ${svc.status === 'ok' ? 'sp-badge-ok' : 'sp-badge-err'}`}>
                      {svc.status === 'ok' ? 'Operational' : 'Disrupted'}
                    </span>
                    <span className="sp-latency">{svc.latency} ms</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="sp-meta">
              <span>Version {data.version}</span>
              <span className="sp-sep">·</span>
              <span>Uptime {fmtUptime(data.uptime)}</span>
              <span className="sp-sep">·</span>
              <span>Checked {fmtAgo(age)}</span>
            </div>
          </>
        )}

        {err && !data && (
          <p className="sp-error">Unable to reach the server. Please try again later.</p>
        )}
      </div>
      </div>
    </div>
  );
}
