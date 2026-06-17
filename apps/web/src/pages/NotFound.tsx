import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { applySeo, resetSeo, applyRobotsPolicy } from '../utils/seo';

export function NotFoundPage() {
  const { site_title, search_engine_visibility } = useSiteSettings();

  useEffect(() => {
    applySeo({ title: `Page Not Found — ${site_title}`, ogType: 'website' });
    applyRobotsPolicy(false); // never index a 404
    return () => {
      resetSeo(site_title);
      applyRobotsPolicy(search_engine_visibility !== 'no'); // restore the site-wide policy
    };
  }, [site_title, search_engine_visibility]);

  return (
    <div className="error-page">
      <h1>404</h1>
      <p>This page doesn't exist.</p>
      <Link to="/" className="back-link"><FontAwesomeIcon icon={faArrowLeft} /> Back to home</Link>
    </div>
  );
}
