import { ChangeEvent, DragEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AxiosError } from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTableCellsLarge, faList, faArrowUpFromBracket, faXmark } from '@fortawesome/free-solid-svg-icons';
import { Media } from '../types';
import { fetchMedia, uploadMedia } from '../services/media';
import { MediaGrid } from './MediaGrid';
import { useToast } from './ToastContext';
import styles from './MediaLibraryModal.module.css';

const PAGE_SIZE = 20;

interface MediaLibraryModalProps {
  onSelect: (media: Media) => void;
  onClose: () => void;
}

export function MediaLibraryModal({ onSelect, onClose }: MediaLibraryModalProps) {
  const [items, setItems] = useState<Media[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Media | null>(null);
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [view, setView] = useState<'gallery' | 'list'>('gallery');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
  }, [page, search]);

  async function load() {
    setLoading(true);
    try {
      const result = await fetchMedia(page, PAGE_SIZE, search);
      setItems(result.items);
      setTotal(result.pagination.total);
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || 'Failed to load media'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setProgress(0);
    try {
      const media = await uploadMedia(file, setProgress);
      setSelected(media);
      setSearch('');
      setPage(1);
      await load();
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || 'Failed to upload file'
      );
    } finally {
      setUploading(false);
    }
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = '';
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragActive(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return createPortal(
    <div className={styles.overlay}>
      <div
        className={styles.card}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {dragActive && (
          <div className={styles.dropOverlay}>
            <FontAwesomeIcon icon={faArrowUpFromBracket} />
            Drop to upload
          </div>
        )}

        {/* Header: title · search · view toggle · close */}
        <div className={styles.header}>
          <span className={styles.title}>Media Library</span>
          <div className={styles.searchWrap}>
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            />
          </div>
          <div className={styles.viewToggle}>
            <button
              type="button"
              className={`${styles.viewButton} ${view === 'gallery' ? styles.viewButtonActive : ''}`}
              onClick={() => setView('gallery')}
              title="Gallery view"
            >
              <FontAwesomeIcon icon={faTableCellsLarge} />
            </button>
            <button
              type="button"
              className={`${styles.viewButton} ${view === 'list' ? styles.viewButtonActive : ''}`}
              onClick={() => setView('list')}
              title="List view"
            >
              <FontAwesomeIcon icon={faList} />
            </button>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} title="Close">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        {/* Upload strip */}
        <div className={styles.uploadStrip}>
          <button
            type="button"
            className={styles.uploadButton}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <FontAwesomeIcon icon={faArrowUpFromBracket} />
            {uploading ? 'Uploading…' : 'Upload file'}
          </button>
          {uploading ? (
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${progress}%` }} />
            </div>
          ) : (
            <span className={styles.uploadHint}>or drag & drop anywhere in this window</span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleFileInputChange}
            hidden
          />
        </div>

        {/* Scrollable grid */}
        <div className={styles.gridWrapper}>
          <MediaGrid
            items={items}
            selectedId={selected?.id}
            loading={loading}
            page={page}
            pages={pages}
            view={view}
            onSelect={setSelected}
            onPageChange={setPage}
          />
        </div>

        {/* Footer: actions */}
        <div className={styles.footer}>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.selectButton}
            disabled={!selected}
            onClick={() => { if (selected) onSelect(selected); }}
          >
            Use this image
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
