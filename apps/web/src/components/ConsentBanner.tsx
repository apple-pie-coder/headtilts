import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { needsConsent, onAnalyticsChange, setConsent, usesConsentBanner } from '../utils/analytics';

/**
 * Asks before Google Analytics is loaded. Shown only when analytics is set up
 * with the banner on and the reader hasn't answered; the footer's "Cookie
 * settings" link brings it back. While open on a phone it publishes its height
 * as --consent-h so the back-to-top button can sit above it.
 */
export function ConsentBanner() {
  const { privacy_policy_page_slug } = useSiteSettings();
  const [open, setOpen] = useState(needsConsent);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => onAnalyticsChange((e) => {
    const reopen = (e as CustomEvent).detail === 'reopen';
    setOpen(reopen ? usesConsentBanner() : needsConsent());
  }), []);

  useEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!open || !el) { root.style.removeProperty('--consent-h'); return; }
    const ro = new ResizeObserver(() => root.style.setProperty('--consent-h', `${el.offsetHeight + 12}px`));
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty('--consent-h'); };
  }, [open]);

  if (!open) return null;

  function answer(value: 'granted' | 'denied') {
    setConsent(value);
    setOpen(false);
  }

  return (
    <div ref={ref} className="consent" role="region" aria-label="Cookie consent">
      <p className="consent-text">
        <strong>Cookies for counting readers.</strong>{' '}
        We use Google Analytics to see which stories people read, so we know what to cover next. No ads, and nothing is sold.
        {privacy_policy_page_slug && <> <Link to={`/pages/${privacy_policy_page_slug}`}>Privacy policy</Link></>}
      </p>
      <div className="consent-actions">
        <button type="button" className="consent-btn consent-btn--no" onClick={() => answer('denied')}>No thanks</button>
        <button type="button" className="consent-btn consent-btn--yes" onClick={() => answer('granted')}>Accept</button>
      </div>
    </div>
  );
}
