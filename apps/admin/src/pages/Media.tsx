import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTableCellsLarge, faList, faPlus, faUpload, faCopy, faTrashCan, faFolderOpen, faCheck, faChevronLeft,
  faChevronRight, faTriangleExclamation, faArrowUpRightFromSquare, faXmark, faCloudArrowUp,
} from '@fortawesome/free-solid-svg-icons';
import { PERMISSIONS } from '@headtilts/shared';
import { AdminLayout } from '../components/AdminLayout';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import { MediaGrid } from '../components/MediaGrid';
import { BulkBar, Button, Kbd, PageHeader, SearchInput } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useHotkeys, isTypingTarget } from '../hooks/useHotkeys';
import { useUrlState } from '../hooks/useUrlState';
import { Media, MediaFolder } from '../types';
import {
  bulkDeleteMedia, createFolder, deleteFolder, deleteMedia, fetchFolders, fetchMedia,
  fetchUploadConfig, fetchMediaUsage, replaceMedia, resolveMediaUrl, updateMedia, uploadMediaBatch, UploadConfig,
} from '../services/media';
import styles from './Media.module.css';

const PAGE_SIZE = 24;
const VIEW_KEY = 'mediaView';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function errMsg(err: unknown, fallback: string): string {
  return (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback;
}

// 'all' = every item, null = unfiled, number = a specific folder
type FolderFilter = 'all' | null | number;

const EMPTY_META = { title: '', altText: '', caption: '', description: '', originalName: '', folderId: '' };

export default function MediaPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canUpload = hasPermission(PERMISSIONS.MEDIA_UPLOAD);
  const canDelete = hasPermission(PERMISSIONS.MEDIA_DELETE);

  // Folder, search and page live in the URL so links and the back button work.
  const [q, setQ] = useUrlState({ folder: 'all', search: '', page: '1' });
  const page = Math.max(1, Number(q.page) || 1);
  const folderFilter: FolderFilter = q.folder === 'all' ? 'all' : q.folder === 'unfiled' ? null : Number(q.folder);
  const setPage = (p: number) => setQ({ page: String(p) });
  const setFolderFilter = (f: FolderFilter) => setQ({ folder: f === 'all' ? 'all' : f === null ? 'unfiled' : String(f) });

  const [items, setItems] = useState<Media[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setViewState] = useState<'gallery' | 'list'>(() => {
    try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'gallery'; } catch { return 'gallery'; }
  });
  const [config, setConfig] = useState<UploadConfig | null>(null);

  // Folders
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);

  // Selection / bulk
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Details panel
  const [selected, setSelected] = useState<Media | null>(null);
  const [meta, setMeta] = useState(EMPTY_META);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [usageCount, setUsageCount] = useState<number | null>(null);

  // Upload
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  function setView(v: 'gallery' | 'list') {
    setViewState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
  }

  useEffect(() => {
    fetchUploadConfig().then(setConfig).catch(() => {});
    refreshFolders();
  }, []);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const folderId = folderFilter === 'all' ? undefined : folderFilter;
      const result = await fetchMedia(page, PAGE_SIZE, q.search, folderId);
      if (id !== reqId.current) return;
      setItems(result.items);
      setTotal(result.pagination.total);
    } catch (err: unknown) {
      if (id === reqId.current) toast.error(errMsg(err, 'Failed to load media'));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [page, q.search, q.folder]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setUsageCount(null);
    if (selected) {
      fetchMediaUsage(selected.id).then((d) => setUsageCount(d.count)).catch(() => {});
    }
  }, [selected?.id]);

  useEffect(() => {
    setMeta(selected ? {
      title: selected.title || '',
      altText: selected.altText || '',
      caption: selected.caption || '',
      description: selected.description || '',
      originalName: selected.originalName || '',
      folderId: selected.folderId ? String(selected.folderId) : '',
    } : EMPTY_META);
  }, [selected]);

  async function refreshFolders() {
    try {
      setFolders(await fetchFolders());
    } catch {
      setFolders([]);
    }
  }

  // ── Client-side pre-checks ──
  function precheck(files: File[]): { ok: File[]; rejected: string[] } {
    if (!config) return { ok: files, rejected: [] };
    const ok: File[] = [];
    const rejected: string[] = [];
    for (const f of files) {
      if (!config.allowedMime.includes(f.type)) {
        rejected.push(`${f.name}: type not allowed`);
      } else if (f.size > config.maxBytes) {
        rejected.push(`${f.name}: exceeds ${Math.round(config.maxBytes / (1024 * 1024))} MB`);
      } else {
        ok.push(f);
      }
    }
    if (config.maxFiles && ok.length > config.maxFiles) {
      rejected.push(`Only ${config.maxFiles} files can be uploaded at once`);
      ok.length = config.maxFiles;
    }
    return { ok, rejected };
  }

  async function handleUpload(fileList: File[]) {
    if (!canUpload || uploading) return;
    const { ok, rejected } = precheck(fileList);
    if (ok.length === 0) {
      toast.error(rejected.join(' · ') || 'No valid files to upload');
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const targetFolder = typeof folderFilter === 'number' ? folderFilter : null;
      const result = await uploadMediaBatch(ok, targetFolder, setProgress);

      const notes: string[] = [];
      if (result.uploaded.length) notes.push(`${result.uploaded.length} uploaded`);
      if (result.duplicates.length) notes.push(`${result.duplicates.length} already in the library`);
      const allErrors = [...rejected, ...result.errors.map((e) => `${e.name}: ${e.message}`)];
      if (notes.length) toast.success(notes.join(' · '));
      if (allErrors.length) toast.error(allErrors.join(' · '));

      const first = result.uploaded[0] ?? result.duplicates[0];
      if (first) setSelected(first);
      if (page !== 1) setPage(1); else await load();
      await refreshFolders();
    } catch (err: unknown) {
      toast.error(errMsg(err, 'Failed to upload files'));
    } finally {
      setUploading(false);
    }
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) handleUpload(files);
    e.target.value = '';
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) handleUpload(files);
  }

  // Paste an image from the clipboard (e.g. a screenshot) to upload it.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (isTypingTarget(e.target)) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        handleUpload(files);
      }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });

  // ── Selection ──
  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!(await confirm({
      title: `Delete ${selectedIds.size} file${selectedIds.size === 1 ? '' : 's'}?`,
      message: 'Any posts using these files will show broken images. This cannot be undone.',
      confirmLabel: 'Delete permanently',
      danger: true,
    }))) return;
    setBulkBusy(true);
    try {
      await bulkDeleteMedia(Array.from(selectedIds));
      toast.success(`Deleted ${selectedIds.size} file${selectedIds.size === 1 ? '' : 's'}`);
      if (selected && selectedIds.has(selected.id)) setSelected(null);
      exitSelectMode();
      await load();
      await refreshFolders();
    } catch (err: unknown) {
      toast.error(errMsg(err, 'Failed to delete selected media'));
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkMove(value: string) {
    if (selectedIds.size === 0) return;
    const folderId = value === 'unfiled' ? null : Number(value);
    const name = folderId === null ? 'Unfiled' : folders.find((f) => f.id === folderId)?.name ?? 'folder';
    setBulkBusy(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) => updateMedia(id, { folderId })));
      toast.success(`Moved ${selectedIds.size} file${selectedIds.size === 1 ? '' : 's'} to ${name}`);
      exitSelectMode();
      await load();
      await refreshFolders();
    } catch (err: unknown) {
      toast.error(errMsg(err, 'Failed to move files'));
    } finally {
      setBulkBusy(false);
    }
  }

  // ── Details actions ──
  const dirty = !!selected && (
    meta.title !== (selected.title || '')
    || meta.altText !== (selected.altText || '')
    || meta.caption !== (selected.caption || '')
    || meta.description !== (selected.description || '')
    || meta.originalName !== (selected.originalName || '')
    || meta.folderId !== (selected.folderId ? String(selected.folderId) : '')
  );

  async function handleSaveMeta() {
    if (!selected || !dirty) return;
    setSaving(true);
    try {
      const updated = await updateMedia(selected.id, {
        title: meta.title || null,
        altText: meta.altText || null,
        caption: meta.caption || null,
        description: meta.description || null,
        originalName: meta.originalName,
        folderId: meta.folderId ? Number(meta.folderId) : null,
      });
      setSelected(updated);
      toast.success('Details saved');
      await load();
      await refreshFolders();
    } catch (err: unknown) {
      toast.error(errMsg(err, 'Failed to update media'));
    } finally {
      setSaving(false);
    }
  }

  function handleReplaceChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selected) return;
    const { ok, rejected } = precheck([file]);
    if (ok.length === 0) {
      toast.error(rejected.join(' · '));
      return;
    }
    setSaving(true);
    replaceMedia(selected.id, ok[0])
      .then(async (updated) => {
        setSelected(updated);
        toast.success('File replaced — existing links now show the new file');
        await load();
      })
      .catch((err: unknown) => toast.error(errMsg(err, 'Failed to replace file')))
      .finally(() => setSaving(false));
  }

  async function handleDelete() {
    if (!selected) return;
    const usageWarning = usageCount && usageCount > 0
      ? ` It is used in ${usageCount} post${usageCount === 1 ? '' : 's'} — those images will break.`
      : '';
    if (!(await confirm({
      title: 'Delete file?',
      message: `Permanently delete “${selected.originalName}”?${usageWarning} This cannot be undone.`,
      confirmLabel: 'Delete permanently',
      danger: true,
    }))) return;
    setDeleting(true);
    try {
      const idx = items.findIndex((m) => m.id === selected.id);
      await deleteMedia(selected.id);
      toast.success('File deleted');
      setSelected(items[idx + 1] ?? items[idx - 1] ?? null);
      await load();
      await refreshFolders();
    } catch (err: unknown) {
      toast.error(errMsg(err, 'Failed to delete media'));
    } finally {
      setDeleting(false);
    }
  }

  async function copyUrl() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(new URL(resolveMediaUrl(selected.url), window.location.origin).href);
      toast.success('File URL copied');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      const folder = await createFolder(name);
      setNewFolderName('');
      setShowNewFolder(false);
      await refreshFolders();
      if (folder?.id) setFolderFilter(folder.id);
    } catch (err: unknown) {
      toast.error(errMsg(err, 'Failed to create folder'));
    }
  }

  async function handleDeleteFolder(folder: MediaFolder) {
    if (!(await confirm({
      title: `Delete folder “${folder.name}”?`,
      message: 'The files inside are kept and moved to Unfiled.',
      confirmLabel: 'Delete folder',
      danger: true,
    }))) return;
    try {
      await deleteFolder(folder.id);
      if (folderFilter === folder.id) setFolderFilter('all');
      await refreshFolders();
      await load();
    } catch (err: unknown) {
      toast.error(errMsg(err, 'Failed to delete folder'));
    }
  }

  // ── Keyboard: ←/→ step through files, U upload, ⌘/Ctrl+S save details ──
  const selIdx = selected ? items.findIndex((m) => m.id === selected.id) : -1;
  useHotkeys({
    // Arrows only step through files while one is open, so they still scroll otherwise.
    ...(selected ? {
      ArrowRight: () => { const n = items[selIdx + 1]; if (n) setSelected(n); },
      ArrowLeft: () => { const p = items[selIdx - 1]; if (p) setSelected(p); },
    } : {}),
    u: () => { if (canUpload && !uploading) fileInputRef.current?.click(); },
    n: () => { if (canUpload && !uploading) fileInputRef.current?.click(); },
    Escape: () => { if (selectMode) exitSelectMode(); else setSelected(null); },
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && dirty) {
        e.preventDefault();
        handleSaveMeta();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const uploaderName = selected?.uploadedBy
    ? [selected.uploadedBy.firstName, selected.uploadedBy.lastName].filter(Boolean).join(' ') || selected.uploadedBy.username
    : '—';
  const isImage = selected ? selected.mimeType.startsWith('image/') : false;
  const acceptAttr = config?.allowedMime.join(',') || 'image/*';
  const currentFolderName = folderFilter === 'all' ? 'All media' : folderFilter === null ? 'Unfiled' : folders.find((f) => f.id === folderFilter)?.name ?? 'Folder';

  function folderTabClass(f: FolderFilter): string {
    return folderFilter === f ? `${styles.folderItem} ${styles.folderActive}` : styles.folderItem;
  }

  return (
    <AdminLayout>
      <PageHeader
        title="Media library"
        subtitle={<>{total} file{total === 1 ? '' : 's'} in {currentFolderName}{canUpload && <> · drop, paste or press <Kbd>U</Kbd> to upload</>}</>}
        actions={canUpload && (
          <Button variant="primary" icon={faUpload} kbd="U" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? `Uploading ${progress}%` : 'Upload'}
          </Button>
        )}
      />
      <input ref={fileInputRef} type="file" accept={acceptAttr} multiple onChange={handleFileInputChange} hidden />

      <div className={styles.shell}>
        {/* Folder sidebar */}
        <aside className={styles.folders} aria-label="Folders">
          <button type="button" className={folderTabClass('all')} onClick={() => setFolderFilter('all')}>
            All media
          </button>
          <button type="button" className={folderTabClass(null)} onClick={() => setFolderFilter(null)}>
            Unfiled
          </button>
          <div className={styles.folderDivider} />
          {folders.map((f) => (
            <div key={f.id} className={styles.folderRow}>
              <button type="button" className={folderTabClass(f.id)} onClick={() => setFolderFilter(f.id)}>
                <FontAwesomeIcon icon={faFolderOpen} className={styles.folderIcon} />
                {f.name} {typeof f.count === 'number' && <span className={styles.folderCount}>{f.count}</span>}
              </button>
              {canDelete && (
                <button type="button" className={styles.folderDelete} title={`Delete folder ${f.name}`} aria-label={`Delete folder ${f.name}`} onClick={() => handleDeleteFolder(f)}>
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              )}
            </div>
          ))}
          {canUpload && (
            showNewFolder ? (
              <form
                className={styles.folderForm}
                onSubmit={(e) => { e.preventDefault(); handleCreateFolder(); }}
              >
                <input
                  type="text"
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Folder name"
                  onKeyDown={(e) => { if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); } }}
                />
                <button type="submit" disabled={!newFolderName.trim()}>Add</button>
              </form>
            ) : (
              <button type="button" className={styles.folderAdd} onClick={() => setShowNewFolder(true)}><FontAwesomeIcon icon={faPlus} /> New folder</button>
            )
          )}
        </aside>

        <div className={styles.layout}>
          <div className={styles.libraryColumn}>
            <div className={styles.toolbar}>
              <SearchInput value={q.search} onChange={(search) => setQ({ search })} placeholder="Search files" />
              <div className={styles.toolbarRight}>
                <div className={styles.viewToggle} role="group" aria-label="View">
                  <button type="button" className={`${styles.viewButton} ${view === 'gallery' ? styles.viewButtonActive : ''}`} onClick={() => setView('gallery')} title="Gallery view" aria-pressed={view === 'gallery'}><FontAwesomeIcon icon={faTableCellsLarge} /></button>
                  <button type="button" className={`${styles.viewButton} ${view === 'list' ? styles.viewButtonActive : ''}`} onClick={() => setView('list')} title="List view" aria-pressed={view === 'list'}><FontAwesomeIcon icon={faList} /></button>
                </div>
                {(canDelete || canUpload) && (
                  <Button size="sm" variant={selectMode ? 'primary' : 'secondary'} icon={faCheck} onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}>
                    {selectMode ? 'Done' : 'Select'}
                  </Button>
                )}
              </div>
            </div>

            {uploading && (
              <div className={styles.progressTrack} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div className={styles.progressFill} style={{ width: `${progress}%` }} />
              </div>
            )}

            {/* Drag-and-drop zone wraps the grid */}
            <div
              className={`${styles.gridCard} ${dragActive ? styles.dropActive : ''}`}
              onDragOver={(e) => { e.preventDefault(); if (canUpload && !uploading) setDragActive(true); }}
              onDragLeave={(e) => {
                // Ignore leave events fired when moving over child elements.
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragActive(false);
              }}
              onDrop={handleDrop}
            >
              {dragActive && (
                <div className={styles.dropHint}>
                  <FontAwesomeIcon icon={faCloudArrowUp} />
                  Drop to upload to {typeof folderFilter === 'number' ? currentFolderName : 'the library'}
                </div>
              )}
              {!loading && items.length === 0 && !q.search && canUpload ? (
                <button type="button" className={styles.emptyDrop} onClick={() => fileInputRef.current?.click()}>
                  <FontAwesomeIcon icon={faCloudArrowUp} />
                  <strong>No files here yet</strong>
                  <span>Drag files here, paste a screenshot, or click to browse</span>
                </button>
              ) : (
                <MediaGrid
                  items={items}
                  selectedId={selected?.id}
                  loading={loading}
                  page={page}
                  pages={pages}
                  view={view}
                  onSelect={setSelected}
                  onPageChange={setPage}
                  selectable={selectMode}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                />
              )}
            </div>
          </div>

          <div className={styles.detailsColumn}>
            <div className={styles.detailsCard}>
              {!selected ? (
                <div className={styles.placeholder}>
                  Select a file to see its details.
                  {items.length > 0 && <span className={styles.placeholderHint}><Kbd>←</Kbd> <Kbd>→</Kbd> step through files</span>}
                </div>
              ) : (
                <>
                  <div className={styles.detailsNav}>
                    <button type="button" className={styles.navBtn} disabled={selIdx <= 0} onClick={() => setSelected(items[selIdx - 1])} aria-label="Previous file" title="Previous (←)">
                      <FontAwesomeIcon icon={faChevronLeft} />
                    </button>
                    <span className={styles.detailsName} title={selected.originalName}>{selected.originalName}</span>
                    <button type="button" className={styles.navBtn} disabled={selIdx < 0 || selIdx >= items.length - 1} onClick={() => setSelected(items[selIdx + 1])} aria-label="Next file" title="Next (→)">
                      <FontAwesomeIcon icon={faChevronRight} />
                    </button>
                    <button type="button" className={styles.navBtn} onClick={() => setSelected(null)} aria-label="Close details" title="Close (Esc)">
                      <FontAwesomeIcon icon={faXmark} />
                    </button>
                  </div>

                  <div className={styles.preview}>
                    {isImage ? (
                      <img src={resolveMediaUrl(selected.url)} alt={selected.altText || selected.originalName} />
                    ) : (
                      <div className={styles.previewFile}>{selected.mimeType}</div>
                    )}
                  </div>

                  <div className={styles.quickRow}>
                    <Button size="sm" icon={faCopy} onClick={copyUrl}>Copy URL</Button>
                    <a className={styles.quickLink} href={resolveMediaUrl(selected.originalUrl || selected.url)} target="_blank" rel="noreferrer">
                      <FontAwesomeIcon icon={faArrowUpRightFromSquare} /> Open original
                    </a>
                  </div>

                  <ul className={styles.metaList}>
                    <li><span>Type</span><span>{selected.mimeType}</span></li>
                    <li><span>Size</span><span>{formatSize(selected.size)}</span></li>
                    {selected.width && selected.height && (
                      <li><span>Dimensions</span><span>{selected.width} × {selected.height} px</span></li>
                    )}
                    <li><span>Uploaded by</span><span>{uploaderName}</span></li>
                    <li><span>Uploaded</span><span>{formatDate(selected.createdAt)}</span></li>
                  </ul>

                  {usageCount !== null && (
                    <div className={usageCount > 0 ? styles.usageWarn : styles.usageOk}>
                      {usageCount > 0
                        ? `Used in ${usageCount} post${usageCount !== 1 ? 's' : ''} — deleting it will break those images`
                        : 'Not used in any posts'}
                    </div>
                  )}

                  <form onSubmit={(e) => { e.preventDefault(); handleSaveMeta(); }}>
                    <div className={styles.formGroup}>
                      <label htmlFor="media-alt">
                        Alt text
                        {isImage && !meta.altText && (
                          <span className={styles.altWarn}><FontAwesomeIcon icon={faTriangleExclamation} /> missing</span>
                        )}
                      </label>
                      <input id="media-alt" type="text" value={meta.altText} placeholder="Describe the image for screen readers and SEO" onChange={(e) => setMeta({ ...meta, altText: e.target.value })} disabled={!canUpload || saving} />
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="media-title">Title</label>
                      <input id="media-title" type="text" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} disabled={!canUpload || saving} />
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="media-caption">Caption</label>
                      <input id="media-caption" type="text" value={meta.caption} onChange={(e) => setMeta({ ...meta, caption: e.target.value })} disabled={!canUpload || saving} />
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="media-desc">Description</label>
                      <textarea id="media-desc" rows={3} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} disabled={!canUpload || saving} />
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="media-name">File name</label>
                      <input id="media-name" type="text" value={meta.originalName} onChange={(e) => setMeta({ ...meta, originalName: e.target.value })} disabled={!canUpload || saving} />
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="media-folder">Folder</label>
                      <select id="media-folder" className={styles.selectInput} value={meta.folderId} onChange={(e) => setMeta({ ...meta, folderId: e.target.value })} disabled={!canUpload || saving}>
                        <option value="">Unfiled</option>
                        {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    </div>

                    <div className={styles.actions}>
                      {canUpload && (
                        <Button type="submit" variant="primary" size="sm" disabled={saving || !dirty} title="Save (⌘/Ctrl+S)">
                          {saving ? 'Saving…' : dirty ? 'Save details' : 'Saved'}
                        </Button>
                      )}
                      {canUpload && dirty && (
                        <Button size="sm" variant="ghost" onClick={() => setSelected({ ...selected })}>Discard</Button>
                      )}
                      {canUpload && (
                        <Button size="sm" onClick={() => replaceInputRef.current?.click()} disabled={saving}>Replace file</Button>
                      )}
                      {canDelete && (
                        <Button size="sm" variant="danger" icon={faTrashCan} onClick={handleDelete} disabled={deleting}>
                          {deleting ? 'Deleting…' : 'Delete'}
                        </Button>
                      )}
                    </div>
                  </form>
                  <input ref={replaceInputRef} type="file" accept={acceptAttr} onChange={handleReplaceChange} hidden />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <BulkBar count={selectedIds.size} noun="file" onClear={exitSelectMode}>
        {canUpload && (
          <select
            className={styles.bulkMove}
            value=""
            disabled={bulkBusy}
            onChange={(e) => { if (e.target.value) handleBulkMove(e.target.value); }}
            aria-label="Move selected files to folder"
          >
            <option value="">Move to…</option>
            <option value="unfiled">Unfiled</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
        {canDelete && <Button size="sm" variant="danger" icon={faTrashCan} disabled={bulkBusy} onClick={handleBulkDelete}>Delete</Button>}
      </BulkBar>
    </AdminLayout>
  );
}
