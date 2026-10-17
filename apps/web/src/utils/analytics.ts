/**
 * Google Analytics 4 for the public site, set up from Settings → Analytics.
 *
 * - With the consent banner on (the default), Google's tag is only loaded once
 *   the reader accepts; until then nothing is sent and no cookies are set.
 * - Browsers sending Global Privacy Control are never tracked or asked.
 * - Staff who are signed in to the admin (it leaves an `ht-staff` flag on this
 *   origin) can be left out, as are draft and front-page-editor previews.
 * - The site changes pages without reloading, and a page's title only arrives
 *   with its content, so page views are sent by hand once the page has applied
 *   its SEO (or after a short wait for pages that never do).
 */

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window { dataLayer?: unknown[]; gtag?: Gtag }
}

export type Consent = 'granted' | 'denied';
interface Config { id: string; banner: boolean; excludeStaff: boolean }

const CONSENT_KEY = 'analytics-consent';
const STAFF_KEY = 'ht-staff';
const CHANGE_EVENT = 'analytics:change';

let config: Config | null = null;
let loaded = false;
let lastPath = '';
let lastUrl = '';
let timer = 0;

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function privacySignal(): boolean {
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

function excludedPage(): boolean {
  if (window.location.pathname.startsWith('/preview/')) return true;
  if (new URLSearchParams(window.location.search).has('fp-preview')) return true;
  return window.top !== window.self;
}

/** Whether the site uses analytics at all for this visitor (so a banner or settings link makes sense). */
export function analyticsAvailable(): boolean {
  return !!config && !privacySignal() && !excludedPage() && !(config.excludeStaff && read(STAFF_KEY) === '1');
}

export function getConsent(): Consent | null {
  const v = read(CONSENT_KEY);
  return v === 'granted' || v === 'denied' ? v : null;
}

/** The reader should be asked: analytics is on, the banner is on, and they haven't answered yet. */
export function needsConsent(): boolean {
  return analyticsAvailable() && config!.banner && getConsent() === null;
}

export function usesConsentBanner(): boolean {
  return analyticsAvailable() && config!.banner;
}

function active(): boolean {
  return analyticsAvailable() && (!config!.banner || getConsent() === 'granted');
}

function load() {
  if (loaded || !config || !active()) return;
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  // gtag.js expects the real `arguments` object, not an array.
  // eslint-disable-next-line prefer-rest-params
  window.gtag = function gtag() { window.dataLayer!.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', config.id, { send_page_view: false });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.id)}`;
  document.head.appendChild(s);
  sendPageView();
}

function sendPageView() {
  if (!loaded || !active() || !window.gtag) return;
  const path = window.location.pathname + window.location.search;
  if (path === lastPath) return;
  lastPath = path;
  window.gtag('event', 'page_view', {
    page_title: document.title,
    page_location: window.location.href,
    ...(lastUrl ? { page_referrer: lastUrl } : {}),
  });
  lastUrl = window.location.href;
}

/** Called once the public site settings have loaded. */
export function configureAnalytics(s: { ga_measurement_id?: string; ga_consent?: string; ga_exclude_staff?: string }) {
  const id = (s.ga_measurement_id || '').trim().toUpperCase();
  config = /^G-[A-Z0-9]{4,20}$/.test(id)
    ? { id, banner: s.ga_consent !== 'none', excludeStaff: s.ga_exclude_staff !== 'no' }
    : null;
  window.dispatchEvent(new Event(CHANGE_EVENT));
  load();
}

export function setConsent(value: Consent) {
  try { localStorage.setItem(CONSENT_KEY, value); } catch { /* private mode: asked again next visit */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  if (value === 'granted') load();
  else if (loaded && config) {
    // Already loaded this visit: stop sending and drop Google's cookies.
    window.gtag?.('consent', 'update', { analytics_storage: 'denied' });
    document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter((n) => n === '_ga' || n.startsWith('_ga_'))
      .forEach((n) => {
        document.cookie = `${n}=; Max-Age=0; path=/`;
        document.cookie = `${n}=; Max-Age=0; path=/; domain=.${window.location.hostname}`;
      });
  }
}

/** Re-open the consent banner (footer "Cookie settings"). */
export function reopenConsent() {
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: 'reopen' }));
}

export function onAnalyticsChange(fn: (e: Event) => void) {
  window.addEventListener(CHANGE_EVENT, fn);
  return () => window.removeEventListener(CHANGE_EVENT, fn);
}

/** The route changed: count it once the page sets its title, or after 1.5s. */
export function trackRouteChange() {
  window.clearTimeout(timer);
  timer = window.setTimeout(sendPageView, 1500);
}

/** A page has applied its title and meta tags (utils/seo.ts). */
export function trackPageReady() {
  window.clearTimeout(timer);
  timer = window.setTimeout(sendPageView, 0);
}

/** A custom event, e.g. trackEvent('poll_vote', { poll: slug }). No-op unless tracking is on. */
export function trackEvent(name: string, params: Record<string, string | number | boolean | undefined> = {}) {
  if (!loaded || !active() || !window.gtag) return;
  window.gtag('event', name, params);
}
