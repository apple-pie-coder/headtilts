export function readingTime(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&[a-zA-Z#0-9]+;/g, ' ');
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
