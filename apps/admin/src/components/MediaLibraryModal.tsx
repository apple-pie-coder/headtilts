import { ChangeEvent, DragEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AxiosError } from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTableCellsLarge, faList } from '@fortawesome/free-solid-svg-icons';
import { Media } from '../types';
import { fetchMedia, uploadMedia } from '../services/media';
import { MediaGrid } from './MediaGrid';
import { useToast } from './ToastContext';
import styles from './MediaLibraryModal.module.css';

const PAGE_SIZE = 12;

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
    if (file) {
      handleUpload(file);
    }
    e.target.value = '';
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleUpload(file);
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.cardHeader}>
          <h2>Media Library</h2>
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
        </div>


        <div
          className={`${styles.dropzone} ${dragActive ? styles.dropzoneActive : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <p>Drag and drop an image here, or</p>
          <button type="button" className={styles.uploadButton} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Select File'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleFileInputChange}
            hidden
          />
          {uploading && (
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>

        <div className={styles.search}>
          <input
            type="text"
            placeholder="Search media..."
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
        </div>

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

        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.selectButton}
            disabled={!selected}
            onClick={() => {
              if (selected) {
                onSelect(selected);
              }
            }}
          >
            Use this image
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
