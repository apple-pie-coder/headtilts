import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { AxiosError } from 'axios';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTowerBroadcast, faThumbtack, faPen, faTrashCan, faCircleStop, faRotateLeft, faChevronDown,
} from '@fortawesome/free-solid-svg-icons';
import type { LiveUpdate } from '../../types';
import { MediaLibraryModal } from '../MediaLibraryModal';
import { useConfirm } from '../ConfirmDialog';
import { useToast } from '../ToastContext';
import { resolveMediaUrl } from '../../services/media';
import {
  createLiveUpdate, deleteLiveUpdate, fetchLiveUpdates, setLiveCoverage, updateLiveUpdate, LiveUpdateInput,
} from '../../services/liveUpdates';
import styles from './editorExtras.module.css';

// Picks up updates colleagues post from their own desks.
const REFRESH_MS = 20_000;
// The desk sits above the post body; keep it short so the body stays in reach on phones.
const RECENT_COUNT = 3;
const OPEN_KEY = 'headtilts.liveDeskOpen';

function readOpen(): boolean {
  try { return localStorage.getItem(OPEN_KEY) !== '0'; } catch { return true; }
}

// A trimmed-down toolbar: what a quick update needs, nothing that slows it down.
const LIVE_TOOLBAR = [
  ['bold', 'italic', 'underline', 'strike'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['blockquote', 'link'],
  ['image', 'video'],
  ['clean'],
];
const LIVE_FORMATS = ['bold', 'italic', 'underline', 'strike', 'list', 'blockquote', 'link', 'image', 'video'];

interface Draft { headline: string; body: string; pinned: boolean }
const EMPTY: Draft = { headline: '', body: '', pinned: false };
const toInput = (d: Draft): LiveUpdateInput => ({ headline: d.headline || null, format: 'html', body: d.body, pinned: d.pinned });

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * An update's body as editor HTML. Plain-text updates (posted through the API)
 * become paragraphs, and an old-style lead image moves inline, so editing
 * always works on one rich body.
 */
function bodyAsHtml(u: Pick<LiveUpdate, 'format' | 'body' | 'image'>): string {
  const html = u.format === 'text'
    ? u.body.split(/\n{2,}/).filter((p) => p.trim()).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('')
    : u.body;
  return u.image ? `${html}<p><img src="${escapeHtml(resolveMediaUrl(u.image))}"></p>` : html;
}

/** All updates as one HTML string, for the SEO checks on the whole live blog. */
export function liveUpdatesToHtml(updates: LiveUpdate[]): string {
  return updates.map((u) => `${u.headline ? `<h3>${escapeHtml(u.headline)}</h3>` : ''}${bodyAsHtml(u)}`).join('');
}

/** Whether the editor HTML holds anything (Quill's empty state is <p><br></p>). */
const hasContent = (html: string) =>
  /<(img|iframe)\b/i.test(html) || !!html.replace(/<[^>]*>/g, '').replace(/&nbsp;|\s/g, '');

/** Text and first image of an update for the desk list; no HTML is injected. */
function preview(u: LiveUpdate): { text: string; image: string | null; more: number } {
  const doc = new DOMParser().parseFromString(bodyAsHtml(u), 'text/html');
  const images = [...doc.querySelectorAll('img')].map((i) => i.getAttribute('src') ?? '').filter(Boolean);
  const embeds = doc.querySelectorAll('iframe').length;
  // iOS Safari's editor joins words with non-breaking spaces, which would stop the preview wrapping.
  const blocks = [...doc.body.children].map((el) => (el.textContent ?? '').replace(/\u00a0/g, ' ').trim()).filter(Boolean);
  return { text: blocks.join('\n\n'), image: images[0] ?? null, more: images.length - (images.length ? 1 : 0) + embeds };
}

const errorMessage = (err: unknown, fallback: string) =>
  (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback;

const authorName = (u: LiveUpdate) =>
  u.author ? [u.author.firstName, u.author.lastName].filter(Boolean).join(' ') || u.author.username : 'Former user';

const stamp = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

function UpdateForm({ initial, submitLabel, onSubmit, onCancel, disabled }: {
  initial: Draft;
  submitLabel: string;
  onSubmit: (d: Draft) => Promise<boolean>;
  onCancel?: () => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const quillRef = useRef<ReactQuill>(null);
  const insertAt = useRef(0);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const empty = !hasContent(draft.body);

  // Stable per form, or Quill re-initialises on every keystroke.
  const modules = useMemo(() => ({
    toolbar: {
      container: LIVE_TOOLBAR,
      handlers: {
        image: () => {
          const quill = quillRef.current?.getEditor();
          insertAt.current = quill?.getSelection(true)?.index ?? quill?.getLength() ?? 0;
          setMediaOpen(true);
        },
      },
    },
  }), []);

  function insertImage(media: { url: string }) {
    const quill = quillRef.current?.getEditor();
    if (quill) {
      quill.insertEmbed(insertAt.current, 'image', resolveMediaUrl(media.url), 'user');
      quill.setSelection(insertAt.current + 1, 0, 'user');
    }
    setMediaOpen(false);
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (empty || busy) return;
    setBusy(true);
    const ok = await onSubmit(draft);
    setBusy(false);
    if (ok && !onCancel) setDraft(EMPTY);
  }

  // Ctrl/⌘+Enter posts without reaching for the mouse.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); }
  };

  return (
    <form className={styles.liveForm} onSubmit={submit} onKeyDown={onKeyDown}>
      <input className={styles.input} value={draft.headline} onChange={(e) => set('headline', e.target.value)}
        placeholder="Headline (optional), e.g. Gojira take the stage" aria-label="Update headline" maxLength={200} disabled={disabled || busy} />
      <div className={styles.liveEditor}>
        <ReactQuill ref={quillRef} theme="snow" value={draft.body} onChange={(v) => set('body', v)}
          modules={modules} formats={LIVE_FORMATS} readOnly={disabled || busy}
          placeholder="What just happened? Paste a YouTube, Spotify or X link on its own line to embed it." />
      </div>
      <div className={styles.qnaToolbar}>
        <label className={styles.liveCheck}>
          <input type="checkbox" checked={draft.pinned} onChange={(e) => set('pinned', e.target.checked)} disabled={disabled || busy} />
          Pin to the top
        </label>
        <span className={styles.qnaActions}>
          {onCancel && <button type="button" className={styles.chipToggle} onClick={onCancel} disabled={busy}>Cancel</button>}
          <button type="submit" className={styles.fixPrimary} disabled={disabled || busy || empty} title="Ctrl/⌘ + Enter">
            {busy ? 'Saving…' : submitLabel}
          </button>
        </span>
      </div>
      {mediaOpen && <MediaLibraryModal onSelect={insertImage} onClose={() => setMediaOpen(false)} />}
    </form>
  );
}

/**
 * The live desk: post timestamped updates to a live blog. Updates go out the
 * moment they are posted, independently of the post's own Save/Update button,
 * and the panel refreshes so several editors can work the same story.
 */
export function LivePanel({ postId, isPublished, disabled, onUpdatesChange }: {
  postId?: number;
  isPublished: boolean;
  disabled?: boolean;
  /** Reports the current updates, e.g. so the SEO checks can read the whole blog. */
  onUpdatesChange?: (updates: LiveUpdate[]) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [updates, setUpdates] = useState<LiveUpdate[]>([]);
  const [endedAt, setEndedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [togglingCoverage, setTogglingCoverage] = useState(false);
  const [open, setOpen] = useState(readOpen);
  const [showAll, setShowAll] = useState(false);

  function toggleOpen() {
    setOpen((o) => {
      try { localStorage.setItem(OPEN_KEY, o ? '0' : '1'); } catch { /* private mode: just don't remember */ }
      return !o;
    });
  }

  useEffect(() => {
    if (!postId) return;
    let cancelled = false;
    // Only the first load reports errors; background refreshes stay quiet.
    async function load(quiet: boolean) {
      try {
        const feed = await fetchLiveUpdates(postId!);
        if (cancelled) return;
        setUpdates(feed.updates);
        setEndedAt(feed.liveEndedAt);
      } catch (err) {
        if (!quiet && !cancelled) toast.error(errorMessage(err, 'Could not load live updates'));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    void load(false);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(true); }, REFRESH_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [postId, toast]);

  useEffect(() => { onUpdatesChange?.(updates); }, [updates, onUpdatesChange]);

  if (!postId) {
    return (
      <section className={styles.reviewPanel} aria-label="Live desk">
        <h3 className={styles.reviewTitle}><FontAwesomeIcon icon={faTowerBroadcast} /> Live desk</h3>
        <p className={styles.help}>
          Save this post once to open the live desk. After that, each update goes out as soon as you post it. You don't need to press Update.
        </p>
      </section>
    );
  }

  async function post(d: Draft): Promise<boolean> {
    try {
      const created = await createLiveUpdate(postId!, toInput(d));
      setUpdates((list) => [created, ...list]);
      toast.success(isPublished ? 'Update posted' : 'Update saved. Readers will see it once the post is published.');
      return true;
    } catch (err) {
      toast.error(errorMessage(err, 'Could not post the update'));
      return false;
    }
  }

  async function save(id: number, d: Draft): Promise<boolean> {
    try {
      // The form holds any old lead image inline now, so clear the separate field.
      const saved = await updateLiveUpdate(postId!, id, { ...toInput(d), image: null });
      setUpdates((list) => list.map((u) => (u.id === id ? saved : u)));
      setEditingId(null);
      return true;
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the update'));
      return false;
    }
  }

  async function togglePin(u: LiveUpdate) {
    try {
      const saved = await updateLiveUpdate(postId!, u.id, { pinned: !u.pinned });
      setUpdates((list) => list.map((x) => (x.id === u.id ? saved : x)));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not change the pin'));
    }
  }

  async function remove(u: LiveUpdate) {
    if (!(await confirm({ title: 'Delete update?', message: `Delete the ${stamp(u.createdAt)} update? Readers will no longer see it.`, confirmLabel: 'Delete', danger: true }))) return;
    try {
      await deleteLiveUpdate(postId!, u.id);
      setUpdates((list) => list.filter((x) => x.id !== u.id));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete the update'));
    }
  }

  async function toggleCoverage() {
    const ending = !endedAt;
    if (ending && !(await confirm({
      title: 'End live coverage?',
      message: 'The LIVE badge comes off and readers stop getting new updates. You can reopen coverage later.',
      confirmLabel: 'End coverage',
    }))) return;
    setTogglingCoverage(true);
    try {
      setEndedAt((await setLiveCoverage(postId!, ending)).liveEndedAt);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not change the coverage status'));
    } finally {
      setTogglingCoverage(false);
    }
  }

  const pinned = updates.filter((u) => u.pinned).length;
  const summary = !loaded ? 'Loading updates…' : updates.length ? `${updates.length} update${updates.length === 1 ? '' : 's'}${pinned ? ` · ${pinned} pinned` : ''}` : 'No updates yet';
  const visible = showAll ? updates : updates.slice(0, RECENT_COUNT);

  return (
    <section className={styles.reviewPanel} aria-label="Live desk">
      <div className={styles.reviewHead}>
        <h3 className={styles.reviewTitle}>
          <button type="button" className={styles.liveToggle} onClick={toggleOpen} aria-expanded={open}>
            <FontAwesomeIcon icon={faTowerBroadcast} /> Live desk
            {!open && <span className={styles.help}>· {summary}</span>}
            <FontAwesomeIcon icon={faChevronDown} className={`${styles.liveChevron} ${open ? styles.liveChevronOpen : ''}`} />
          </button>
        </h3>
        <span className={styles.qnaActions}>
          <span className={`${styles.liveState} ${endedAt ? '' : styles.liveStateOn}`}>
            {endedAt ? `Ended ${stamp(endedAt)}` : isPublished ? 'Live now' : 'Goes live on publish'}
          </span>
          <button type="button" className={styles.chipToggle} onClick={toggleCoverage} disabled={disabled || togglingCoverage}>
            <FontAwesomeIcon icon={endedAt ? faRotateLeft : faCircleStop} /> {endedAt ? 'Reopen coverage' : 'End coverage'}
          </button>
        </span>
      </div>

      {open && (<>
      {!updates.length && !endedAt && (
        <p className={styles.help}>
          Use the post text below as the intro or summary. Updates show newest first under it, and open pages pick up new ones within about 30 seconds.
        </p>
      )}

      {endedAt
        ? <p className={styles.help}>Coverage has ended. You can still correct earlier updates, or reopen coverage to post new ones.</p>
        : <UpdateForm initial={EMPTY} submitLabel="Post update" onSubmit={post} disabled={disabled} />}

      <div className={styles.qnaToolbar}>
        <span className={styles.help}>
          {summary}{updates.length > RECENT_COUNT && !showAll ? ` · showing the latest ${RECENT_COUNT}` : ''}
        </span>
      </div>

      <ol className={styles.qnaList}>
        {visible.map((u) => (
          <li key={u.id} className={`${styles.qnaItem} ${u.pinned ? styles.livePinned : ''}`}>
            <div className={styles.qnaItemHead}>
              <span className={styles.liveMeta}>
                <span className={styles.qnaNumber}>{stamp(u.createdAt)}</span>
                {u.pinned && <span className={styles.liveTag}><FontAwesomeIcon icon={faThumbtack} /> Pinned</span>}
                <span className={styles.help}>{authorName(u)}</span>
              </span>
              {editingId !== u.id && (
                <span className={styles.qnaItemControls}>
                  <button type="button" className={styles.iconButtonPlain} aria-label={u.pinned ? 'Unpin update' : 'Pin update'} title={u.pinned ? 'Unpin' : 'Pin to the top'}
                    aria-pressed={u.pinned} onClick={() => togglePin(u)} disabled={disabled}><FontAwesomeIcon icon={faThumbtack} /></button>
                  <button type="button" className={styles.iconButtonPlain} aria-label="Edit update" title="Edit" onClick={() => setEditingId(u.id)} disabled={disabled}>
                    <FontAwesomeIcon icon={faPen} /></button>
                  <button type="button" className={styles.iconButton} aria-label="Delete update" title="Delete" onClick={() => remove(u)} disabled={disabled}>
                    <FontAwesomeIcon icon={faTrashCan} /></button>
                </span>
              )}
            </div>
            {editingId === u.id ? (
              <UpdateForm
                initial={{ headline: u.headline ?? '', body: bodyAsHtml(u), pinned: u.pinned }}
                submitLabel="Save changes"
                onSubmit={(d) => save(u.id, d)}
                onCancel={() => setEditingId(null)}
                disabled={disabled}
              />
            ) : (
              (() => {
                const p = preview(u);
                return (
                  <div className={styles.liveBody}>
                    <div className={styles.liveText}>
                      {u.headline && <strong>{u.headline}</strong>}
                      {p.text && <p>{p.text}</p>}
                      {p.more > 0 && <span className={styles.help}>+ {p.more} more image{p.more === 1 ? '' : 's'} or embed{p.more === 1 ? '' : 's'}</span>}
                    </div>
                    {p.image && <img className={styles.liveThumb} src={p.image} alt="" />}
                  </div>
                );
              })()
            )}
          </li>
        ))}
      </ol>

      {updates.length > RECENT_COUNT && (
        <button type="button" className={styles.addRow} onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
          {showAll ? `Show only the latest ${RECENT_COUNT}` : `Show all ${updates.length} updates`}
        </button>
      )}
      </>)}
    </section>
  );
}
