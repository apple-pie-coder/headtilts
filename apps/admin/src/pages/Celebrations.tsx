import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { AdminLayout } from '../components/AdminLayout';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import { CelebrationForm } from '../components/CelebrationForm';
import { Celebration } from '../types';
import { deleteCelebration, fetchCelebrations } from '../services/celebrations';
import { resolveMediaUrl } from '../services/media';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCompress, faGripVertical, faExpand } from '@fortawesome/free-solid-svg-icons';
import { useDensity } from '../hooks/useDensity';
import styles from './Celebrations.module.css';

const PAGE_SIZE = 10;
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function CelebrationsPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const [items, setItems] = useState<Celebration[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Celebration | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [density, setDensity] = useDensity('celebrationsDensity');

  useEffect(() => {
    load();
  }, [page, search, typeFilter]);

  async function load() {
    setLoading(true);
    try {
      const result = await fetchCelebrations(page, PAGE_SIZE, search, typeFilter);
      setItems(result.items);
      setTotal(result.pagination.total);
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Failed to load celebrations'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(c: Celebration) {
    if (!(await confirm({ title: 'Delete Celebration', message: `Remove "${c.name}"? This cannot be undone.`, confirmLabel: 'Delete', danger: true }))) {
      return;
    }
    try {
      await deleteCelebration(c.id);
      if (editing?.id === c.id) setEditing(null);
      await load();
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Failed to delete celebration'
      );
    }
  }

  function handleSaved() {
    setEditing(null);
    setFormKey((k) => k + 1);
    load();
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminLayout>
      <h2 className={styles.title}>Celebrations</h2>
      <p className={styles.intro}>
        Artist birthdays and remembrances. On a matching day, the public site greets visitors
        with an animated spotlight.
      </p>

      <div className={styles.layout}>
        <div className={styles.formColumn}>
          <CelebrationForm
            key={`${editing?.id ?? 'new'}-${formKey}`}
            celebration={editing}
            onSaved={handleSaved}
            onCancel={() => setEditing(null)}
          />
        </div>

        <div className={styles.listColumn}>
          <div className={styles.toolbar}>
            <select
              className={styles.filter}
              value={typeFilter}
              onChange={(e) => { setPage(1); setTypeFilter(e.target.value); }}
            >
              <option value="">All types</option>
              <option value="birthday">Birthdays</option>
              <option value="remembrance">Remembrances</option>
            </select>
            <div className={styles.search}>
              <input
                type="text"
                placeholder="Search by name…"
                value={search}
                onChange={(e) => { setPage(1); setSearch(e.target.value); }}
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
                  <th></th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Year</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.photo
                        ? <img className={styles.thumb} src={resolveMediaUrl(c.photo)} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                        : <span className={`${styles.thumb} ${styles.thumbEmpty}`}>{c.type === 'birthday' ? '🎂' : '🕯️'}</span>}
                    </td>
                    <td>{c.name}</td>
                    <td>
                      <span className={`${styles.badge} ${c.type === 'birthday' ? styles.badgeBirthday : styles.badgeRemembrance}`}>
                        {c.type === 'birthday' ? 'Birthday' : 'Remembrance'}
                      </span>
                    </td>
                    <td>{MONTHS_SHORT[c.month - 1]} {c.day}</td>
                    <td>{c.year || '—'}</td>
                    <td>
                      <span className={c.isActive ? styles.statusActive : styles.statusInactive}>
                        {c.isActive ? 'Active' : 'Hidden'}
                      </span>
                    </td>
                    <td className={styles.actions}>
                      <button onClick={() => setEditing(c)}>Edit</button>
                      <button className={styles.deleteButton} onClick={() => handleDelete(c)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!loading && items.length === 0 && <div className={styles.empty}>No celebrations yet.</div>}
          </div>

          <div className={styles.pagination}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Previous</button>
            <span>Page {page} of {pages}</span>
            <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}>Next</button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
