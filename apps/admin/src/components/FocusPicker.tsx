import { CSSProperties, KeyboardEvent, PointerEvent, useRef } from 'react';
import styles from './FocusPicker.module.css';

/** "x% y%" → [x, y]; anything else is the centre. */
export function parseFocus(value: string | null | undefined): [number, number] {
  const m = value?.match(/^(\d{1,3})%\s+(\d{1,3})%$/);
  return m ? [Number(m[1]), Number(m[2])] : [50, 50];
}

const toFocus = (x: number, y: number) => (Math.round(x) === 50 && Math.round(y) === 50 ? null : `${Math.round(x)}% ${Math.round(y)}%`);
const clamp = (n: number) => Math.min(100, Math.max(0, n));

/** Inline style that crops an object-fit: cover image to a focus point, zoomed in around it. */
export function framingStyle(focus: string | null | undefined, zoom?: number | null): CSSProperties {
  const position = `${parseFocus(focus).join('% ')}%`;
  return zoom && zoom > 1
    ? { objectPosition: position, transform: `scale(${zoom})`, transformOrigin: position }
    : { objectPosition: position };
}

export interface CropPreview {
  label: string;
  ratio: string;
  /** Relative column width in the preview row. */
  size: number;
  round?: boolean;
}

// The crop shapes the public site uses for featured images.
const FEATURED_PREVIEWS: CropPreview[] = [
  { label: 'Banner', ratio: '16 / 9', size: 1 },
  { label: 'Hero', ratio: '21 / 9', size: 1.2 },
  { label: 'Thumbnail', ratio: '1 / 1', size: 0.6 },
];

export const MAX_ZOOM = 3;

/**
 * Pick the part of an image that must stay visible when it's cropped.
 * Click or drag on the image, or focus the marker and use the arrow keys.
 * Pass zoom/onZoomChange to also let the editor zoom in around that point.
 */
export function FocusPicker({ src, value, onChange, disabled, zoom, onZoomChange, previews = FEATURED_PREVIEWS, alt = 'Featured image' }: {
  src: string;
  value: string | null;
  onChange: (focus: string | null) => void;
  disabled?: boolean;
  zoom?: number | null;
  onZoomChange?: (zoom: number | null) => void;
  previews?: CropPreview[];
  alt?: string;
}) {
  const [x, y] = parseFocus(value);
  const scale = zoom ?? 1;
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function setFromPointer(e: PointerEvent<HTMLDivElement>) {
    const r = frame.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return;
    onChange(toFocus(clamp(((e.clientX - r.left) / r.width) * 100), clamp(((e.clientY - r.top) / r.height) * 100)));
  }

  function onKey(e: KeyboardEvent<HTMLButtonElement>) {
    const step = e.shiftKey ? 10 : 2;
    const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = move[e.key];
    if (!d) return;
    e.preventDefault();
    onChange(toFocus(clamp(x + d[0]), clamp(y + d[1])));
  }

  const preview = framingStyle(value, scale);
  return (
    <div className={styles.root}>
      <div
        ref={frame}
        className={`${styles.frame} ${disabled ? styles.disabled : ''}`}
        onPointerDown={(e) => {
          if (disabled) return;
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          setFromPointer(e);
        }}
        onPointerMove={(e) => { if (dragging.current) setFromPointer(e); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
      >
        <img src={src} alt={alt} draggable={false} />
        <button
          type="button"
          className={styles.marker}
          style={{ left: `${x}%`, top: `${y}%` }}
          onKeyDown={onKey}
          onPointerDown={(e) => e.preventDefault()}
          disabled={disabled}
          aria-label={`Focus point ${x}% across, ${y}% down. Use arrow keys to move, Shift for bigger steps.`}
        />
      </div>
      <div className={styles.bar}>
        <span className={styles.hint}>
          Click or drag to choose what stays in view when the image is cropped{onZoomChange ? ', then zoom in to frame it tighter' : ''}.
        </span>
        {(value || scale > 1) && (
          <button
            type="button"
            className={styles.reset}
            onClick={() => { onChange(null); onZoomChange?.(null); }}
            disabled={disabled}
          >
            Reset
          </button>
        )}
      </div>
      {onZoomChange && (
        <label className={styles.zoom}>
          <span>Zoom</span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.05}
            value={scale}
            onChange={(e) => {
              const z = Math.round(Number(e.target.value) * 100) / 100;
              onZoomChange(z > 1 ? z : null);
            }}
            disabled={disabled}
          />
          <output>{scale.toFixed(1)}×</output>
        </label>
      )}
      <div
        className={styles.previews}
        style={{ gridTemplateColumns: previews.map((p) => `${p.size}fr`).join(' ') }}
        aria-label="Crop previews"
      >
        {previews.map((p) => (
          <figure key={p.label} className={styles.preview}>
            <div className={`${styles.previewBox} ${p.round ? styles.round : ''}`} style={{ aspectRatio: p.ratio }}>
              <img src={src} alt="" style={preview} />
            </div>
            <figcaption>{p.label}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
