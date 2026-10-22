import type { CSSProperties } from 'react';

/** Crop position chosen for a featured image in the editor ("x% y%"), as an inline style. */
export function focusStyle(post: { featuredImageFocus?: string | null }): CSSProperties | undefined {
  return post.featuredImageFocus ? { objectPosition: post.featuredImageFocus } : undefined;
}

/** Crop focus plus a zoom around it, as chosen for a celebration photo in the editor. */
export function framingStyle(focus?: string | null, zoom?: number | null): CSSProperties | undefined {
  if (!focus && !(zoom && zoom > 1)) return undefined;
  const position = focus || '50% 50%';
  return zoom && zoom > 1
    ? { objectPosition: position, transformOrigin: position, ['--zoom' as string]: zoom }
    : { objectPosition: position };
}
