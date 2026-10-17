import { Link } from 'react-router-dom';
import { CategoryIcon } from './CategoryIcon';
import type { Category } from '../types';

/**
 * A category label set like a strip of gaffer tape: the site's one tilted
 * element ("let heads tilt"). Used wherever a story names its section.
 */
export function Tape({ category, as = 'link' }: { category: Pick<Category, 'name' | 'slug' | 'icon' | 'iconSvg'>; as?: 'link' | 'span' }) {
  const body = (
    <>
      <CategoryIcon icon={category.icon} iconSvg={category.iconSvg} />
      {category.name}
    </>
  );
  return as === 'link'
    ? <Link to={`/categories/${category.slug}`} className="tape">{body}</Link>
    : <span className="tape">{body}</span>;
}
