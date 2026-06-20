import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { AdminLayout } from '../components/AdminLayout';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import { TagForm } from '../components/TagForm';
import { Tag } from '../types';
import { deleteTag, fetchTags } from '../services/tags';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCompress, faGripVertical, faExpand } from '@fortawesome/free-solid-svg-icons';
import { useDensity } from '../hooks/useDensity';
import styles from './Tags.module.css';

const PAGE_SIZE = 10;

export default function TagsPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const [tags, setTags] = useState<Tag[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [density, setDensity] = useDensity('tagsDensity');

  useEffect(() => {
    loadTags();
  }, [page, search]);

  async function loadTags() {
    setLoading(true);
    try {
      const result = await fetchTags(page, PAGE_SIZE, search);
      setTags(result.items);
      setTotal(result.pagination.total);
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Failed to load tags'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(tag: Tag) {
    if (!(await confirm({ title: 'Delete Tag', message: `Delete tag "${tag.name}"? This cannot be undone.`, confirmLabel: 'Delete', danger: true }))) {
      return;
    }

    try {
      await deleteTag(tag.id);
      if (editingTag?.id === tag.id) {
        setEditingTag(null);
      }
      await loadTags();
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Failed to delete tag'
      );
    }
  }

  function handleSaved() {
    setEditingTag(null);
    setFormKey((k) => k + 1);
    loadTags();
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminLayout>
      <h2 className={styles.title}>Tags</h2>

      <div className={styles.layout}>
        <div className={styles.formColumn}>
          <TagForm
            key={`${editingTag?.id ?? 'new'}-${formKey}`}
            tag={editingTag}
            onSaved={handleSaved}
            onCancel={() => setEditingTag(null)}
          />
        </div>

        <div className={styles.listColumn}>
          <div className={styles.toolbar}>
            <div className={styles.search}>
              <input
                type="text"
                placeholder="Search tags..."
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
                  <th>Description</th>
                  <th className={styles.countCell}>Posts</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tags.map((tag) => (
                  <tr key={tag.id}>
                    <td>{tag.name}</td>
                    <td>
                      <code className={styles.slug}>{tag.slug}</code>
                    </td>
                    <td className={styles.description}>{tag.description || '—'}</td>
                    <td className={styles.countCell}>{tag._count?.posts ?? '—'}</td>
                    <td className={styles.actions}>
                      <button onClick={() => setEditingTag(tag)}>Edit</button>
                      <button className={styles.deleteButton} onClick={() => handleDelete(tag)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!loading && tags.length === 0 && <div className={styles.empty}>No tags found.</div>}
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
