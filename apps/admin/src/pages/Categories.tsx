import { useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { AdminLayout } from '../components/AdminLayout';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import { CategoryForm } from '../components/CategoryForm';
import { Category } from '../types';
import { deleteCategory, fetchCategories } from '../services/categories';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCompress, faGripVertical, faExpand } from '@fortawesome/free-solid-svg-icons';
import { useDensity } from '../hooks/useDensity';
import styles from './Categories.module.css';

/** Re-order a flat list so each parent is immediately followed by its children. */
function toTreeOrder(cats: Category[]): Category[] {
  const byParent = new Map<number | null, Category[]>();
  for (const c of cats) {
    const key = c.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(c);
  }
  function walk(parentId: number | null): Category[] {
    return (byParent.get(parentId) ?? []).flatMap((c) => [c, ...walk(c.id)]);
  }
  return walk(null);
}

export default function CategoriesPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [density, setDensity] = useDensity('categoriesDensity');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const result = await fetchCategories(1, 500);
      setAllCategories(result.items);
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Failed to load categories',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(category: Category) {
    if (!(await confirm({ title: 'Delete Category', message: `Delete category "${category.name}"? This cannot be undone.`, confirmLabel: 'Delete', danger: true }))) return;
    try {
      await deleteCategory(category.id);
      if (editingCategory?.id === category.id) setEditingCategory(null);
      await load();
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Failed to delete category',
      );
    }
  }

  function handleSaved() {
    setEditingCategory(null);
    setFormKey((k) => k + 1);
    load();
  }

  // When searching: flat filter across all fields.
  // When not searching: tree order (parents first, children indented beneath them).
  const displayCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return toTreeOrder(allCategories);
    return allCategories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q),
    );
  }, [allCategories, search]);

  return (
    <AdminLayout>
      <h2 className={styles.title}>Categories</h2>

      <div className={styles.layout}>
        <div className={styles.formColumn}>
          <CategoryForm
            key={`${editingCategory?.id ?? 'new'}-${formKey}`}
            category={editingCategory}
            categories={allCategories}
            onSaved={handleSaved}
            onCancel={() => setEditingCategory(null)}
          />
        </div>

        <div className={styles.listColumn}>
          <div className={styles.toolbar}>
            <div className={styles.search}>
              <input
                type="text"
                placeholder="Search categories..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className={styles.densitySwitch} role="group" aria-label="List density">
              <button type="button" className={`${styles.densityOption} ${density === 'compact'   ? styles.densityOptionActive : ''}`} onClick={() => setDensity('compact')}   title="Compact"    aria-pressed={density === 'compact'}  ><FontAwesomeIcon icon={faCompress}    /></button>
              <button type="button" className={`${styles.densityOption} ${density === 'condensed' ? styles.densityOptionActive : ''}`} onClick={() => setDensity('condensed')} title="Condensed"  aria-pressed={density === 'condensed'}><FontAwesomeIcon icon={faGripVertical} /></button>
              <button type="button" className={`${styles.densityOption} ${density === 'relaxed'   ? styles.densityOptionActive : ''}`} onClick={() => setDensity('relaxed')}   title="Relaxed"    aria-pressed={density === 'relaxed'}  ><FontAwesomeIcon icon={faExpand}       /></button>
            </div>
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles[`density_${density}`]}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Description</th>
                  <th className={styles.countCell}>Posts</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayCategories.map((category) => {
                  const isChild = !!category.parentId && !search.trim();
                  return (
                    <tr key={category.id} className={isChild ? styles.subcategoryRow : undefined}>
                      <td>
                        <span className={isChild ? styles.subcategoryName : undefined}>
                          {isChild && <span className={styles.nestingMark} aria-hidden="true">└</span>}
                          {category.icon && <span className={styles.icon}>{category.icon}</span>}
                          {category.name}
                          {category.parentId && search.trim() && (
                            <span className={styles.parentBadge}>{category.parent?.name}</span>
                          )}
                        </span>
                      </td>
                      <td><code className={styles.slug}>{category.slug}</code></td>
                      <td className={styles.description}>{category.description || '—'}</td>
                      <td className={styles.countCell}>{category._count?.posts ?? '—'}</td>
                      <td className={styles.actions}>
                        <button onClick={() => setEditingCategory(category)}>Edit</button>
                        <button className={styles.deleteButton} onClick={() => handleDelete(category)}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!loading && displayCategories.length === 0 && (
              <div className={styles.empty}>No categories found.</div>
            )}
          </div>

          <div className={styles.pagination}>
            <span>{displayCategories.length} {displayCategories.length === 1 ? 'category' : 'categories'}</span>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
