import { useEffect, useState } from 'react';
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

const PAGE_SIZE = 10;

export default function CategoriesPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [density, setDensity] = useDensity('categoriesDensity');

  useEffect(() => {
    loadAllCategories();
  }, []);

  useEffect(() => {
    loadCategories();
  }, [page, search]);

  async function loadAllCategories() {
    try {
      const result = await fetchCategories(1, 200);
      setAllCategories(result.items);
    } catch {
      setAllCategories([]);
    }
  }

  async function loadCategories() {
    setLoading(true);
    try {
      const result = await fetchCategories(page, PAGE_SIZE, search);
      setCategories(result.items);
      setTotal(result.pagination.total);
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Failed to load categories'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(category: Category) {
    if (!(await confirm({ title: 'Delete Category', message: `Delete category "${category.name}"? This cannot be undone.`, confirmLabel: 'Delete', danger: true }))) {
      return;
    }

    try {
      await deleteCategory(category.id);
      if (editingCategory?.id === category.id) {
        setEditingCategory(null);
      }
      await loadCategories();
      await loadAllCategories();
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Failed to delete category'
      );
    }
  }

  function handleSaved() {
    setEditingCategory(null);
    setFormKey((k) => k + 1);
    loadCategories();
    loadAllCategories();
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
                onChange={(e) => {
                  setPage(1);
                  setSearch(e.target.value);
                }}
              />
            </div>
            <div className={styles.densitySwitch} role="group" aria-label="List density">
              <button type="button" className={`${styles.densityOption} ${density === 'compact' ? styles.densityOptionActive : ''}`} onClick={() => setDensity('compact')} title="Compact" aria-pressed={density === 'compact'}><FontAwesomeIcon icon={faCompress} /></button>
              <button type="button" className={`${styles.densityOption} ${density === 'condensed' ? styles.densityOptionActive : ''}`} onClick={() => setDensity('condensed')} title="Condensed" aria-pressed={density === 'condensed'}><FontAwesomeIcon icon={faGripVertical} /></button>
              <button type="button" className={`${styles.densityOption} ${density === 'relaxed' ? styles.densityOptionActive : ''}`} onClick={() => setDensity('relaxed')} title="Relaxed" aria-pressed={density === 'relaxed'}><FontAwesomeIcon icon={faExpand} /></button>
            </div>
          </div>


          <div className={styles.tableWrapper}>
            <table className={styles[`density_${density}`]}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Parent</th>
                  <th>Description</th>
                  <th className={styles.countCell}>Posts</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => {
                  const isSubcategory = !!category.parentId;
                  return (
                    <tr
                      key={category.id}
                      className={isSubcategory ? styles.subcategoryRow : undefined}
                    >
                      <td>
                        <span className={isSubcategory ? styles.subcategoryName : undefined}>
                          {isSubcategory && <span className={styles.nestingMark} aria-hidden="true" />}
                          {category.icon && <span className={styles.icon}>{category.icon}</span>}
                          {category.name}
                        </span>
                      </td>
                      <td>
                        <code className={styles.slug}>{category.slug}</code>
                      </td>
                      <td>{category.parent?.name || '—'}</td>
                      <td className={styles.description}>{category.description || '—'}</td>
                      <td className={styles.countCell}>{category._count?.posts ?? '—'}</td>
                      <td className={styles.actions}>
                        <button onClick={() => setEditingCategory(category)}>Edit</button>
                        <button className={styles.deleteButton} onClick={() => handleDelete(category)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!loading && categories.length === 0 && <div className={styles.empty}>No categories found.</div>}
          </div>

          <div className={styles.pagination}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              Previous
            </button>
            <span>
              Page {page} of {pages}
            </span>
            <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}>
              Next
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
