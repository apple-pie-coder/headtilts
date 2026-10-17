import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import type { CSSProperties, DragEvent } from 'react';
import { Media } from '../types';
import { resolveMediaUrl } from '../services/media';
import styles from './MediaGrid.module.css';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(item: Media): boolean {
  return item.mimeType.startsWith('image/');
}

function typeLabel(item: Media): string {
  const sub = item.mimeType.split('/')[1] || item.mimeType;
  return sub.replace('+xml', '').toUpperCase().slice(0, 5);
}

/** Image thumbnail when available, otherwise a type badge for non-image files. */
function Thumb({ item, className }: { item: Media; className?: string }) {
  if (isImage(item)) {
    return (
      <img
        className={className}
        src={resolveMediaUrl(item.thumbnailUrl || item.url)}
        alt={item.altText || item.originalName}
        loading="lazy"
      />
    );
  }
  return <span className={`${className ?? ''} ${styles.fileBadge}`}>{typeLabel(item)}</span>;
}

interface MediaGridProps {
  items: Media[];
  selectedId?: number | null;
  loading?: boolean;
  page: number;
  pages: number;
  view?: 'gallery' | 'list';
  onSelect: (media: Media) => void;
  onPageChange: (page: number) => void;
  selectable?: boolean;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
  /** Thumbnail size in the gallery view. */
  size?: 's' | 'm' | 'l';
  /** When set, files can be dragged (e.g. onto a folder); returns the ids being moved. */
  dragIds?: (item: Media) => number[];
}

/** Drag payload type for moving library files between folders. */
export const MEDIA_DRAG_TYPE = 'application/x-headtilts-media';
const TILE_MIN = { s: '104px', m: '148px', l: '220px' };

export function MediaGrid({
  items, selectedId, loading, page, pages, view = 'gallery',
  onSelect, onPageChange, selectable = false, selectedIds, onToggleSelect, size = 'm', dragIds,
}: MediaGridProps) {
  // Keep showing the current files (dimmed) while the next page loads.
  if (loading && items.length === 0) {
    return <div className={styles.loading}>Loading…</div>;
  }

  const drag = (item: Media) => dragIds ? {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      const ids = dragIds(item);
      e.dataTransfer.setData(MEDIA_DRAG_TYPE, JSON.stringify(ids));
      e.dataTransfer.effectAllowed = 'move';
    },
  } : {};

  if (items.length === 0) {
    return <div className={styles.empty}>No media found.</div>;
  }

  const isChecked = (id: number) => selectedIds?.has(id) ?? false;

  const checkbox = (item: Media) =>
    selectable ? (
      <input
        type="checkbox"
        className={styles.selectBox}
        checked={isChecked(item.id)}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggleSelect?.(item.id)}
        aria-label={`Select ${item.originalName}`}
      />
    ) : null;

  const pagination = pages > 1 ? (
    <div className={styles.pagination}>
      <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>
        <FontAwesomeIcon icon={faChevronLeft} /> Previous
      </button>
      <span>
        Page {page} of {pages}
      </span>
      <button onClick={() => onPageChange(Math.min(pages, page + 1))} disabled={page >= pages}>
        Next <FontAwesomeIcon icon={faChevronRight} />
      </button>
    </div>
  ) : null;

  if (view === 'list') {
    return (
      <>
        <div className={`${styles.list} ${loading ? styles.dimmed : ''}`}>
          {items.map((item) => {
            const isSelected = selectedId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`${styles.listRow} ${isSelected ? styles.selected : ''} ${isChecked(item.id) ? styles.checkedRow : ''}`}
                onClick={() => onSelect(item)}
                {...drag(item)}
              >
                {selectable
                  ? checkbox(item)
                  : isSelected
                    ? <span className={styles.listCheck}><FontAwesomeIcon icon={faCheck} /></span>
                    : <span className={styles.listCheckPlaceholder} />}
                <Thumb item={item} className={styles.listThumb} />
                <span className={styles.listName}>{item.originalName}</span>
                <span className={styles.listMeta}>
                  <span>{item.mimeType.replace('image/', '')}</span>
                  <span>{formatSize(item.size)}</span>
                </span>
              </button>
            );
          })}
        </div>
        {pagination}
      </>
    );
  }

  return (
    <>
      <div className={`${styles.grid} ${loading ? styles.dimmed : ''}`} style={{ '--tile-min': TILE_MIN[size] } as CSSProperties}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.tile} ${selectedId === item.id ? styles.selected : ''} ${isChecked(item.id) ? styles.checkedTile : ''}`}
            onClick={() => onSelect(item)}
            title={item.originalName}
            {...drag(item)}
          >
            {selectable && <span className={styles.tileCheck}>{checkbox(item)}</span>}
            <Thumb item={item} />
            <span className={styles.filename}>{item.originalName}</span>
          </button>
        ))}
      </div>
      {pagination}
    </>
  );
}
