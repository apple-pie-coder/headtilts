// Text helpers for server-drawn SVG images (rasterised by sharp). SVG has no text
// layout, so widths are estimated per glyph and lines are wrapped by hand.

/** Installed in the API image: Inter for text, DejaVu for symbols Inter lacks. */
export const SVG_FONT = `Inter, 'DejaVu Sans', sans-serif`;

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Estimated text width in px (there is no layout engine in SVG). Widths are
 * Inter's rough advance per kind of glyph, which keeps wrapping close for both
 * lowercase titles and ALL-CAPS band names.
 */
export function textWidth(s: string, size: number, bold = false): number {
  let em = 0;
  for (const ch of s) {
    if (/[ilj.,:;'’|!()[\]\s]/.test(ch)) em += 0.27;
    else if (/[mwMW@%—]/.test(ch)) em += 0.86;
    else if (/[A-Z]/.test(ch)) em += 0.68;
    else if (/[0-9₹$€£]/.test(ch)) em += 0.6;
    else em += 0.53;
  }
  return em * size * (bold ? 1.06 : 1);
}

export function truncate(s: string, size: number, maxWidth: number, bold = false): string {
  if (textWidth(s, size, bold) <= maxWidth) return s;
  let out = s;
  while (out.length > 1 && textWidth(`${out}…`, size, bold) > maxWidth) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

export function wrap(text: string, size: number, maxWidth: number, maxLines: number, bold = true): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.trim().split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, size, bold) <= maxWidth || !line) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = truncate(`${kept[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`, size, maxWidth, bold);
  return kept;
}
