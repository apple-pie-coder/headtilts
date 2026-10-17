import { ClipboardEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AxiosError } from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faCommentDots, faBug, faLightbulb, faCircleQuestion, faXmark, faImage, faCircleCheck, faArrowUpRightFromSquare,
} from '@fortawesome/free-solid-svg-icons';
import { faGithub } from '@fortawesome/free-brands-svg-icons';
import { FeedbackItem, FeedbackStatus, FeedbackType, fetchFeedbackStatus, sendFeedback } from '../services/feedback';
import { recentErrors } from '../utils/errorLog';
import styles from './FeedbackButton.module.css';
import { refreshNavBadges } from '../hooks/useNavBadges';

const APP_VERSION = '1.0.0';

const TYPES: { value: FeedbackType; label: string; icon: IconDefinition; title: string; body: string }[] = [
  { value: 'bug', label: 'Bug', icon: faBug, title: 'e.g. Saving a draft shows an error', body: 'What happened? What did you expect to happen? Steps to make it happen again help a lot.' },
  { value: 'idea', label: 'Idea', icon: faLightbulb, title: 'e.g. Let me schedule several posts at once', body: 'What would you like the admin to do, and what problem would it solve for you?' },
  { value: 'question', label: 'Question', icon: faCircleQuestion, title: 'e.g. How do I change the homepage hero?', body: 'What are you trying to do?' },
];

function browserSummary(): string {
  const ua = navigator.userAgent;
  const b = ua.match(/(Edg|OPR|Firefox|Chrome|Version)\/(\d+)/);
  const name = b ? ({ Edg: 'Edge', OPR: 'Opera', Version: 'Safari' } as Record<string, string>)[b[1]] ?? b[1] : 'Browser';
  const os = /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'unknown OS';
  return `${name}${b ? ` ${b[2]}` : ''} on ${os}`;
}

/** Shrink big screenshots before upload: max 1600 px wide, WebP/JPEG. */
async function toDataUrl(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL('image/webp', 0.85);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * Floating "Feedback" button for the admin: report a bug, idea or question
 * from any page. Page, browser, theme and recent errors are attached
 * automatically; reports become GitHub issues when the server is connected.
 */
export function FeedbackButton() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  // The phone layout opens this from the navigation drawer.
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('admin:open-feedback', show);
    return () => window.removeEventListener('admin:open-feedback', show);
  }, []);
  const [status, setStatus] = useState<FeedbackStatus | null>(null);
  const [type, setType] = useState<FeedbackType>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [shot, setShot] = useState<string | null>(null);
  const [includeContext, setIncludeContext] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<FeedbackItem | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const meta = TYPES.find((t) => t.value === type)!;

  useEffect(() => {
    if (!open) return;
    if (!status) fetchFeedbackStatus().then(setStatus).catch(() => setStatus({ configured: false, repo: null, private: null }));
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, status]);

  const context = {
    browser: browserSummary(),
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    theme: document.documentElement.dataset.theme ?? 'light',
    appVersion: APP_VERSION,
    errors: recentErrors(),
  };

  async function attach(file: Blob | null | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    try { setShot(await toDataUrl(file)); } catch { setError('Couldn’t read that image.'); }
  }

  function onPaste(e: ClipboardEvent) {
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); attach(item.getAsFile()); }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const item = await sendFeedback({
        type, title, description, pagePath: location.pathname + location.search,
        context: includeContext ? context : undefined, screenshot: shot,
      });
      setSent(item);
      refreshNavBadges(); // counts on the dashboard and sidebar update right away
      setTitle(''); setDescription(''); setShot(null);
    } catch (err) {
      setError((err as AxiosError<{ error?: { message?: string } }>).response?.data?.error?.message ?? 'Couldn’t send your feedback. Please try again.');
    } finally {
      setSending(false);
    }
  }

  const close = () => { setOpen(false); setSent(null); setError(null); };

  return (
    <>
      <button type="button" className={styles.fab} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="Feedback: report a problem or suggest an improvement" title="Report a problem or suggest an improvement">
        <FontAwesomeIcon icon={faCommentDots} /><span className={styles.fabLabel}>Feedback</span>
      </button>

      {open && (
        <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="feedback-title" onPaste={onPaste}>
            <header className={styles.head}>
              <h2 id="feedback-title">{sent ? 'Thanks for the feedback' : 'Send feedback'}</h2>
              <button type="button" className={styles.close} onClick={close} aria-label="Close"><FontAwesomeIcon icon={faXmark} /></button>
            </header>

            {sent ? (
              <div className={styles.done}>
                <FontAwesomeIcon icon={faCircleCheck} className={styles.doneIcon} />
                {sent.issueUrl ? (
                  <>
                    <p>Created issue <strong>#{sent.issueNumber}</strong> on GitHub so it can be tracked and fixed.</p>
                    <a href={sent.issueUrl} target="_blank" rel="noopener noreferrer" className={styles.primary}>
                      <FontAwesomeIcon icon={faGithub} /> View issue #{sent.issueNumber} <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                    </a>
                  </>
                ) : sent.syncStatus === 'failed' ? (
                  <p>Saved, but GitHub didn’t accept it yet ({sent.syncError}). It’s kept under <strong>System → Feedback</strong> and can be re-sent from there.</p>
                ) : (
                  <p>Saved. You’ll find it under <strong>System → Feedback</strong>.</p>
                )}
                <div className={styles.actions}>
                  <button type="button" className={styles.secondary} onClick={() => setSent(null)}>Send another</button>
                  <button type="button" className={styles.secondary} onClick={close}>Close</button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className={styles.form}>
                <div className={styles.types} role="radiogroup" aria-label="Type of feedback">
                  {TYPES.map((t) => (
                    <button key={t.value} type="button" role="radio" aria-checked={type === t.value}
                      className={`${styles.type} ${type === t.value ? styles.typeOn : ''}`} onClick={() => setType(t.value)}>
                      <FontAwesomeIcon icon={t.icon} /> {t.label}
                    </button>
                  ))}
                </div>

                <label className={styles.label} htmlFor="fb-title">Title</label>
                <input id="fb-title" ref={titleRef} className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder={meta.title} maxLength={200} required minLength={4} />

                <label className={styles.label} htmlFor="fb-body">Details</label>
                <textarea id="fb-body" className={styles.input} rows={5} value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder={meta.body} required minLength={4} />

                {shot ? (
                  <div className={styles.shot}>
                    <img src={shot} alt="Screenshot to attach" />
                    <button type="button" className={styles.linkDanger} onClick={() => setShot(null)}>Remove screenshot</button>
                  </div>
                ) : (
                  <button type="button" className={styles.drop} onClick={() => fileRef.current?.click()}>
                    <FontAwesomeIcon icon={faImage} /> Add a screenshot — paste with Ctrl+V or choose a file
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { attach(e.target.files?.[0]); e.target.value = ''; }} />

                <details className={styles.context}>
                  <summary>
                    <label onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={includeContext} onChange={(e) => setIncludeContext(e.target.checked)} /> Include page details
                    </label>
                    <span className={styles.hint}>(recommended)</span>
                  </summary>
                  <dl>
                    <div><dt>Page</dt><dd>{location.pathname}</dd></div>
                    <div><dt>Browser</dt><dd>{context.browser}</dd></div>
                    <div><dt>Window</dt><dd>{context.viewport} · {context.theme} theme</dd></div>
                    <div><dt>Version</dt><dd>{context.appVersion}</dd></div>
                    <div><dt>Recent errors</dt><dd>{context.errors.length ? context.errors.length : 'none'}</dd></div>
                  </dl>
                  {context.errors.length > 0 && <pre className={styles.errors}>{context.errors.join('\n')}</pre>}
                </details>

                {error && <p className={styles.error} role="alert">{error}</p>}

                <footer className={styles.foot}>
                  <span className={styles.where}>
                    {status?.configured ? (
                      <><FontAwesomeIcon icon={faGithub} /> Creates an issue in <strong>{status.repo}</strong>
                        {status.private === false && <span className={styles.public}> · public repo — no passwords or personal details</span>}</>
                    ) : status ? 'Saved to System → Feedback (GitHub not connected yet)' : ' '}
                  </span>
                  <button type="submit" className={styles.primary} disabled={sending || title.trim().length < 4 || description.trim().length < 4}>
                    {sending ? 'Sending…' : 'Send feedback'}
                  </button>
                </footer>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
