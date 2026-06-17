import { ChangeEvent, DragEvent, useEffect, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTableCellsLarge, faList, faPlus } from '@fortawesome/free-solid-svg-icons';
import { PERMISSIONS } from '@headtilts/shared';
import { AdminLayout } from '../components/AdminLayout';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import { MediaGrid } from '../components/MediaGrid';
import { useAuth } from '../hooks/useAuth';
import { Media, MediaFolder } from '../types';
import {
  bulkDeleteMedia, createFolder, deleteFolder, deleteMedia, fetchFolders, fetchMedia,
  fetchUploadConfig, replaceMedia, resolveMediaUrl, updateMedia, uploadMediaBatch, UploadConfig,
} from '../services/media';
import styles from './Media.module.css';

const PAGE_SIZE = 24;

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

export default function MediaPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canUpload = hasPermission(PERMISSIONS.MEDIA_UPLOAD);
  const canDelete = hasPermission(PERMISSIONS.MEDIA_DELETE);

  const [items, setItems] = useState<Media[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'gallery' | 'list'>('gallery');
  const [config, setConfig] = useState<UploadConfig | null>(null);

  // Folders
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [folderFilter, setFolderFilter] = useState<FolderFilter>('all');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);

  // Selection / bulk
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Details panel
  const [selected, setSelected] = useState<Media | null>(null);
  const [meta, setMeta] = useState({ title: '', altText: '', caption: '', description: '', originalName: '', folderId: '' });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Upload
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadNote, setUploadNote] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchUploadConfig().then(setConfig).catch(() => {});
    refreshFolders();
  }, []);

  useEffect(() => {
    load();
  }, [page, search, folderFilter]);

  useEffect(() => {
    setMeta({
      title: selected?.title || '',
      altText: selected?.altText || '',
      caption: selected?.caption || '',
      description: selected?.description || '',
      originalName: selected?.originalName || '',
      folderId: selected?.folderId ? String(selected.folderId) : '',
    });
  }, [selected]);

  async function refreshFolders() {
    try {
      setFolders(await fetchFolders());
    } catch {
      setFolders([]);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const folderId = folderFilter === 'all' ? undefined : folderFilter;
      const result = await fetchMedia(page, PAGE_SIZE, search, folderId);
      setItems(result.items);
      setTotal(result.pagination.total);
    } catch (err: unknown) {
      toast.error(errMsg(err, 'Failed to load media'));
    } finally {
      setLoading(false);
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
    setUploadNote('');
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
      if (result.duplicates.length) notes.push(`${result.duplicates.length} already existed (skipped)`);
      const allErrors = [...rejected, ...result.errors.map((e) => `${e.name}: ${e.message}`)];
      if (allErrors.length) notes.push(`${allErrors.length} failed`);
      setUploadNote(notes.join(' · '));
      if (allErrors.length) toast.error(allErrors.join(' · '));

      const first = result.uploaded[0] ?? result.duplicates[0];
      if (first) setSelected(first);
      setPage(1);
      await load();
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
    if (!canUpload || uploading) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) handleUpload(files);
  }

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
      title: 'Delete Media',
      message: `Permanently delete ${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'}? This cannot be undone.`,
      confirmLabel: 'Delete Permanently',
      danger: true,
    }))) return;
    try {
      await bulkDeleteMedia(Array.from(selectedIds));
      if (selected && selectedIds.has(selected.id)) setSelected(null);
      exitSelectMode();
      await load();
      await refreshFolders();
    } catch (err: unknown) {
      toast.error(errMsg(err, 'Failed to delete selected media'));
    }
  }

  // ── Details actions ──
  async function handleSaveMeta() {
    if (!selected) return;
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
        await load();
      })
      .catch((err: unknown) => toast.error(errMsg(err, 'Failed to replace file')))
      .finally(() => setSaving(false));
  }

  async function handleDelete() {
    if (!selected) return;
    if (!(await confirm({
      title: 'Delete Media',
      message: `Permanently delete "${selected.originalName}"? This cannot be undone.`,
      confirmLabel: 'Delete Permanently',
      danger: true,
    }))) return;
    setDeleting(true);
    try {
      await deleteMedia(selected.id);
      setSelected(null);
      await load();
      await refreshFolders();
    } catch (err: unknown) {
      toast.error(errMsg(err, 'Failed to delete media'));
    } finally {
      setDeleting(false);
    }
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await createFolder(name);
      setNewFolderName('');
      setShowNewFolder(false);
      await refreshFolders();
    } catch (err: unknown) {
      toast.error(errMsg(err, 'Failed to create folder'));
    }
  }

  async function handleDeleteFolder(folder: MediaFolder) {
    if (!(await confirm({
      title: 'Delete Folder',
      message: `Delete the folder "${folder.name}"? Its media will be kept and moved to Unfiled.`,
      confirmLabel: 'Delete Folder',
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

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const uploaderName = selected?.uploadedBy
    ? [selected.uploadedBy.firstName, selected.uploadedBy.lastName].filter(Boolean).join(' ') || selected.uploadedBy.username
    : '—';
  const isImage = selected ? selected.mimeType.startsWith('image/') : false;
  const acceptAttr = config?.allowedMime.join(',') || 'image/*';

  function folderTabClass(f: FolderFilter): string {
    return folderFilter === f ? `${styles.folderItem} ${styles.folderActive}` : styles.folderItem;
  }

  return (
    <AdminLayout>
      <h2 className={styles.title}>Media Library</h2>

      <div className={styles.shell}>
        {/* Folder sidebar */}
        <aside className={styles.folders}>
          <button type="button" className={folderTabClass('all')} onClick={() => { setFolderFilter('all'); setPage(1); }}>
            All media
          </button>
          <button type="button" className={folderTabClass(null)} onClick={() => { setFolderFilter(null); setPage(1); }}>
            Unfiled
          </button>
          <div className={styles.folderDivider} />
          {folders.map((f) => (
            <div key={f.id} className={styles.folderRow}>
              <button type="button" className={folderTabClass(f.id)} onClick={() => { setFolderFilter(f.id); setPage(1); }}>
                {f.name} {typeof f.count === 'number' && <span className={styles.folderCount}>{f.count}</span>}
              </button>
              {canDelete && (
                <button type="button" className={styles.folderDelete} title="Delete folder" onClick={() => handleDeleteFolder(f)}>×</button>
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
              <div className={styles.search}>
                <input
                  type="text"
                  placeholder="Search media..."
                  value={search}
                  onChange={(e) => { setPage(1); setSearch(e.target.value); }}
                />
              </div>
              <div className={styles.toolbarRight}>
                <div className={styles.viewToggle}>
                  <button type="button" className={`${styles.viewButton} ${view === 'gallery' ? styles.viewButtonActive : ''}`} onClick={() => setView('gallery')} title="Gallery view"><FontAwesomeIcon icon={faTableCellsLarge} /></button>
                  <button type="button" className={`${styles.viewButton} ${view === 'list' ? styles.viewButtonActive : ''}`} onClick={() => setView('list')} title="List view"><FontAwesomeIcon icon={faList} /></button>
                </div>
                {canDelete && (
                  selectMode ? (
                    <>
                      <button type="button" className={styles.uploadButton} onClick={handleBulkDelete} disabled={selectedIds.size === 0}>
                        Delete {selectedIds.size || ''}
                      </button>
                      <button type="button" className={styles.secondaryButton} onClick={exitSelectMode}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" className={styles.secondaryButton} onClick={() => setSelectMode(true)}>Select</button>
                  )
                )}
                {canUpload && !selectMode && (
                  <button type="button" className={styles.uploadButton} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    {uploading ? 'Uploading…' : 'Upload'}
                  </button>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept={acceptAttr} multiple onChange={handleFileInputChange} hidden />
            </div>

            {uploadNote && <div className={styles.note}>{uploadNote}</div>}

            {uploading && (
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${progress}%` }} />
              </div>
            )}

            {/* Drag-and-drop zone wraps the grid */}
            <div
              className={`${styles.gridCard} ${dragActive ? styles.dropActive : ''}`}
              onDragOver={(e) => { e.preventDefault(); if (canUpload) setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
              onDrop={handleDrop}
            >
              {dragActive && <div className={styles.dropHint}>Drop files to upload</div>}
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
            </div>
          </div>

          <div className={styles.detailsColumn}>
            <div className={styles.detailsCard}>
              {!selected ? (
                <div className={styles.placeholder}>Select an item to view its details.</div>
              ) : (
                <>
                  <div className={styles.preview}>
                    {isImage ? (
                      <img src={resolveMediaUrl(selected.url)} alt={selected.altText || selected.originalName} />
                    ) : (
                      <div className={styles.previewFile}>{selected.mimeType}</div>
                    )}
                  </div>

                  <ul className={styles.metaList}>
                    <li><span>Type</span><span>{selected.mimeType}</span></li>
                    <li><span>Size</span><span>{formatSize(selected.size)}</span></li>
                    {selected.width && selected.height && (
                      <li><span>Dimensions</span><span>{selected.width} × {selected.height} px</span></li>
                    )}
                    <li><span>Uploaded by</span><span>{uploaderName}</span></li>
                    <li><span>Uploaded</span><span>{formatDate(selected.createdAt)}</span></li>
                    <li>
                      <span>Original</span>
                      <span><a href={resolveMediaUrl(selected.originalUrl || selected.url)} target="_blank" rel="noreferrer">Download</a></span>
                    </li>
                  </ul>

                  <div className={styles.formGroup}>
                    <label>File name</label>
                    <input type="text" value={meta.originalName} onChange={(e) => setMeta({ ...meta, originalName: e.target.value })} disabled={!canUpload || saving} />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Title</label>
                    <input type="text" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} disabled={!canUpload || saving} />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Alt text</label>
                    <input type="text" value={meta.altText} onChange={(e) => setMeta({ ...meta, altText: e.target.value })} disabled={!canUpload || saving} />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Caption</label>
                    <input type="text" value={meta.caption} onChange={(e) => setMeta({ ...meta, caption: e.target.value })} disabled={!canUpload || saving} />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Description</label>
                    <textarea rows={3} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} disabled={!canUpload || saving} />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Folder</label>
                    <select className={styles.selectInput} value={meta.folderId} onChange={(e) => setMeta({ ...meta, folderId: e.target.value })} disabled={!canUpload || saving}>
                      <option value="">Unfiled</option>
                      {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>

                  <div className={styles.actions}>
                    {canUpload && (
                      <button type="button" className={styles.saveButton} onClick={handleSaveMeta} disabled={saving}>
                        {saving ? 'Saving…' : 'Save details'}
                      </button>
                    )}
                    {canUpload && (
                      <button type="button" className={styles.secondaryButton} onClick={() => replaceInputRef.current?.click()} disabled={saving}>
                        Replace file
                      </button>
                    )}
                    {canDelete && (
                      <button type="button" className={styles.deleteButton} onClick={handleDelete} disabled={deleting}>
                        {deleting ? 'Deleting…' : 'Delete'}
                      </button>
                    )}
                  </div>
                  <input ref={replaceInputRef} type="file" accept={acceptAttr} onChange={handleReplaceChange} hidden />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
