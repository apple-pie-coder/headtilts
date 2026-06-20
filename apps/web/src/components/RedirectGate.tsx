import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { get } from '../services/api';

interface RedirectResult {
  redirect: { toPath: string; type: number } | null;
}

// Paths that should never be checked for DB redirects (internal SPA routes).
const SKIP_PREFIXES = ['/preview/', '/search'];

export function RedirectGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const checkedPaths = useRef(new Set<string>());

  useEffect(() => {
    const path = location.pathname;

    // Don't re-check a path we already handled, and skip internal routes.
    if (checkedPaths.current.has(path)) return;
    if (SKIP_PREFIXES.some((p) => path.startsWith(p))) return;

    checkedPaths.current.add(path);

    get<RedirectResult>('/public/redirects/resolve', { from: path })
      .then((result) => {
        const r = result.redirect;
        if (!r) return;
        const isExternal = /^https?:\/\//i.test(r.toPath);
        if (isExternal) {
          window.location.replace(r.toPath);
        } else if (r.type === 301) {
          navigate(r.toPath, { replace: true });
        } else {
          navigate(r.toPath);
        }
      })
      .catch(() => { /* non-fatal — just let the page render normally */ });
  }, [location.pathname, navigate]);

  return <>{children}</>;
}
