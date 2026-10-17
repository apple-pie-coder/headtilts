import { KeyboardEvent, PointerEvent, useRef } from 'react';
import styles from './FocusPicker.module.css';

/** "x% y%" → [x, y]; anything else is the centre. */
export function parseFocus(value: string | null | undefined): [number, number] {
  const m = value?.match(/^(\d{1,3})%\s+(\d{1,3})%$/);
  return m ? [Number(m[1]), Number(m[2])] : [50, 50];
}

const toFocus = (x: number, y: number) => (Math.round(x) === 50 && Math.round(y) === 50 ? null : `${Math.round(x)}% ${Math.round(y)}%`);
const clamp = (n: number) => Math.min(100, Math.max(0, n));

// The crop shapes the public site uses for featured images.
const PREVIEWS = [
  { label: 'Banner', ratio: '16 / 9' },
  { label: 'Hero', ratio: '21 / 9' },
  { label: 'Thumbnail', ratio: '1 / 1' },
];

/**
 * Pick the part of the featured image that must stay visible when it's cropped.
 * Click or drag on the image, or focus the marker and use the arrow keys.
 */
export function FocusPicker({ src, value, onChange, disabled }: {
  src: string;
  value: string | null;
  onChange: (focus: string | null) => void;
  disabled?: boolean;
}) {
  const [x, y] = parseFocus(value);
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

  const position = `${x}% ${y}%`;
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
        <img src={src} alt="Featured image" draggable={false} />
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
        <span className={styles.hint}>Click or drag to choose what stays in view when the image is cropped.</span>
        {value && (
          <button type="button" className={styles.reset} onClick={() => onChange(null)} disabled={disabled}>Centre</button>
        )}
      </div>
      <div className={styles.previews} aria-label="Crop previews">
        {PREVIEWS.map((p) => (
          <figure key={p.label} className={styles.preview}>
            <div className={styles.previewBox} style={{ aspectRatio: p.ratio }}>
              <img src={src} alt="" style={{ objectPosition: position }} />
            </div>
            <figcaption>{p.label}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
