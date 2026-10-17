/**
 * A category's icon. New icons are stored as their SVG shape ({ w, h, d }) so
 * they render without the Font Awesome library; older values were free text
 * (usually an emoji) and are shown as-is.
 */
export function CategoryIcon({ icon, iconSvg, className }: { icon?: string | null; iconSvg?: string | null; className?: string }) {
  if (iconSvg) {
    try {
      const { w, h, d } = JSON.parse(iconSvg) as { w: number; h: number; d: string };
      return (
        <svg viewBox={`0 0 ${w} ${h}`} className={className} width="1em" height="1em" aria-hidden="true" focusable="false" style={{ verticalAlign: '-0.125em' }}>
          <path fill="currentColor" d={d} />
        </svg>
      );
    } catch {
      /* fall through to the text value */
    }
  }
  if (icon && !icon.startsWith('fa-')) return <span className={className} aria-hidden="true">{icon}</span>;
  return null;
}
