import type { CSSProperties } from 'react';

/** Crop position chosen for a featured image in the editor ("x% y%"), as an inline style. */
export function focusStyle(post: { featuredImageFocus?: string | null }): CSSProperties | undefined {
  return post.featuredImageFocus ? { objectPosition: post.featuredImageFocus } : undefined;
}
