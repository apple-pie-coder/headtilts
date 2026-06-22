import { Link } from 'react-router-dom';
import { useSiteSettings } from '../context/SiteSettingsContext';

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  const { show_breadcrumbs } = useSiteSettings();
  if (show_breadcrumbs === 'no' || crumbs.length === 0) return null;

  return (
    <nav className="site-breadcrumb" aria-label="Breadcrumb">
      {crumbs.map((crumb, i) => (
        <span key={i} className="site-breadcrumb__item">
          {i > 0 && <span className="site-breadcrumb__sep" aria-hidden>›</span>}
          {crumb.href
            ? <Link to={crumb.href} className="site-breadcrumb__link">{crumb.label}</Link>
            : <span className="site-breadcrumb__current">{crumb.label}</span>}
        </span>
      ))}
    </nav>
  );
}
