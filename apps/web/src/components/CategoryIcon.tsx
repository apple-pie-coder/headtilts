/**
 * A category's icon, drawn from the SVG shape saved with the category, so the
 * public site never loads the icon library. Legacy free-text icons (emoji)
 * are shown as-is.
 */
export function CategoryIcon({ icon, iconSvg }: { icon?: string | null; iconSvg?: string | null }) {
  if (iconSvg) {
    try {
      const { w, h, d } = JSON.parse(iconSvg) as { w: number; h: number; d: string };
      return (
        <svg className="cat-icon" viewBox={`0 0 ${w} ${h}`} width="1em" height="1em" aria-hidden="true" focusable="false">
          <path fill="currentColor" d={d} />
        </svg>
      );
    } catch {
      /* fall through */
    }
  }
  if (icon && !icon.startsWith('fa-')) return <span className="cat-icon" aria-hidden="true">{icon}</span>;
  return null;
}
