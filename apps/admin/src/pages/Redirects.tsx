import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { AdminLayout } from '../components/AdminLayout';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmDialog';
import {
  createRedirect,
  deleteRedirect,
  fetchRedirects,
  updateRedirect,
  Redirect,
} from '../services/redirects';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCompress, faGripVertical, faExpand } from '@fortawesome/free-solid-svg-icons';
import { useDensity } from '../hooks/useDensity';
import styles from './Redirects.module.css';

function errMsg(err: unknown): string {
  return (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || 'An error occurred';
}

const EMPTY = { fromPath: '', toPath: '', type: 301 };

export default function RedirectsPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [redirects, setRedirects] = useState<Redirect[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<Redirect | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [density, setDensity] = useDensity('redirectsDensity');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      setRedirects(await fetchRedirects());
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setLoading(false);
    }
  }

  function startEdit(r: Redirect) {
    setEditing(r);
    setForm({ fromPath: r.fromPath, toPath: r.toPath, type: r.type });
  }

  function cancelEdit() {
    setEditing(null);
    setForm(EMPTY);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fromPath || !form.toPath) {
      toast.error('Both From and To paths are required');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateRedirect(editing.id, form);
        toast.success('Redirect updated');
      } else {
        await createRedirect(form.fromPath, form.toPath, form.type);
        toast.success('Redirect created');
      }
      setEditing(null);
      setForm(EMPTY);
      await load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(r: Redirect) {
    if (!(await confirm({ title: 'Delete Redirect', message: `Remove redirect from "${r.fromPath}"?`, confirmLabel: 'Delete', danger: true }))) return;
    try {
      await deleteRedirect(r.id);
      toast.success('Redirect deleted');
      await load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  }

  const filtered = redirects.filter(
    (r) => !search || r.fromPath.includes(search) || r.toPath.includes(search)
  );

  return (
    <AdminLayout>
      <div className={styles.header}>
        <h2 className={styles.title}>Redirect Manager</h2>
        <p className={styles.subtitle}>
          Map old URLs to new locations. Redirects are resolved by the web server before page load.
        </p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <h3 className={styles.formTitle}>{editing ? 'Edit Redirect' : 'Add Redirect'}</h3>
        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label>From Path</label>
            <input
              type="text"
              placeholder="/old-slug"
              value={form.fromPath}
              onChange={(e) => setForm((f) => ({ ...f, fromPath: e.target.value }))}
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label>To Path or URL</label>
            <input
              type="text"
              placeholder="/new-slug or https://example.com/page"
              value={form.toPath}
              onChange={(e) => setForm((f) => ({ ...f, toPath: e.target.value }))}
              required
            />
          </div>
          <div className={styles.formGroupNarrow}>
            <label>Type</label>
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: Number(e.target.value) }))}>
              <option value={301}>301 Permanent</option>
              <option value={302}>302 Temporary</option>
            </select>
          </div>
        </div>
        <div className={styles.formActions}>
          <button type="submit" className={styles.saveButton} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Update' : 'Add Redirect'}
          </button>
          {editing && (
            <button type="button" className={styles.cancelButton} onClick={cancelEdit}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <span className={styles.tableCount}>{filtered.length} redirect{filtered.length !== 1 ? 's' : ''}</span>
          <input
            className={styles.search}
            type="text"
            placeholder="Search paths…"
            value={search}
            autoFocus
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className={styles.densitySwitch} role="group" aria-label="List density">
            <button type="button" className={`${styles.densityOption} ${density === 'compact' ? styles.densityOptionActive : ''}`} onClick={() => setDensity('compact')} title="Compact" aria-pressed={density === 'compact'}><FontAwesomeIcon icon={faCompress} /></button>
            <button type="button" className={`${styles.densityOption} ${density === 'condensed' ? styles.densityOptionActive : ''}`} onClick={() => setDensity('condensed')} title="Condensed" aria-pressed={density === 'condensed'}><FontAwesomeIcon icon={faGripVertical} /></button>
            <button type="button" className={`${styles.densityOption} ${density === 'relaxed' ? styles.densityOptionActive : ''}`} onClick={() => setDensity('relaxed')} title="Relaxed" aria-pressed={density === 'relaxed'}><FontAwesomeIcon icon={faExpand} /></button>
          </div>
        </div>

        {loading ? (
          <div className={styles.empty}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>{search ? 'No redirects match your search.' : 'No redirects yet.'}</div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles[`density_${density}`]}>
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Type</th>
                  <th>Hits</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className={styles.pathCell}>{r.fromPath}</td>
                    <td className={styles.pathCell}>{r.toPath}</td>
                    <td>
                      <span className={r.type === 301 ? styles.badge301 : styles.badge302}>
                        {r.type}
                      </span>
                    </td>
                    <td className={styles.hits}>{r.hits.toLocaleString()}</td>
                    <td className={styles.actions}>
                      <button onClick={() => startEdit(r)}>Edit</button>
                      <button className={styles.deleteButton} onClick={() => handleDelete(r)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
