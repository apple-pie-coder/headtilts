import { DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { PERMISSIONS, slugify } from '@headtilts/shared';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFileWord, faDownload, faCloudArrowUp, faCircleCheck, faTriangleExclamation, faCircleXmark, faChevronDown,
  faChevronRight, faImage, faStar, faRotateLeft, faSpinner, faArrowRight, faForwardStep, faPen, faCircleInfo,
} from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmDialog';
import { Button, Card, Checkbox, PageHeader, StatusBadge } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { Category, Post } from '../types';
import { AuthorListItem, createPost, fetchAuthorList, fetchPosts, PostInput, updatePost } from '../services/posts';
import { createCategory, fetchCategories } from '../services/categories';
import { fetchUploadConfig, resolveMediaUrl, uploadMediaBatch, UploadConfig } from '../services/media';
import { fetchPublicSettings } from '../services/settings';
import { buildTemplate } from './import/buildTemplate';
import { DocPost, dataUriToFile, parseDocx } from './import/parseDocx';
import {
  EXAMPLE_TITLES, FIELDS, ImportStatus, TEMPLATE_FILENAME, parseDate, parseStatus, parseYesNo, splitList,
} from './import/importFormat';
import { sanitizeHtml } from '../utils/sanitize';
import styles from './PostImport.module.css';

/* ── Types ─────────────────────────────────────────────────── */

interface Options {
  forceDraft: boolean;
  createCategories: boolean;
  onDuplicate: 'skip' | 'rename';
}

interface Plan {
  slug: string;
  status: ImportStatus;
  scheduledFor?: Date;
  /** Original date for a published post (backdated). */
  publishedAt?: Date;
  categoryIds: number[];
  newCategories: string[];
  tags: string[];
  authorId?: string;
  authorName: string;
  featuredUrl?: string;
  isFeatured: boolean;
  slugTaken: boolean;
  errors: string[];
  warnings: string[];
}

interface Row {
  key: string;
  post: DocPost;
  include: boolean;
}

type RunState = { state: 'pending' | 'working' | 'done' | 'skipped' | 'failed'; message?: string; postId?: number; publicUrl?: string };

interface Context {
  categories: Category[];
  authors: AuthorListItem[];
  meId?: string;
  existingSlugs: Set<string>;
  fileSlugs: Map<string, number>;
  canPublish: boolean;
  canEditOthers: boolean;
  canCreateCategory: boolean;
  canUpload: boolean;
  options: Options;
}

function errorMessage(err: unknown, fallback: string): string {
  return (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback;
}

function personName(a: AuthorListItem): string {
  return [a.firstName, a.lastName].filter(Boolean).join(' ') || a.username;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry once the API's rate limiter lets us through again. */
async function withRateLimitRetry<T>(fn: () => Promise<T>, onWait: (s: number) => void): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as AxiosError).response?.status;
      if (status !== 429 || attempt >= 5) throw err;
      onWait(20);
      await sleep(20_000);
    }
  }
}

/* ── Validation: what will happen to each post ─────────────── */

function planFor(post: DocPost, ctx: Context): Plan {
  const f = post.fields;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!post.title) errors.push('The Heading 1 title is empty.');

  // Slug
  const slug = slugify(f.slug?.trim() || post.title);
  if (!slug) errors.push('Couldn’t make a URL slug from the title — add a Slug in the details table.');
  if (slug && (ctx.fileSlugs.get(slug) ?? 0) > 1) errors.push(`Another post in the upload has the same slug “${slug}”. Give one of them a different title or Slug.`);
  const slugTaken = !!slug && ctx.existingSlugs.has(slug);
  if (slugTaken) {
    warnings.push(ctx.options.onDuplicate === 'skip'
      ? `A post with the slug “${slug}” already exists — this one will be skipped.`
      : `A post with the slug “${slug}” already exists — this one gets a new slug like “${slug}-2”.`);
  }

  // Status and date
  let status: ImportStatus = 'draft';
  let scheduledFor: Date | undefined;
  let publishedAt: Date | undefined;
  const rawStatus = f.status ?? '';
  const parsedStatus = parseStatus(rawStatus);
  const date = f.publishDate ? parseDate(f.publishDate) : null;
  if (f.publishDate?.trim() && !date) errors.push(`“${f.publishDate}” isn’t a date I can read. Use a format like 2026-12-01 09:30.`);

  if (parsedStatus === null) {
    errors.push(`Unknown status “${rawStatus}”. Use draft, published or scheduled.`);
  } else if (parsedStatus === 'scheduled' || (parsedStatus === undefined && date && date > new Date())) {
    if (!date) errors.push('Scheduled posts need a Publish date.');
    else if (date <= new Date()) errors.push(`The publish date ${date.toLocaleString()} is in the past. Use a future date, or set Status to published.`);
    else { status = 'scheduled'; scheduledFor = date; }
  } else if (parsedStatus === 'published') {
    status = 'published';
    if (date && date > new Date()) {
      // A future date on a "published" post really means "publish later".
      status = 'scheduled';
      scheduledFor = date;
      warnings.push('The publish date is in the future, so this post will be scheduled for then.');
    } else if (date) {
      publishedAt = date;
    }
  } else if (date && parsedStatus === 'draft') {
    warnings.push('Drafts don’t use the Publish date; it is ignored.');
  } else if (date && parsedStatus === undefined) {
    warnings.push('Status is blank, so this is saved as a draft. Set Status to published to keep the date.');
  }

  if (status !== 'draft' && !ctx.canPublish) {
    warnings.push('You don’t have permission to publish, so this will be saved as a draft.');
    status = 'draft';
    scheduledFor = undefined;
    publishedAt = undefined;
  }
  if (ctx.options.forceDraft && status !== 'draft') {
    status = 'draft';
    scheduledFor = undefined;
    publishedAt = undefined;
  }

  // Categories
  const categoryIds: number[] = [];
  const newCategories: string[] = [];
  for (const name of splitList(f.categories ?? '')) {
    const lower = name.toLowerCase();
    const match = ctx.categories.find((c) => c.name.toLowerCase() === lower || c.slug === slugify(name));
    if (match) categoryIds.push(match.id);
    else newCategories.push(name);
  }
  if (newCategories.length) {
    if (ctx.options.createCategories && ctx.canCreateCategory) {
      warnings.push(`New categor${newCategories.length === 1 ? 'y' : 'ies'} will be created: ${newCategories.join(', ')}.`);
    } else {
      warnings.push(`Unknown categor${newCategories.length === 1 ? 'y' : 'ies'} will be left off: ${newCategories.join(', ')}.`);
    }
  }

  // Author
  let authorId: string | undefined;
  let authorName = 'You';
  const rawAuthor = f.author?.trim();
  if (rawAuthor) {
    const lower = rawAuthor.toLowerCase().replace(/^@/, '');
    const match = ctx.authors.find((a) => a.username.toLowerCase() === lower || personName(a).toLowerCase() === lower);
    if (!match) {
      warnings.push(`No user called “${rawAuthor}” — you’ll be the author.`);
    } else if (match.id !== ctx.meId && !ctx.canEditOthers) {
      warnings.push(`Only editors can assign posts to someone else — you’ll be the author instead of ${personName(match)}.`);
    } else {
      authorId = match.id === ctx.meId ? undefined : match.id;
      authorName = match.id === ctx.meId ? 'You' : personName(match);
    }
  }

  // Featured image and flag
  let featuredUrl: string | undefined;
  const rawImage = f.featuredImage?.trim();
  if (post.featuredImageData) {
    if (!ctx.canUpload) warnings.push('You can’t upload media, so the featured image will be skipped.');
  } else if (rawImage) {
    if (/^https?:\/\/\S+$/i.test(rawImage) || rawImage.startsWith('/')) featuredUrl = rawImage;
    else warnings.push('Featured image should be a picture or a link starting with https:// — it will be skipped.');
  }

  const yesNo = parseYesNo(f.featured ?? '');
  if (yesNo === null) warnings.push(`Featured should be yes or no (got “${f.featured}”) — treated as no.`);

  if (post.imageCount && !ctx.canUpload) warnings.push('You can’t upload media, so pictures in the text will be removed.');
  if (!post.wordCount && !post.imageCount) warnings.push('This post has no body text.');
  if (post.hasTable) warnings.push('Contains a table. It’s imported, but the post editor may simplify it if you edit the post later.');

  return {
    slug, status, scheduledFor, publishedAt, categoryIds, newCategories, tags: splitList(f.tags ?? ''), authorId, authorName,
    featuredUrl, isFeatured: !!yesNo, slugTaken, errors, warnings,
  };
}

/* ── Page ──────────────────────────────────────────────────── */

export default function PostImportPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const canPublish = hasPermission(PERMISSIONS.POST_PUBLISH);
  const canEditOthers = hasPermission(PERMISSIONS.POST_EDIT_OTHERS);
  const canCreateCategory = hasPermission(PERMISSIONS.CATEGORY_CREATE);
  const canUpload = hasPermission(PERMISSIONS.MEDIA_UPLOAD);

  const [phase, setPhase] = useState<'upload' | 'review' | 'run'>('upload');
  const [rows, setRows] = useState<Row[]>([]);
  const [fileNotes, setFileNotes] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [options, setOptions] = useState<Options>({ forceDraft: false, createCategories: true, onDuplicate: 'skip' });

  const [categories, setCategories] = useState<Category[]>([]);
  const [authors, setAuthors] = useState<AuthorListItem[]>([]);
  const [uploadConfig, setUploadConfig] = useState<UploadConfig | null>(null);
  const [siteName, setSiteName] = useState('');
  const [existingSlugs, setExistingSlugs] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  const [run, setRun] = useState<Record<string, RunState>>({});
  const [running, setRunning] = useState(false);
  const [waitNote, setWaitNote] = useState('');
  const cancelRef = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCategories(1, 500).then((r) => setCategories(r.items)).catch(() => {});
    fetchAuthorList().then(setAuthors).catch(() => {});
    fetchUploadConfig().then(setUploadConfig).catch(() => {});
    fetchPublicSettings().then((s) => setSiteName(s.site_title || '')).catch(() => {});
  }, []);

  // Warn before leaving mid-import.
  useEffect(() => {
    if (!running) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [running]);

  const fileSlugs = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const s = slugify(r.post.fields.slug?.trim() || r.post.title);
      if (s) m.set(s, (m.get(s) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  const plans = useMemo(() => {
    const ctx: Context = {
      categories, authors, meId: user?.id, existingSlugs, fileSlugs, canPublish, canEditOthers, canCreateCategory, canUpload, options,
    };
    return new Map(rows.map((r) => [r.key, planFor(r.post, ctx)]));
  }, [rows, categories, authors, user?.id, existingSlugs, fileSlugs, canPublish, canEditOthers, canCreateCategory, canUpload, options]);

  /* ── Template ── */

  async function downloadTemplate() {
    setDownloading(true);
    try {
      const blob = await buildTemplate(siteName || undefined);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = TEMPLATE_FILENAME;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error('Couldn’t create the template. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  /* ── Upload & parse ── */

  async function handleFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (files.length === 0) return;
    setParsing(true);
    const notes: string[] = [];
    const parsed: Row[] = [];
    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) {
        notes.push(`${file.name}: larger than 50 MB — split it into smaller documents.`);
        continue;
      }
      const result = await parseDocx(file);
      notes.push(...result.notes);
      for (const post of result.posts) {
        parsed.push({
          key: `${file.name}#${post.index}#${Math.random().toString(36).slice(2, 7)}`,
          post,
          include: !EXAMPLE_TITLES.has(post.title.toLowerCase()),
        });
      }
    }
    setParsing(false);
    setFileNotes(notes);
    if (parsed.length === 0) {
      if (!notes.length) toast.error('No posts were found in the file.');
      return;
    }
    setRows(parsed);
    setRun({});
    setPhase('review');
    checkExistingSlugs(parsed);
  }

  /** Look up which slugs are already used on the site (posts and pages share slugs). */
  async function checkExistingSlugs(list: Row[]) {
    setChecking(true);
    const slugs = Array.from(new Set(list.map((r) => slugify(r.post.fields.slug?.trim() || r.post.title)).filter(Boolean)));
    const taken = new Set<string>();
    const queue = [...slugs];
    async function worker() {
      while (queue.length) {
        const slug = queue.shift()!;
        try {
          const [posts, pages] = await Promise.all([
            fetchPosts(1, 20, { search: slug, type: 'post' }),
            fetchPosts(1, 20, { search: slug, type: 'page' }),
          ]);
          if ([...posts.items, ...pages.items].some((p) => p.slug === slug)) taken.add(slug);
        } catch { /* unknown — the import itself will report a clash */ }
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    setExistingSlugs(taken);
    setChecking(false);
  }

  function onDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  }

  /* ── Import ── */

  const selected = rows.filter((r) => r.include && (plans.get(r.key)?.errors.length ?? 0) === 0);
  const toImport = selected.filter((r) => !(plans.get(r.key)!.slugTaken && options.onDuplicate === 'skip'));

  async function uploadImage(dataUri: string, name: string): Promise<string | null> {
    const file = dataUriToFile(dataUri, name);
    if (!file) return null;
    if (uploadConfig && (!uploadConfig.allowedMime.includes(file.type) || file.size > uploadConfig.maxBytes)) return null;
    const res = await withRateLimitRetry(() => uploadMediaBatch([file], null), (s) => setWaitNote(`Server is busy — continuing in ${s}s…`));
    setWaitNote('');
    const media = res.uploaded[0] ?? res.duplicates[0];
    return media?.url ?? null;
  }

  async function importOne(row: Row, plan: Plan, categoryMap: Map<string, number>): Promise<RunState> {
    const post = row.post;
    const notes: string[] = [];

    // 1. Pictures in the body → media library.
    const doc = new DOMParser().parseFromString(`<body>${post.html}</body>`, 'text/html');
    const imgs = Array.from(doc.querySelectorAll('img'));
    let n = 0;
    for (const img of imgs) {
      const src = img.getAttribute('src') ?? '';
      if (!src.startsWith('data:')) continue;
      n++;
      let url: string | null = null;
      if (canUpload) {
        try { url = await uploadImage(src, `${plan.slug}-${n}`); } catch { url = null; }
      }
      if (url) {
        img.setAttribute('src', resolveMediaUrl(url));
        if (!img.getAttribute('alt')) img.setAttribute('alt', post.title);
      } else {
        img.remove();
        notes.push('a picture couldn’t be uploaded');
      }
    }

    // 2. Featured image.
    let featuredImage = plan.featuredUrl;
    if (post.featuredImageData && canUpload) {
      try { featuredImage = (await uploadImage(post.featuredImageData, `${plan.slug}-featured`)) ?? undefined; } catch { featuredImage = undefined; }
      if (!featuredImage) notes.push('the featured image couldn’t be uploaded');
    }

    // 3. Create the post (renaming the slug on a clash if asked to).
    const categoryIds = [
      ...plan.categoryIds,
      ...plan.newCategories.map((name) => categoryMap.get(name.toLowerCase())).filter((id): id is number => !!id),
    ];
    const f = post.fields;
    const input: PostInput = {
      title: post.title,
      slug: plan.slug,
      content: doc.body.innerHTML,
      excerpt: f.excerpt?.trim() || undefined,
      type: 'post',
      status: plan.status,
      scheduledFor: plan.scheduledFor ? plan.scheduledFor.toISOString() : null,
      publishedAt: plan.publishedAt ? plan.publishedAt.toISOString() : undefined,
      featuredImage,
      isFeatured: plan.isFeatured,
      categoryIds,
      tagNames: plan.tags,
      metaTitle: f.metaTitle?.trim() || undefined,
      metaDescription: f.metaDescription?.trim() || undefined,
    };

    let created: Post | undefined;
    for (let attempt = 1; !created; attempt++) {
      try {
        created = await withRateLimitRetry(() => createPost(input), (s) => setWaitNote(`Server is busy — continuing in ${s}s…`));
        setWaitNote('');
      } catch (err) {
        const status = (err as AxiosError).response?.status;
        if (status === 409) {
          if (options.onDuplicate === 'skip') return { state: 'skipped', message: 'A post with this slug already exists.' };
          if (attempt < 20) { input.slug = `${plan.slug}-${attempt + 1}`; continue; }
        }
        throw err;
      }
    }
    if (!created) throw new Error('Import failed');

    // 4. Hand the post to its author (create always uses the importing user).
    if (plan.authorId) {
      try { await updatePost(created.id, { authorId: plan.authorId }); } catch { notes.push('the author couldn’t be changed'); }
    }

    return {
      state: 'done',
      postId: created.id,
      publicUrl: created.status === 'published' ? created.publicUrl : undefined,
      message: [input.slug !== plan.slug ? `saved as /${input.slug}` : '', ...notes].filter(Boolean).join(' · ') || undefined,
    };
  }

  async function startImport() {
    if (toImport.length === 0) return;
    const publishing = toImport.filter((r) => plans.get(r.key)!.status === 'published').length;
    if (publishing && !(await confirm({
      title: `Publish ${publishing} post${publishing === 1 ? '' : 's'} right away?`,
      message: `${publishing} of the ${toImport.length} posts will go live on the site as soon as they’re imported. Turn on “Import everything as drafts” if you’d like to review them first.`,
      confirmLabel: 'Import and publish',
    }))) return;

    cancelRef.current = false;
    setRunning(true);
    setPhase('run');
    const initial: Record<string, RunState> = {};
    for (const r of rows) {
      if (!r.include) continue;
      const plan = plans.get(r.key)!;
      initial[r.key] = plan.errors.length
        ? { state: 'skipped', message: 'Has errors' }
        : plan.slugTaken && options.onDuplicate === 'skip'
          ? { state: 'skipped', message: 'A post with this slug already exists.' }
          : { state: 'pending' };
    }
    setRun(initial);

    // Create any new categories once, up front.
    const categoryMap = new Map<string, number>();
    if (options.createCategories && canCreateCategory) {
      const names = new Map<string, string>();
      for (const r of toImport) for (const n of plans.get(r.key)!.newCategories) names.set(n.toLowerCase(), n);
      for (const [lower, name] of names) {
        try {
          const c = await createCategory({ name });
          categoryMap.set(lower, c.id);
        } catch (err) {
          toast.error(errorMessage(err, `Couldn’t create category “${name}”`));
        }
      }
      if (names.size) fetchCategories(1, 500).then((r) => setCategories(r.items)).catch(() => {});
    }

    for (const row of toImport) {
      if (cancelRef.current) {
        setRun((s) => ({ ...s, [row.key]: { state: 'skipped', message: 'Stopped before import' } }));
        continue;
      }
      setRun((s) => ({ ...s, [row.key]: { state: 'working' } }));
      let result: RunState;
      try {
        result = await importOne(row, plans.get(row.key)!, categoryMap);
      } catch (err) {
        result = { state: 'failed', message: errorMessage(err, 'Import failed') };
      }
      setRun((s) => ({ ...s, [row.key]: result }));
    }

    setWaitNote('');
    setRunning(false);
  }

  function reset() {
    setRows([]);
    setRun({});
    setFileNotes([]);
    setExistingSlugs(new Set());
    setExpanded(new Set());
    setPhase('upload');
  }

  /* ── Derived counts ── */

  const counts = useMemo(() => {
    let errors = 0, warnings = 0, ready = 0;
    for (const r of rows) {
      const p = plans.get(r.key)!;
      if (p.errors.length) errors++;
      else if (p.warnings.length) warnings++;
      else ready++;
    }
    return { errors, warnings, ready };
  }, [rows, plans]);

  const runValues = Object.values(run);
  const done = runValues.filter((r) => r.state === 'done').length;
  const failed = runValues.filter((r) => r.state === 'failed').length;
  const skipped = runValues.filter((r) => r.state === 'skipped').length;
  const finished = runValues.filter((r) => r.state !== 'pending' && r.state !== 'working').length;
  const progress = runValues.length ? Math.round((finished / runValues.length) * 100) : 0;
  const allDrafts = rows.every((r) => !r.include || plans.get(r.key)?.status === 'draft');

  const stepIndex = phase === 'upload' ? 1 : phase === 'review' ? 2 : 3;

  return (
    <AdminLayout>
      <PageHeader
        title="Import posts"
        subtitle="Write many posts in one Word document, then upload it to create them all at once."
        actions={
          <Button icon={faDownload} onClick={downloadTemplate} disabled={downloading}>
            {downloading ? 'Preparing…' : 'Download template'}
          </Button>
        }
      />

      <ol className={styles.steps} aria-label="Import steps">
        {['Download the template', 'Fill it in & upload', 'Review', 'Import'].map((label, i) => {
          const n = i;
          const state = n < stepIndex ? 'done' : n === stepIndex ? 'current' : 'todo';
          return (
            <li key={label} className={`${styles.step} ${styles[`step_${state}`]}`} aria-current={state === 'current' ? 'step' : undefined}>
              <span className={styles.stepNum}>{state === 'done' ? <FontAwesomeIcon icon={faCircleCheck} /> : i + 1}</span>
              {label}
            </li>
          );
        })}
      </ol>

      {/* ── 1–2. Upload ── */}
      {phase === 'upload' && (
        <div className={styles.uploadGrid}>
          <div>
            <button
              type="button"
              className={`${styles.drop} ${dragging ? styles.dropOn : ''}`}
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
              onDrop={onDrop}
              disabled={parsing}
            >
              <FontAwesomeIcon icon={parsing ? faSpinner : faCloudArrowUp} spin={parsing} className={styles.dropIcon} />
              <strong>{parsing ? 'Reading your document…' : 'Drop your filled-in .docx here'}</strong>
              <span>or click to choose files — you can upload several documents at once</span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              multiple
              hidden
              onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }}
            />
            {fileNotes.length > 0 && (
              <div className={styles.noteBox} role="alert">
                {fileNotes.map((n) => <p key={n}><FontAwesomeIcon icon={faCircleXmark} /> {n}</p>)}
              </div>
            )}

            <Card className={styles.howCard}>
              <h2 className={styles.cardTitle}><FontAwesomeIcon icon={faFileWord} /> How the template works</h2>
              <div className={styles.anatomy} aria-hidden="true">
                <div className={styles.anH1}>Your post title <em>Heading 1</em></div>
                <div className={styles.anTable}>
                  <span>Status</span><span>draft</span>
                  <span>Categories</span><span>News, Events</span>
                  <span>Tags</span><span>launch, community</span>
                </div>
                <div className={styles.anBody}>
                  <span />
                  <span />
                  <span className={styles.anShort} />
                </div>
                <div className={styles.anH1}>Next post title <em>Heading 1</em></div>
              </div>
              <ol className={styles.howList}>
                <li>Each post begins with its <strong>title in the Heading 1 style</strong>.</li>
                <li>The <strong>details table</strong> under the title sets status, categories, tags and more. Blank values use defaults.</li>
                <li>Everything below the table is the <strong>post body</strong>. Headings, bold, links, lists, quotes and pictures are kept.</li>
                <li>Copy an example to add more posts. The instructions page at the top is ignored.</li>
              </ol>
              <Button variant="primary" icon={faDownload} onClick={downloadTemplate} disabled={downloading}>
                Download the Word template
              </Button>
            </Card>
          </div>

          <Card className={styles.fieldsCard}>
            <h2 className={styles.cardTitle}>Details table fields</h2>
            <dl className={styles.fields}>
              {FIELDS.map((f) => (
                <div key={f.key}>
                  <dt>{f.label}</dt>
                  <dd>{f.hint}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      )}

      {/* ── 3. Review ── */}
      {phase === 'review' && (
        <>
          <div className={styles.summary}>
            <span><strong>{rows.length}</strong> post{rows.length === 1 ? '' : 's'} found</span>
            {counts.ready > 0 && <StatusBadge tone="success">{counts.ready} ready</StatusBadge>}
            {counts.warnings > 0 && <StatusBadge tone="warning">{counts.warnings} with notes</StatusBadge>}
            {counts.errors > 0 && <StatusBadge tone="danger">{counts.errors} need fixing</StatusBadge>}
            {checking && <span className={styles.checking}><FontAwesomeIcon icon={faSpinner} spin /> Checking for existing posts…</span>}
          </div>

          {fileNotes.length > 0 && (
            <div className={styles.noteBox} role="alert">
              {fileNotes.map((n) => <p key={n}><FontAwesomeIcon icon={faTriangleExclamation} /> {n}</p>)}
            </div>
          )}

          <Card className={styles.optionsCard}>
            <label className={styles.option}>
              <input type="checkbox" checked={options.forceDraft} onChange={(e) => setOptions((o) => ({ ...o, forceDraft: e.target.checked }))} />
              <span>
                <strong>Import everything as drafts</strong>
                <small>Ignore the Status column so you can review each post before it goes live.</small>
              </span>
            </label>
            <label className={styles.option}>
              <input
                type="checkbox"
                checked={options.createCategories && canCreateCategory}
                disabled={!canCreateCategory}
                onChange={(e) => setOptions((o) => ({ ...o, createCategories: e.target.checked }))}
              />
              <span>
                <strong>Create missing categories</strong>
                <small>{canCreateCategory ? 'Otherwise unknown categories are left off the post.' : 'You don’t have permission to create categories.'}</small>
              </span>
            </label>
            <div className={styles.option}>
              <span>
                <strong>When a post with the same slug exists</strong>
                <span className={styles.radioRow} role="radiogroup" aria-label="Duplicate handling">
                  {([['skip', 'Skip it'], ['rename', 'Import with a new slug']] as const).map(([v, l]) => (
                    <label key={v}>
                      <input type="radio" name="dup" checked={options.onDuplicate === v} onChange={() => setOptions((o) => ({ ...o, onDuplicate: v }))} />
                      {l}
                    </label>
                  ))}
                </span>
              </span>
            </div>
          </Card>

          <Card>
            <div className={styles.listHead}>
              <Checkbox
                label="Select all importable posts"
                checked={rows.filter((r) => !plans.get(r.key)!.errors.length).every((r) => r.include)}
                indeterminate={rows.some((r) => r.include) && !rows.filter((r) => !plans.get(r.key)!.errors.length).every((r) => r.include)}
                onChange={() => {
                  const allOn = rows.filter((r) => !plans.get(r.key)!.errors.length).every((r) => r.include);
                  setRows((rs) => rs.map((r) => ({ ...r, include: !allOn && !plans.get(r.key)!.errors.length })));
                }}
              />
              <span>{selected.length} selected</span>
            </div>
            <ul className={styles.postList}>
              {rows.map((row) => {
                const plan = plans.get(row.key)!;
                const isOpen = expanded.has(row.key);
                const hasErrors = plan.errors.length > 0;
                const isExample = EXAMPLE_TITLES.has(row.post.title.toLowerCase());
                return (
                  <li key={row.key} className={`${styles.postItem} ${hasErrors ? styles.postError : ''} ${!row.include ? styles.postOff : ''}`}>
                    <div className={styles.postMain}>
                      <Checkbox
                        label={`Import ${row.post.title}`}
                        checked={row.include && !hasErrors}
                        onChange={() => { if (!hasErrors) setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, include: !r.include } : r))); }}
                      />
                      <div className={styles.postBody}>
                        <div className={styles.postTitleRow}>
                          <button
                            type="button"
                            className={styles.postTitle}
                            onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(row.key)) n.delete(row.key); else n.add(row.key); return n; })}
                            aria-expanded={isOpen}
                          >
                            <FontAwesomeIcon icon={isOpen ? faChevronDown : faChevronRight} className={styles.chev} />
                            {row.post.title || <em>(no title)</em>}
                          </button>
                          {isExample && <span className={styles.exampleTag}>Template example</span>}
                        </div>
                        <div className={styles.meta}>
                          <StatusBadge tone={plan.status === 'published' ? 'success' : plan.status === 'scheduled' ? 'warning' : 'neutral'}>
                            {plan.status === 'scheduled' && plan.scheduledFor
                              ? `Scheduled · ${plan.scheduledFor.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
                              : plan.status === 'published' && plan.publishedAt
                                ? `Published · dated ${plan.publishedAt.toLocaleDateString(undefined, { dateStyle: 'medium' })}`
                                : plan.status[0].toUpperCase() + plan.status.slice(1)}
                          </StatusBadge>
                          <span className={styles.slug}>/{plan.slug || '—'}</span>
                          {plan.categoryIds.map((id) => {
                            const c = categories.find((x) => x.id === id);
                            return c ? <span key={id} className={styles.cat}>{c.name}</span> : null;
                          })}
                          {plan.newCategories.map((n) => (
                            <span key={n} className={`${styles.cat} ${options.createCategories && canCreateCategory ? styles.catNew : styles.catSkip}`}>
                              {options.createCategories && canCreateCategory ? `+ ${n}` : n}
                            </span>
                          ))}
                          {plan.tags.map((t) => <span key={t} className={styles.tag}>#{t}</span>)}
                          {plan.isFeatured && <span className={styles.metaItem}><FontAwesomeIcon icon={faStar} /> Featured</span>}
                          <span className={styles.metaItem}>{row.post.wordCount} words</span>
                          {row.post.imageCount > 0 && <span className={styles.metaItem}><FontAwesomeIcon icon={faImage} /> {row.post.imageCount}</span>}
                          <span className={styles.metaItem}>by {plan.authorName}</span>
                          <span className={styles.metaItem}>{row.post.file}</span>
                        </div>
                        {(plan.errors.length > 0 || plan.warnings.length > 0) && (
                          <ul className={styles.issues}>
                            {plan.errors.map((e) => <li key={e} className={styles.issueError}><FontAwesomeIcon icon={faCircleXmark} /> {e}</li>)}
                            {plan.warnings.map((w) => <li key={w} className={styles.issueWarn}><FontAwesomeIcon icon={faTriangleExclamation} /> {w}</li>)}
                          </ul>
                        )}
                      </div>
                    </div>
                    {isOpen && (
                      <div className={styles.preview}>
                        {(row.post.featuredImageData || plan.featuredUrl) && (
                          <img className={styles.previewCover} src={row.post.featuredImageData || resolveMediaUrl(plan.featuredUrl)} alt="" />
                        )}
                        {row.post.fields.excerpt && <p className={styles.previewExcerpt}>{row.post.fields.excerpt}</p>}
                        {/* Sanitised in parseDocx: only basic formatting, safe links and data:/https images remain. */}
                        <div className={styles.prose} dangerouslySetInnerHTML={{ __html: row.post.html ? sanitizeHtml(row.post.html) : '<p><em>No body text</em></p>' }} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          <div className={styles.footerBar}>
            <Button variant="ghost" icon={faRotateLeft} onClick={reset}>Start over</Button>
            <span className={styles.footerInfo}>
              {toImport.length} post{toImport.length === 1 ? '' : 's'} will be imported
              {selected.length > toImport.length && ` · ${selected.length - toImport.length} skipped (already exist)`}
            </span>
            <Button variant="primary" icon={faArrowRight} onClick={startImport} disabled={toImport.length === 0 || checking}>
              Import {toImport.length} post{toImport.length === 1 ? '' : 's'}
            </Button>
          </div>
        </>
      )}

      {/* ── 4. Import progress & results ── */}
      {phase === 'run' && (
        <>
          <Card className={styles.runCard}>
            <div className={styles.runHead}>
              <div>
                <h2 className={styles.cardTitle}>
                  {running ? `Importing… ${finished} of ${runValues.length}` : 'Import finished'}
                </h2>
                <p className={styles.runSummary}>
                  <span className={styles.ok}>{done} imported</span>
                  {skipped > 0 && <span> · {skipped} skipped</span>}
                  {failed > 0 && <span className={styles.bad}> · {failed} failed</span>}
                  {waitNote && <span> · {waitNote}</span>}
                </p>
              </div>
              {running ? (
                <Button variant="danger" icon={faForwardStep} onClick={() => { cancelRef.current = true; }}>Stop after this post</Button>
              ) : (
                <div className={styles.runActions}>
                  <Button icon={faRotateLeft} onClick={reset}>Import another document</Button>
                  <Button variant="primary" icon={faArrowRight} onClick={() => navigate(allDrafts ? '/admin/posts?status=draft' : '/admin/posts')}>
                    View posts
                  </Button>
                </div>
              )}
            </div>
            <div className={styles.bar} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${progress}%` }} />
            </div>
          </Card>

          <Card>
            <ul className={styles.postList}>
              {rows.filter((r) => run[r.key]).map((row) => {
                const r = run[row.key];
                const icon = r.state === 'done' ? faCircleCheck : r.state === 'failed' ? faCircleXmark : r.state === 'working' ? faSpinner : r.state === 'skipped' ? faForwardStep : faCircleInfo;
                return (
                  <li key={row.key} className={`${styles.runItem} ${styles[`run_${r.state}`]}`}>
                    <FontAwesomeIcon icon={icon} spin={r.state === 'working'} className={styles.runIcon} />
                    <div className={styles.runText}>
                      <strong>{row.post.title}</strong>
                      <span>
                        {r.state === 'pending' && 'Waiting'}
                        {r.state === 'working' && 'Uploading pictures and creating the post…'}
                        {r.state === 'done' && `Imported as ${plans.get(row.key)!.status}`}
                        {r.state === 'skipped' && 'Skipped'}
                        {r.state === 'failed' && 'Failed'}
                        {r.message && ` — ${r.message}`}
                      </span>
                    </div>
                    {r.postId && (
                      <span className={styles.runLinks}>
                        <Link to={`/admin/posts/${r.postId}/edit`}><FontAwesomeIcon icon={faPen} /> Edit</Link>
                        {r.publicUrl && <a href={r.publicUrl} target="_blank" rel="noopener noreferrer">View</a>}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}
    </AdminLayout>
  );
}
