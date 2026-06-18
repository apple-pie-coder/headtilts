import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFeather, faCheck, faPenToSquare, faListUl, faBars,
} from '@fortawesome/free-solid-svg-icons';
import { MediaPickerInput } from '../components/MediaPickerInput';
import { useToast } from '../components/ToastContext';
import { updateSettings } from '../services/settings';
import styles from './Wizard.module.css';

const STEPS = ['Your site', 'Logo', 'All done'];

const TIMEZONES = [
  'UTC',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Moscow', 'Asia/Kolkata', 'Asia/Colombo', 'Asia/Dubai',
  'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Sydney',
  'Pacific/Auckland',
];

export default function WizardPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [siteTitle, setSiteTitle]     = useState('');
  const [siteTagline, setSiteTagline] = useState('');
  const [showTagline, setShowTagline] = useState(true);
  const [adminEmail, setAdminEmail]   = useState('');
  const [timezone, setTimezone]       = useState('UTC');

  const [siteLogo, setSiteLogo]         = useState('');
  const [siteLogoDark, setSiteLogoDark] = useState('');

  function done() {
    localStorage.setItem('headtilts_wizard_done', '1');
    navigate('/admin');
  }

  async function saveStep1() {
    setSaving(true);
    try {
      const updates: Record<string, string> = {
        show_tagline: showTagline ? 'yes' : 'no',
        timezone,
      };
      if (siteTitle)    updates.site_title    = siteTitle;
      if (siteTagline)  updates.site_tagline  = siteTagline;
      if (adminEmail)   updates.admin_email   = adminEmail;
      await updateSettings(updates);
      setStep(1);
    } catch {
      toast.error('Failed to save — check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  async function saveStep2() {
    setSaving(true);
    try {
      await updateSettings({ site_logo: siteLogo, site_logo_dark: siteLogoDark });
      setStep(2);
    } catch {
      toast.error('Failed to save — check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>

        <div className={styles.brand}>
          <FontAwesomeIcon icon={faFeather} className={styles.brandIcon} />
          <span>Headtilts</span>
        </div>

        {/* Step indicator */}
        <div className={styles.stepper}>
          {STEPS.map((label, i) => (
            <div key={i} className={[styles.stepItem, i <= step ? styles.stepDone : ''].join(' ')}>
              <div className={styles.stepCircle}>
                {i < step ? <FontAwesomeIcon icon={faCheck} /> : i + 1}
              </div>
              <span className={styles.stepLabel}>{label}</span>
              {i < STEPS.length - 1 && <div className={styles.stepLine} />}
            </div>
          ))}
        </div>

        {/* ── Step 0: Site identity ── */}
        {step === 0 && (
          <>
            <div className={styles.stepHeader}>
              <h2>Let's set up your site</h2>
              <p>These appear in browser tabs, search results, and emails. You can change them any time in Settings.</p>
            </div>

            <div className={styles.formGroup}>
              <label>Site title</label>
              <input
                autoFocus
                value={siteTitle}
                onChange={e => setSiteTitle(e.target.value)}
                placeholder="My Webzine"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Tagline <span className={styles.optional}>(optional)</span></label>
              <input
                value={siteTagline}
                onChange={e => setSiteTagline(e.target.value)}
                placeholder="A short description of your site"
              />
            </div>

            <label className={styles.toggle}>
              <input type="checkbox" checked={showTagline} onChange={e => setShowTagline(e.target.checked)} />
              <span>Show tagline below the site title in the header</span>
            </label>

            <div className={styles.formGroup}>
              <label>Admin email <span className={styles.optional}>(optional)</span></label>
              <input
                type="email"
                value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <span className={styles.hint}>Receives contact form submissions and new-comment notifications.</span>
            </div>

            <div className={styles.formGroup}>
              <label>Timezone</label>
              <select value={timezone} onChange={e => setTimezone(e.target.value)}>
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
              <span className={styles.hint}>Used for date display and scheduling. Not in the list? Save and edit it in Settings → General.</span>
            </div>

            <div className={styles.actions}>
              <button className={styles.skip} onClick={() => setStep(1)} disabled={saving}>Skip</button>
              <button className={styles.primary} onClick={saveStep1} disabled={saving}>
                {saving ? 'Saving…' : 'Next'}
              </button>
            </div>
          </>
        )}

        {/* ── Step 1: Logo ── */}
        {step === 1 && (
          <>
            <div className={styles.stepHeader}>
              <h2>Add a logo</h2>
              <p>Optional — if skipped, the site title text is shown in the header instead.</p>
            </div>

            <div className={styles.formGroup}>
              <label>Logo — light mode</label>
              <MediaPickerInput value={siteLogo} onChange={setSiteLogo} />
            </div>

            <div className={styles.formGroup}>
              <label>Logo — dark mode <span className={styles.optional}>(optional)</span></label>
              <MediaPickerInput value={siteLogoDark} onChange={setSiteLogoDark} />
              <span className={styles.hint}>Falls back to the light logo when unset.</span>
            </div>

            <div className={styles.actions}>
              <button className={styles.skip} onClick={() => setStep(2)} disabled={saving}>Skip</button>
              <button className={styles.primary} onClick={saveStep2} disabled={saving}>
                {saving ? 'Saving…' : 'Next'}
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Done ── */}
        {step === 2 && (
          <>
            <div className={styles.stepHeader}>
              <h2>You're all set!</h2>
              <p>Your site is ready. Here are a few good first things to do:</p>
            </div>

            <div className={styles.nextSteps}>
              <a href="/admin/posts/new" className={styles.nextStep}>
                <span className={styles.nextStepIcon}><FontAwesomeIcon icon={faPenToSquare} /></span>
                <div>
                  <strong>Write your first post</strong>
                  <span>Open the editor and publish something</span>
                </div>
              </a>
              <a href="/admin/categories" className={styles.nextStep}>
                <span className={styles.nextStepIcon}><FontAwesomeIcon icon={faListUl} /></span>
                <div>
                  <strong>Create categories</strong>
                  <span>Organise your content before you publish</span>
                </div>
              </a>
              <a href="/admin/menus" className={styles.nextStep}>
                <span className={styles.nextStepIcon}><FontAwesomeIcon icon={faBars} /></span>
                <div>
                  <strong>Build your navigation</strong>
                  <span>Set up the primary and footer menus</span>
                </div>
              </a>
            </div>

            <button className={styles.primary} style={{ width: '100%', marginTop: '1.75rem' }} onClick={done}>
              Go to dashboard
            </button>
          </>
        )}

      </div>
    </div>
  );
}
