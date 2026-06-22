import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { fetchSiteSettings } from '../services/taxonomy';
import { setPermalinkStructure } from '../utils/permalink';
import { applySiteDefaults, applyFavicon } from '../utils/seo';
import { SiteSettings } from '../types';

const DEFAULTS: SiteSettings = {
  site_title: 'Headtilts',
  site_tagline: '',
  show_tagline: 'yes',
  site_logo: '',
  site_logo_dark: '',
  site_logo_height: '',
  admin_logo_height: '',
  site_description: '',
  timezone: 'UTC',
  date_format: 'F j, Y',
  time_format: 'g:i a',
  posts_per_page: '10',
  front_page_display: 'posts',
  front_page_id: '',
  posts_page_id: '',
  contact_page_id: '',
  about_page_id: '',
  privacy_policy_page_id: '',
  terms_page_id: '',
};

const SiteSettingsContext = createContext<SiteSettings>(DEFAULTS);

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULTS);

  useEffect(() => {
    fetchSiteSettings()
      .then((s) => {
        const merged = { ...DEFAULTS, ...s };
        setSettings(merged);
        setPermalinkStructure(merged.permalink_structure);

        // Site-wide title/description fallback. Won't overwrite a page that has
        // already applied its own SEO (prevents the title resetting on refresh).
        applySiteDefaults({ title: merged.site_title, description: merged.site_description });
        applyFavicon(merged.site_favicon);
      })
      .catch(() => {});
  }, []);

  return (
    <SiteSettingsContext.Provider value={settings}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

export function useSiteSettings(): SiteSettings {
  return useContext(SiteSettingsContext);
}
