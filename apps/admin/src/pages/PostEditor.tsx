import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AxiosError } from 'axios';
import ReactQuill, { Quill } from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { slugify, PERMISSIONS } from '@headtilts/shared';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faArrowUpRightFromSquare, faPlus, faMinus, faBold, faCode, faTag, faHistory, faArchive } from '@fortawesome/free-solid-svg-icons';
import { fetchRevisions, archiveRevision } from '../services/revisions';
import { PostRevision } from '../types';
import { AdminLayout } from '../components/AdminLayout';
import { useToast } from '../components/ToastContext';
import { ImageToolbar } from '../components/ImageToolbar';
import { MediaLibraryModal } from '../components/MediaLibraryModal';
import { MediaPickerInput } from '../components/MediaPickerInput';
import { useAuth } from '../hooks/useAuth';
import { Category, Post } from '../types';
import { fetchCategories } from '../services/categories';
import { resolveMediaUrl } from '../services/media';
import { createPost, fetchPost, fetchPosts, fetchPreviewLink, updatePost, fetchAuthorList, PostInput, AuthorListItem } from '../services/posts';
import styles from './PostEditor.module.css';

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', hr: '---', bulletListMarker: '-' });

function mdToHtml(src: string): string {
  const result = marked.parse(src);
  return typeof result === 'string' ? result : String(result);
}

// Stable ref so QUILL_MODULES never changes identity (prevents Quill re-init on re-render)
// while the handler always calls the current component logic.
const quillImageHandlerRef = { current: (() => {}) as () => void };

const QUILL_MODULES = {
  toolbar: {
    container: [
      [{ header: [1, 2, 3, 4, 5, 6, false] }],
      [{ font: [] }, { size: ['small', false, 'large', 'huge'] }],
      ['bold', 'italic', 'underline', 'strike', 'code'],
      [{ color: [] }, { background: [] }],
      [{ script: 'sub' }, { script: 'super' }],
      [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }],
      [{ indent: '-1' }, { indent: '+1' }],
      [{ align: [] }],
      ['blockquote', 'code-block'],
      ['link', 'image', 'video'],
      ['clean'],
    ],
    handlers: {
      image: () => quillImageHandlerRef.current(),
    },
  },
};

const QUILL_FORMATS = [
  'header', 'font', 'size',
  'bold', 'italic', 'underline', 'strike', 'code',
  'color', 'background',
  'script',
  'list', 'indent',
  'align',
  'blockquote', 'code-block',
  'link', 'image', 'video',
  'style',
];

// Extend the built-in image blot to preserve the `style` attribute through
// Quill's HTML→delta→HTML round-trip so inline alignment/sizing survives saves.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const QuillImageBase = Quill.import('formats/image') as any;
class StyledImage extends QuillImageBase {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static formats(domNode: HTMLElement): Record<string, any> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const formats = QuillImageBase.formats(domNode) as Record<string, any>;
    const style = domNode.getAttribute('style');
    if (style) formats['style'] = style;
    return formats;
  }
  format(name: string, value: string | boolean) {
    if (name === 'style') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const node = (this as any).domNode as HTMLElement;
      if (value) node.setAttribute('style', value as string);
      else node.removeAttribute('style');
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    super.format(name, value);
  }
}
StyledImage.blotName = 'image';
StyledImage.tagName = 'IMG';
Quill.register(StyledImage, true);

interface ScEntry { tag: string; description: string; example: string }
interface ScSection { category: string; shortcodes: ScEntry[] }

const SHORTCODE_DOCS: ScSection[] = [
  {
    category: 'Site Info',
    shortcodes: [
      { tag: '[site_name]',        description: 'Site title from Settings → General.',                                    example: 'e.g. Headtilts' },
      { tag: '[site_tagline]',     description: 'Site tagline / slogan.',                                                  example: 'e.g. Music for the ears' },
      { tag: '[site_description]', description: 'Full site description (used for SEO).',                                   example: 'e.g. A music webzine…' },
      { tag: '[site_url]',         description: 'Base URL of the public website.',                                         example: 'e.g. https://headtilts.com' },
    ],
  },
  {
    category: 'Date & Time',
    shortcodes: [
      { tag: '[year]',                        description: 'Current 4-digit year. Ideal for copyright notices.',                        example: 'e.g. 2026' },
      { tag: '[current_date]',                description: "Today's date in the site's configured date format.",                         example: 'e.g. June 16, 2026' },
      { tag: '[current_date format="j M Y"]', description: 'Today with a custom PHP-style format (see reference below).',               example: 'e.g. 16 Jun 2026' },
    ],
  },
  {
    category: 'Post / Page',
    shortcodes: [
      { tag: '[post_title]',             description: 'Title of the current post or page.',                                             example: 'e.g. My First Post' },
      { tag: '[post_author]',            description: "Author's display name (first + last, or username).",                             example: 'e.g. Jane Doe' },
      { tag: '[post_date]',              description: "Post's publish date in the site's date format.",                                  example: 'e.g. June 16, 2026' },
      { tag: '[post_date format="Y"]',   description: "Post's publish date with a custom PHP-style format.",                            example: 'e.g. 2026' },
      { tag: '[post_excerpt]',           description: "Post's excerpt text. Empty string if no excerpt is set.",                        example: 'e.g. A short summary…' },
    ],
  },
];

const DATE_FORMAT_TOKENS: { token: string; meaning: string }[] = [
  { token: 'Y', meaning: '4-digit year' },
  { token: 'y', meaning: '2-digit year' },
  { token: 'F', meaning: 'Full month name' },
  { token: 'M', meaning: 'Short month (Jan)' },
  { token: 'm', meaning: 'Month 01–12' },
  { token: 'n', meaning: 'Month 1–12' },
  { token: 'd', meaning: 'Day 01–31' },
  { token: 'j', meaning: 'Day 1–31' },
  { token: 'l', meaning: 'Full weekday' },
  { token: 'D', meaning: 'Short weekday' },
  { token: 'H', meaning: 'Hour 00–23' },
  { token: 'h', meaning: 'Hour 01–12' },
  { token: 'i', meaning: 'Minutes 00–59' },
  { token: 'a', meaning: 'am / pm' },
  { token: 'A', meaning: 'AM / PM' },
];

const ACTION_LABELS: Record<string, string> = {
  created: 'Created',
  updated: 'Updated',
  published: 'Published',
  unpublished: 'Unpublished',
  scheduled: 'Scheduled',
  trashed: 'Trashed',
};

const ACTION_BADGE_CLASS: Record<string, string> = {
  created: 'badgeCreated',
  updated: 'badgeUpdated',
  published: 'badgePublished',
  unpublished: 'badgeUnpublished',
  scheduled: 'badgeScheduled',
  trashed: 'badgeTrashed',
};

function revUserName(user: PostRevision['user']): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return name || user.username;
}

function revUserInitials(user: PostRevision['user']): string {
  if (user.firstName) return (user.firstName[0] + (user.lastName?.[0] ?? '')).toUpperCase();
  return user.username.slice(0, 2).toUpperCase();
}

function revTimeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const sec = Math.floor((Date.now() - then) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'scheduled', label: 'Scheduled' },
];

function toDatetimeLocal(value?: string | null): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface CategoryNode {
  category: Category;
  depth: number;
}

function buildCategoryTree(categories: Category[]): CategoryNode[] {
  const byParent = new Map<number | null, Category[]>();
  for (const category of categories) {
    const key = category.parentId ?? null;
    if (!byParent.has(key)) {
      byParent.set(key, []);
    }
    byParent.get(key)!.push(category);
  }

  const result: CategoryNode[] = [];
  function walk(parentId: number | null, depth: number) {
    for (const category of byParent.get(parentId) || []) {
      result.push({ category, depth });
      walk(category.id, depth + 1);
    }
  }
  walk(null, 0);

  return result;
}

function errorMessage(err: unknown, fallback: string): string {
  return (
    (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback
  );
}

interface PostEditorPageProps {
  contentType?: 'post' | 'page';
}

export default function PostEditorPage({ contentType = 'post' }: PostEditorPageProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const toast = useToast();
  const isEditing = !!id;
  const canPublish         = hasPermission(PERMISSIONS.POST_PUBLISH);
  const canViewRevisions   = hasPermission(PERMISSIONS.REVISION_READ);
  const canArchiveRevisions = hasPermission(PERMISSIONS.REVISION_ARCHIVE);
  const isPage = contentType === 'page';

  const listPath = isPage ? '/admin/pages' : '/admin/posts';

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(isEditing);
  const [loadError, setLoadError] = useState('');

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [status, setStatus] = useState('draft');
  const [scheduledFor, setScheduledFor] = useState('');
  const [featuredImage, setFeaturedImage] = useState('');
  const [template, setTemplate] = useState<string>('');
  const [isFeatured, setIsFeatured] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [commentStatus, setCommentStatus] = useState<'default' | 'open' | 'closed'>('default');
  const [parentId, setParentId] = useState<number | null>(null);
  const [parentPages, setParentPages] = useState<Post[]>([]);
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [inlineMediaModalOpen, setInlineMediaModalOpen] = useState(false);
  const quillRef = useRef<ReactQuill>(null);
  const inlineInsertRange = useRef<{ index: number; length: number }>({ index: 0, length: 0 });
  const [selectedImage, setSelectedImage] = useState<{ imgEl: HTMLImageElement; style: string } | null>(null);
  const [tagsInput, setTagsInput] = useState('');
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);

  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [metaKeywords, setMetaKeywords] = useState('');
  const [canonicalUrl, setCanonicalUrl] = useState('');
  const [ogTitle, setOgTitle] = useState('');
  const [ogDescription, setOgDescription] = useState('');
  const [ogImage, setOgImage] = useState('');
  const [seoOpen, setSeoOpen] = useState(false);

  const [editorMode, setEditorMode] = useState<'visual' | 'markdown'>('visual');
  const [markdownSource, setMarkdownSource] = useState('');
  const markdownTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [shortcodesOpen, setShortcodesOpen] = useState(false);
  const [revisions, setRevisions] = useState<PostRevision[]>([]);
  const [showArchivedRevisions, setShowArchivedRevisions] = useState(false);

  const [selectedAuthorId, setSelectedAuthorId] = useState<string>('');
  const [selectedCoAuthorIds, setSelectedCoAuthorIds] = useState<string[]>([]);
  const [authorList, setAuthorList] = useState<AuthorListItem[]>([]);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isPage) {
      loadCategories();
    }
    if (isPage) {
      loadParentPages();
    }
    fetchAuthorList().then(setAuthorList).catch(() => {});
  }, []);

  useEffect(() => {
    if (isEditing) {
      loadPost(Number(id));
    }
  }, [id]);

  // Detect clicks on images inside the Quill editor to show the align/size toolbar.
  // Depends on `loading` so it re-runs once the editor renders after a post loads in edit mode.
  useEffect(() => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;
    const handleClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName === 'IMG') {
        const imgEl = e.target as HTMLImageElement;
        setSelectedImage({ imgEl, style: imgEl.getAttribute('style') ?? '' });
      } else {
        setSelectedImage(null);
      }
    };
    quill.root.addEventListener('click', handleClick);
    return () => quill.root.removeEventListener('click', handleClick);
  }, [loading, editorMode]);

  // Close the image toolbar when clicking outside the editor and outside the toolbar.
  useEffect(() => {
    if (!selectedImage) return;
    const handleOutside = (e: MouseEvent) => {
      const quillRoot = quillRef.current?.getEditor()?.root;
      const target = e.target as Node;
      if (quillRoot?.contains(target)) return;
      if ((target as HTMLElement).closest?.('[data-image-toolbar]')) return;
      setSelectedImage(null);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [selectedImage]);

  // Add a selection outline to the active image; clean up when it changes or deselects.
  useEffect(() => {
    const imgEl = selectedImage?.imgEl;
    if (!imgEl) return;
    imgEl.classList.add('ql-selected-image');
    return () => imgEl.classList.remove('ql-selected-image');
  }, [selectedImage?.imgEl]);

  // Keep the module-level handler ref pointing at the current closure every render.
  quillImageHandlerRef.current = () => {
    const quill = quillRef.current?.getEditor();
    const range = quill?.getSelection(true);
    inlineInsertRange.current = range
      ? { index: range.index, length: range.length }
      : { index: quill?.getLength() ?? 0, length: 0 };
    setInlineMediaModalOpen(true);
  };

  async function loadCategories() {
    try {
      const result = await fetchCategories(1, 200);
      setAllCategories(result.items);
    } catch {
      setAllCategories([]);
    }
  }

  async function loadParentPages() {
    try {
      const result = await fetchPosts(1, 200, { type: 'page', status: 'published' });
      setParentPages(result.items);
    } catch {
      setParentPages([]);
    }
  }

  async function loadPost(postId: number) {
    setLoading(true);
    setLoadError('');
    try {
      const loaded = await fetchPost(postId);
      applyPost(loaded);
      loadRevisions(postId).catch(() => {});
    } catch (err: unknown) {
      setLoadError(errorMessage(err, `Failed to load ${isPage ? 'page' : 'post'}`));
    } finally {
      setLoading(false);
    }
  }

  function applyPost(loaded: Post) {
    setPost(loaded);
    setTitle(loaded.title);
    setSlug(loaded.slug);
    setSlugTouched(true);
    setContent(loaded.content || '');
    setExcerpt(loaded.excerpt || '');
    setStatus(loaded.status === 'trash' ? 'draft' : loaded.status);
    setScheduledFor(toDatetimeLocal(loaded.scheduledFor));
    setFeaturedImage(loaded.featuredImage || '');
    setTemplate(loaded.template || '');
    setIsFeatured(loaded.isFeatured ?? false);
    setShowSidebar(loaded.showSidebar ?? false);
    setCommentStatus(loaded.commentStatus === 'open' || loaded.commentStatus === 'closed' ? loaded.commentStatus : 'default');
    setParentId(loaded.parentId ?? null);
    setTagsInput(loaded.tags.map(({ tag }) => tag.name).join(', '));
    setCategoryIds(loaded.categories.map(({ category }) => category.id));
    setMetaTitle(loaded.metaTitle || '');
    setMetaDescription(loaded.metaDescription || '');
    setMetaKeywords(loaded.metaKeywords || '');
    setCanonicalUrl(loaded.canonicalUrl || '');
    setOgTitle(loaded.ogTitle || '');
    setOgDescription(loaded.ogDescription || '');
    setOgImage(loaded.ogImage || '');
    setSelectedAuthorId(loaded.authorId || (loaded.author?.id ? String(loaded.author.id) : ''));
    setSelectedCoAuthorIds((loaded.coAuthors ?? []).map((ca) => String(ca.user.id)));
  }

  function applyImageStyle(style: string) {
    const quill = quillRef.current?.getEditor();
    if (!quill || !selectedImage) return;

    // Update style state immediately so the toolbar reflects the new state right away.
    setSelectedImage((prev) => (prev ? { ...prev, style } : null));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blot = (quill.scroll as any).find(selectedImage.imgEl) as any;
    if (!blot) return;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const idx = quill.getIndex(blot);
    const srcUrl = selectedImage.imgEl.getAttribute('src') ?? '';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Delta = Quill.import('delta') as any;
    const attrs = style ? { style } : {};
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    quill.updateContents(new Delta().retain(idx).delete(1).insert({ image: srcUrl }, attrs), 'user');

    // Re-find the new <img> DOM node after Quill recreates the blot.
    requestAnimationFrame(() => {
      const newImg = Array.from(quill.root.querySelectorAll<HTMLImageElement>('img')).find(
        (img) => img.getAttribute('src') === srcUrl,
      );
      setSelectedImage(newImg ? { imgEl: newImg, style } : null);
    });
  }

  function handleModeChange(mode: 'visual' | 'markdown') {
    if (mode === editorMode) return;
    if (mode === 'markdown') {
      setMarkdownSource(content ? turndown.turndown(content) : '');
    } else {
      setContent(markdownSource ? mdToHtml(markdownSource) : content);
    }
    setEditorMode(mode);
  }

  function handleMarkdownChange(value: string) {
    setMarkdownSource(value);
    setContent(mdToHtml(value));
  }

  function insertShortcode(tag: string) {
    if (editorMode === 'markdown') {
      const ta = markdownTextareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = markdownSource.slice(0, start) + tag + markdownSource.slice(end);
      handleMarkdownChange(next);
      // Restore focus and cursor after React re-renders.
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(start + tag.length, start + tag.length);
      });
    } else {
      const quill = quillRef.current?.getEditor();
      if (!quill) return;
      const range = quill.getSelection(true) ?? { index: quill.getLength(), length: 0 };
      quill.insertText(range.index, tag, 'user');
      quill.setSelection(range.index + tag.length, 0, 'user');
    }
  }

  const loadRevisions = useCallback(async (postId: number, withArchived = showArchivedRevisions) => {
    try {
      const data = await fetchRevisions(postId, withArchived);
      setRevisions(data);
    } catch {
      // non-blocking
    }
  }, [showArchivedRevisions]);

  async function handleArchiveRevision(revId: number) {
    if (!post) return;
    await archiveRevision(post.id, revId);
    setRevisions((prev) => prev.map((r) => r.id === revId ? { ...r, isArchived: true } : r));
  }

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!slugTouched) {
      setSlug(slugify(value));
    }
  }

  function toggleCategory(categoryId: number) {
    setCategoryIds((prev) =>
      prev.includes(categoryId) ? prev.filter((existing) => existing !== categoryId) : [...prev, categoryId]
    );
  }

  function buildInput(targetStatus: string): PostInput {
    const tagNames = tagsInput
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0);

    return {
      title,
      slug: slug || undefined,
      content,
      excerpt: excerpt || undefined,
      type: contentType,
      parentId: isPage ? parentId : undefined,
      status: targetStatus,
      scheduledFor:
        targetStatus === 'scheduled' && scheduledFor ? new Date(scheduledFor).toISOString() : null,
      featuredImage: featuredImage || undefined,
      template: isPage ? (template || null) : undefined,
      isFeatured: isPage ? undefined : isFeatured,
      showSidebar,
      commentStatus: isPage ? undefined : (commentStatus === 'default' ? null : commentStatus),
      categoryIds: isPage ? [] : categoryIds,
      tagNames: isPage ? [] : tagNames,
      authorId: selectedAuthorId || null,
      coAuthorIds: selectedCoAuthorIds,
      metaTitle: metaTitle || undefined,
      metaDescription: metaDescription || undefined,
      metaKeywords: metaKeywords || undefined,
      canonicalUrl: canonicalUrl || undefined,
      ogTitle: ogTitle || undefined,
      ogDescription: ogDescription || undefined,
      ogImage: ogImage || undefined,
    };
  }

  async function submitPost(targetStatus: string, successText: string): Promise<Post | null> {
    if (!title.trim()) {
      toast.error('Title is required');
      return null;
    }

    if (targetStatus === 'scheduled' && !scheduledFor) {
      toast.error(`Please choose a date and time to schedule this ${isPage ? 'page' : 'post'}`);
      return null;
    }

    setSaving(true);

    const input = buildInput(targetStatus);

    try {
      if (isEditing && post) {
        const updated = await updatePost(post.id, input);
        applyPost(updated);
        toast.success(successText);
        loadRevisions(updated.id).catch(() => {});
        return updated;
      }
      const created = await createPost(input);
      toast.success(successText);
      navigate(`${listPath}/${created.id}/edit`, { replace: true });
      // Revisions will load once the navigated-to edit page mounts
      return created;
    } catch (err: unknown) {
      toast.error(errorMessage(err, `Failed to save ${isPage ? 'page' : 'post'}`));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview() {
    // Open the tab synchronously so popup blockers allow it, then point it
    // at the signed preview URL once the draft is saved.
    const previewWindow = window.open('about:blank', '_blank');
    const saved = await submitPost('draft', 'Draft saved.');
    if (!saved) {
      previewWindow?.close();
      return;
    }
    try {
      const { url } = await fetchPreviewLink(saved.id);
      if (previewWindow) previewWindow.location.href = url;
    } catch (err: unknown) {
      previewWindow?.close();
      toast.error(errorMessage(err, 'Failed to create a preview link'));
    }
  }

  function handleSaveDraft() {
    submitPost('draft', 'Draft saved.');
  }

  function handlePrimaryAction() {
    if (status === 'scheduled') {
      submitPost('scheduled', `${isPage ? 'Page' : 'Post'} scheduled.`);
    } else if (status === 'published') {
      submitPost('published', isEditing ? `${isPage ? 'Page' : 'Post'} updated.` : `${isPage ? 'Page' : 'Post'} published.`);
    } else {
      submitPost('draft', 'Draft saved.');
    }
  }

  function primaryActionLabel(): string {
    if (status === 'scheduled') {
      return 'Schedule';
    }
    if (status === 'published') {
      return post?.status === 'published' ? 'Update' : 'Publish';
    }
    return isEditing ? 'Update' : 'Save Draft';
  }

  const categoryTree = buildCategoryTree(allCategories);
  const noun = isPage ? 'Page' : 'Post';

  if (loading) {
    return (
      <AdminLayout>
        <div className={styles.loading}>Loading {isPage ? 'page' : 'post'}…</div>
      </AdminLayout>
    );
  }

  if (loadError) {
    return (
      <AdminLayout>
        <div className={styles.error}>{loadError}</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className={styles.header}>
        <h2 className={styles.title}>{isEditing ? `Edit ${noun}` : `Add New ${noun}`}</h2>
        <button className={styles.backButton} onClick={() => navigate(listPath)}>
          <FontAwesomeIcon icon={faArrowLeft} /> Back to {noun}s
        </button>
      </div>


      <div className={styles.layout}>
        <div className={styles.contentColumn}>
          <input
            type="text"
            className={styles.titleInput}
            placeholder="Add title"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            disabled={saving}
          />

          <div className={styles.permalinkRow}>
            <span className={styles.permalinkLabel}>Permalink:</span>
            <span className={styles.permalinkBase}>/{isPage ? 'pages' : 'posts'}/</span>
            <input
              type="text"
              className={styles.permalinkInput}
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              placeholder={slugify(title)}
              disabled={saving}
            />
          </div>

          <div className={styles.editorTabs}>
            <button
              type="button"
              className={`${styles.editorTab}${editorMode === 'visual' ? ` ${styles.editorTabActive}` : ''}`}
              onClick={() => handleModeChange('visual')}
            >
              <FontAwesomeIcon icon={faBold} /> Visual
            </button>
            <button
              type="button"
              className={`${styles.editorTab}${editorMode === 'markdown' ? ` ${styles.editorTabActive}` : ''}`}
              onClick={() => handleModeChange('markdown')}
            >
              <FontAwesomeIcon icon={faCode} /> Markdown
            </button>
          </div>

          {editorMode === 'visual' ? (
            <div className={styles.editorWrapper}>
              <ReactQuill ref={quillRef} theme="snow" value={content} onChange={setContent} modules={QUILL_MODULES} formats={QUILL_FORMATS} />
            </div>
          ) : (
            <div className={styles.markdownPane}>
              <textarea
                ref={markdownTextareaRef}
                className={styles.markdownInput}
                value={markdownSource}
                onChange={(e) => handleMarkdownChange(e.target.value)}
                placeholder="Write Markdown here…&#10;&#10;# Heading&#10;**bold**, *italic*, `code`&#10;&#10;- list item"
                disabled={saving}
                spellCheck
              />
              <div
                className={styles.markdownPreview}
                dangerouslySetInnerHTML={{ __html: mdToHtml(markdownSource) }}
              />
            </div>
          )}

          <div className={styles.panel}>
            <h3>Excerpt</h3>
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={3}
              placeholder={`Optional short summary shown in ${isPage ? 'page' : 'post'} listings`}
              disabled={saving}
            />
          </div>

          <div className={styles.panel}>
            <button type="button" className={styles.seoToggle} onClick={() => setSeoOpen((open) => !open)}>
              <h3>SEO</h3>
              <span><FontAwesomeIcon icon={seoOpen ? faMinus : faPlus} /></span>
            </button>

            {seoOpen && (
              <div className={styles.seoFields}>
                <div className={styles.formGroup}>
                  <label>Meta Title</label>
                  <input type="text" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} disabled={saving} />
                </div>
                <div className={styles.formGroup}>
                  <label>Meta Description</label>
                  <textarea
                    value={metaDescription}
                    onChange={(e) => setMetaDescription(e.target.value)}
                    rows={2}
                    disabled={saving}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Meta Keywords</label>
                  <input
                    type="text"
                    value={metaKeywords}
                    onChange={(e) => setMetaKeywords(e.target.value)}
                    placeholder="Comma-separated"
                    disabled={saving}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Canonical URL</label>
                  <input type="text" value={canonicalUrl} onChange={(e) => setCanonicalUrl(e.target.value)} disabled={saving} />
                </div>
                <div className={styles.formGroup}>
                  <label>OG Title</label>
                  <input type="text" value={ogTitle} onChange={(e) => setOgTitle(e.target.value)} disabled={saving} />
                </div>
                <div className={styles.formGroup}>
                  <label>OG Description</label>
                  <textarea
                    value={ogDescription}
                    onChange={(e) => setOgDescription(e.target.value)}
                    rows={2}
                    disabled={saving}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>OG Image</label>
                  <MediaPickerInput
                    value={ogImage}
                    onChange={setOgImage}
                    disabled={saving}
                    placeholder="Paste URL or choose from library…"
                  />
                </div>
              </div>
            )}
          </div>

          {isEditing && canViewRevisions && (
            <div className={styles.panel}>
              <div className={styles.revLogHeader}>
                <h3 className={styles.revLogTitle}>
                  <FontAwesomeIcon icon={faHistory} style={{ marginRight: '0.4em', opacity: 0.7 }} /> Revision Log
                </h3>
                <button
                  type="button"
                  className={styles.revLogToggle}
                  onClick={() => {
                    const next = !showArchivedRevisions;
                    setShowArchivedRevisions(next);
                    if (post) loadRevisions(post.id, next);
                  }}
                >
                  {showArchivedRevisions ? 'Hide archived' : `Show archived${revisions.filter((r) => r.isArchived).length ? ` (${revisions.filter((r) => r.isArchived).length})` : ''}`}
                </button>
              </div>

              <div className={styles.revLog}>
                {revisions.filter((r) => showArchivedRevisions || !r.isArchived).length === 0 && (
                  <p className={styles.revEmpty}>
                    {revisions.length === 0
                      ? 'No revisions yet. Save the post to start logging.'
                      : 'All entries are archived.'}
                  </p>
                )}
                {revisions
                  .filter((r) => showArchivedRevisions || !r.isArchived)
                  .map((rev) => (
                    <div key={rev.id} className={`${styles.revEntry}${rev.isArchived ? ` ${styles.archived}` : ''}`}>
                      <div className={styles.revAvatar}>
                        {rev.user.avatar
                          ? <img src={rev.user.avatar} alt={revUserName(rev.user)} />
                          : revUserInitials(rev.user)}
                      </div>

                      <div className={styles.revBody}>
                        <div className={styles.revTop}>
                          <span className={`${styles.revBadge} ${styles[ACTION_BADGE_CLASS[rev.action] ?? 'badgeUpdated']}`}>
                            {ACTION_LABELS[rev.action] ?? rev.action}
                          </span>
                          <span className={styles.revUser}>{revUserName(rev.user)}</span>
                          <span className={styles.revTime} title={new Date(rev.createdAt).toLocaleString()}>
                            {revTimeAgo(rev.createdAt)}
                          </span>
                          {canArchiveRevisions && !rev.isArchived && (
                            <button
                              type="button"
                              className={styles.revArchiveBtn}
                              title="Archive this log entry (keeps it in the database)"
                              onClick={() => handleArchiveRevision(rev.id)}
                            >
                              <FontAwesomeIcon icon={faArchive} /> Archive
                            </button>
                          )}
                          {rev.isArchived && (
                            <span className={styles.revArchivedLabel}>Archived</span>
                          )}
                        </div>

                        {rev.changes && rev.changes.length > 0 && (
                          <ul className={styles.revChanges}>
                            {rev.changes.map((ch, i) => (
                              <li key={i} className={styles.revChange}>
                                <strong>{ch.label}:</strong>{' '}
                                {ch.from !== undefined && ch.to !== undefined
                                  ? <><em>{ch.from}</em>{' → '}<em>{ch.to}</em></>
                                  : <span>{ch.note}</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        <div className={styles.sidebar}>
          <div className={styles.panel}>
            <h3>Publish</h3>

            {authorList.length > 1 && (
              <div className={styles.formGroup}>
                <label>Primary Author</label>
                <select
                  value={selectedAuthorId}
                  onChange={(e) => {
                    const newId = e.target.value;
                    setSelectedAuthorId(newId);
                    // Remove from co-authors if they were there
                    setSelectedCoAuthorIds((prev) => prev.filter((id) => id !== newId));
                  }}
                  disabled={saving}
                >
                  <option value="">— Same as creator —</option>
                  {authorList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {[u.firstName, u.lastName].filter(Boolean).join(' ') || u.username}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {authorList.length > 1 && (
              <div className={styles.formGroup}>
                <label>Co-Authors</label>
                {selectedCoAuthorIds.length > 0 && (
                  <div className={styles.coAuthorChips}>
                    {selectedCoAuthorIds.map((id) => {
                      const u = authorList.find((a) => a.id === id);
                      if (!u) return null;
                      const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username;
                      return (
                        <span key={id} className={styles.coAuthorChip}>
                          {name}
                          <button
                            type="button"
                            className={styles.coAuthorChipRemove}
                            onClick={() => setSelectedCoAuthorIds((prev) => prev.filter((x) => x !== id))}
                            disabled={saving}
                            aria-label={`Remove ${name}`}
                          >×</button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <select
                  value=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id && !selectedCoAuthorIds.includes(id)) {
                      setSelectedCoAuthorIds((prev) => [...prev, id]);
                    }
                  }}
                  disabled={saving}
                >
                  <option value="">Add co-author…</option>
                  {authorList
                    .filter((u) => u.id !== selectedAuthorId && !selectedCoAuthorIds.includes(u.id))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {[u.firstName, u.lastName].filter(Boolean).join(' ') || u.username}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div className={styles.formGroup}>
              <label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={saving}>
                {STATUS_OPTIONS.filter((option) => canPublish || option.value === 'draft').map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {status === 'scheduled' && (
              <div className={styles.formGroup}>
                <label>Scheduled for</label>
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  disabled={saving}
                />
              </div>
            )}

            {!isPage && (
              <div className={styles.formGroup}>
                <label>
                  <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(e) => setIsFeatured(e.target.checked)}
                    disabled={saving}
                  />
                  {' '}Feature on homepage
                </label>
                <p className={styles.hint}>Up to 5 posts can be featured at once.</p>
              </div>
            )}

            <div className={styles.formGroup}>
              <label>
                <input
                  type="checkbox"
                  checked={showSidebar}
                  onChange={(e) => setShowSidebar(e.target.checked)}
                  disabled={saving}
                />
                {' '}Show sidebar
              </label>
              <p className={styles.hint}>Display the sidebar widgets next to this {isPage ? 'page' : 'post'}.</p>
            </div>

            {!isPage && (
              <div className={styles.formGroup}>
                <label>Comments</label>
                <select
                  value={commentStatus}
                  onChange={(e) => setCommentStatus(e.target.value as 'default' | 'open' | 'closed')}
                  disabled={saving}
                >
                  <option value="default">Use site default</option>
                  <option value="open">Open — allow comments</option>
                  <option value="closed">Closed — no comments</option>
                </select>
                <p className={styles.hint}>Overrides the site-wide Discussion setting for this post.</p>
              </div>
            )}

            {!canPublish && (
              <p className={styles.hint}>You do not have permission to publish or schedule {isPage ? 'pages' : 'posts'}.</p>
            )}

            <div className={styles.publishActions}>
              <button
                type="button"
                className={styles.draftButton}
                onClick={handleSaveDraft}
                disabled={saving}
              >
                Save Draft
              </button>
              {canPublish && status !== 'draft' && (
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={handlePrimaryAction}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : primaryActionLabel()}
                </button>
              )}
            </div>

            <div className={styles.viewActions}>
              {(!post || post.status !== 'published') && (
                <button
                  type="button"
                  className={styles.viewLink}
                  onClick={handlePreview}
                  disabled={saving}
                  title="Saves a draft, then opens a preview in a new tab"
                >
                  Preview {noun} <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                </button>
              )}
              {post?.status === 'published' && post.publicUrl && (
                <a
                  className={styles.viewLink}
                  href={post.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={`Open the live ${noun.toLowerCase()} in a new tab`}
                >
                  View {noun} <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                </a>
              )}
            </div>
          </div>

          {isPage && (
            <div className={styles.panel}>
              <h3>Page Attributes</h3>
              <div className={styles.formGroup}>
                <label>Template</label>
                <select
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  disabled={saving}
                >
                  <option value="">Default Template</option>
                  <option value="full-width">Full Width</option>
                  <option value="full-bleed">Full Bleed (edge-to-edge, transparent header)</option>
                  <option value="contact">Contact Page</option>
                  <option value="blank">Blank (no header/footer)</option>
                </select>
                <p className={styles.hint}>Controls the page layout on the frontend.</p>
              </div>
              <div className={styles.formGroup}>
                <label>Parent Page</label>
                <select
                  value={parentId ?? ''}
                  onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : null)}
                  disabled={saving}
                >
                  <option value="">(no parent)</option>
                  {parentPages
                    .filter((p) => p.id !== post?.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                </select>
              </div>
            </div>
          )}

          {!isPage && (
            <div className={styles.panel}>
              <h3>Categories</h3>
              <div className={styles.categoryList}>
                {categoryTree.length === 0 && <p className={styles.hint}>No categories yet.</p>}
                {categoryTree.map(({ category, depth }) => (
                  <label key={category.id} className={styles.categoryOption} style={{ paddingLeft: `${depth * 1.25}rem` }}>
                    <input
                      type="checkbox"
                      checked={categoryIds.includes(category.id)}
                      onChange={() => toggleCategory(category.id)}
                      disabled={saving}
                    />
                    {depth > 0 && <span className={styles.nestingMark} aria-hidden="true" />}
                    {category.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {!isPage && (
            <div className={styles.panel}>
              <h3>Tags</h3>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="Comma-separated, e.g. news, travel"
                disabled={saving}
              />
              <p className={styles.hint}>New tags will be created automatically.</p>
            </div>
          )}

          <div className={styles.panel}>
            <h3>Featured Image</h3>
            {featuredImage ? (
              <>
                <div className={styles.imagePreview}>
                  <img
                    src={resolveMediaUrl(featuredImage)}
                    alt="Featured preview"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                    onLoad={(e) => {
                      e.currentTarget.style.display = 'block';
                    }}
                  />
                </div>
                <div className={styles.imageActions}>
                  <button type="button" onClick={() => setMediaModalOpen(true)} disabled={saving}>
                    Replace image
                  </button>
                  <button
                    type="button"
                    className={styles.imageRemoveButton}
                    onClick={() => setFeaturedImage('')}
                    disabled={saving}
                  >
                    Remove image
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.imageActions}>
                <button type="button" onClick={() => setMediaModalOpen(true)} disabled={saving}>
                  Set featured image
                </button>
              </div>
            )}
          </div>

          <div className={styles.panel}>
            <button type="button" className={styles.scToggle} onClick={() => setShortcodesOpen((o) => !o)}>
              <h3><FontAwesomeIcon icon={faTag} style={{ marginRight: '0.4em', opacity: 0.7 }} /> Shortcodes</h3>
              <span><FontAwesomeIcon icon={shortcodesOpen ? faMinus : faPlus} /></span>
            </button>

            {shortcodesOpen && (
              <div className={styles.scBody}>
                <p className={styles.scIntro}>
                  Shortcodes are placeholders you embed directly in your content.
                  They are resolved to real values when the page is viewed on the public site.
                </p>
                <p className={styles.scNote}>
                  Syntax: <code>[shortcode]</code> or with attributes: <code>[current_date format="j F Y"]</code>.
                  Unknown shortcodes are left as-is. Shortcodes work in both Visual and Markdown modes.
                  Click <strong>Insert</strong> to place a shortcode at the current cursor position.
                </p>

                {SHORTCODE_DOCS.map((section) => (
                  <div key={section.category} className={styles.scSection}>
                    <p className={styles.scSectionTitle}>{section.category}</p>
                    {section.shortcodes.map((sc) => (
                      <div key={sc.tag} className={styles.scRow}>
                        <span className={styles.scTag}>{sc.tag}</span>
                        <p className={styles.scDesc}>{sc.description}</p>
                        <p className={styles.scExample}>{sc.example}</p>
                        <button
                          type="button"
                          className={styles.scInsert}
                          onClick={() => insertShortcode(sc.tag)}
                          title={`Insert ${sc.tag}`}
                        >
                          Insert
                        </button>
                      </div>
                    ))}
                  </div>
                ))}

                <div className={styles.scFormatRef}>
                  <p className={styles.scFormatTitle}>PHP Date Format Tokens</p>
                  <div className={styles.scFormatGrid}>
                    {DATE_FORMAT_TOKENS.map(({ token, meaning }) => (
                      <div key={token} className={styles.scFormatItem}>
                        <span className={styles.scFormatToken}>{token}</span>
                        <span className={styles.scFormatMeaning}>{meaning}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {selectedImage && (
        <ImageToolbar
          anchorEl={selectedImage.imgEl}
          currentStyle={selectedImage.style}
          onStyleChange={applyImageStyle}
        />
      )}

      {inlineMediaModalOpen && (
        <MediaLibraryModal
          onSelect={(media) => {
            const quill = quillRef.current?.getEditor();
            if (quill) {
              const { index } = inlineInsertRange.current;
              quill.insertEmbed(index, 'image', resolveMediaUrl(media.url), 'user');
              quill.setSelection(index + 1, 0, 'user');
            }
            setInlineMediaModalOpen(false);
          }}
          onClose={() => setInlineMediaModalOpen(false)}
        />
      )}

      {mediaModalOpen && (
        <MediaLibraryModal
          onSelect={(media) => {
            setFeaturedImage(media.url);
            setMediaModalOpen(false);
          }}
          onClose={() => setMediaModalOpen(false)}
        />
      )}
    </AdminLayout>
  );
}
