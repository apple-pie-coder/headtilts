import styles from './ImageToolbar.module.css';

type Align = 'inline' | 'left' | 'center' | 'right';
type SizeVal = 'auto' | '25' | '50' | '75' | '100';

function parseImageStyle(style: string): { align: Align; size: SizeVal } {
  let align: Align = 'inline';
  let size: SizeVal = 'auto';
  if (style.includes('float: left')) align = 'left';
  else if (style.includes('float: right')) align = 'right';
  else if (style.includes('margin: 0 auto')) align = 'center';
  const m = style.match(/width:\s*(\d+)%/);
  if (m) size = m[1] as SizeVal;
  return { align, size };
}

export function buildImageStyle(align: Align, size: SizeVal): string {
  const parts: string[] = [];
  if (size !== 'auto') parts.push(`width: ${size}%`);
  if (align === 'left') {
    parts.push('float: left', 'margin: 0 1em 0.5em 0');
  } else if (align === 'right') {
    parts.push('float: right', 'margin: 0 0 0.5em 1em');
  } else if (align === 'center') {
    parts.push('display: block', 'margin: 0 auto');
  }
  return parts.join('; ');
}

interface ImageToolbarProps {
  anchorEl: HTMLImageElement;
  currentStyle: string;
  onStyleChange: (style: string) => void;
}

const SIZES: { val: SizeVal; label: string }[] = [
  { val: '25', label: '25%' },
  { val: '50', label: '50%' },
  { val: '75', label: '75%' },
  { val: '100', label: '100%' },
  { val: 'auto', label: 'Auto' },
];

const ALIGNS: { val: Align; label: string }[] = [
  { val: 'inline', label: 'Inline' },
  { val: 'left', label: 'Left' },
  { val: 'center', label: 'Center' },
  { val: 'right', label: 'Right' },
];

export function ImageToolbar({ anchorEl, currentStyle, onStyleChange }: ImageToolbarProps) {
  const { align, size } = parseImageStyle(currentStyle);

  const rect = anchorEl.getBoundingClientRect();
  const TOOLBAR_H = 42;
  const GAP = 6;
  const top = rect.top > TOOLBAR_H + GAP ? rect.top - TOOLBAR_H - GAP : rect.bottom + GAP;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 340));

  return (
    <div
      data-image-toolbar="1"
      className={styles.toolbar}
      style={{ top, left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className={styles.group}>
        {ALIGNS.map(({ val, label }) => (
          <button
            key={val}
            type="button"
            className={align === val ? styles.active : ''}
            onClick={() => onStyleChange(buildImageStyle(val, size))}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={styles.divider} />
      <div className={styles.group}>
        {SIZES.map(({ val, label }) => (
          <button
            key={val}
            type="button"
            className={size === val ? styles.active : ''}
            onClick={() => onStyleChange(buildImageStyle(align, val))}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
