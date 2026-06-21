import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { PERMISSIONS } from '@headtilts/shared';
import { AdminLayout } from '../components/AdminLayout';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faArrowUpRightFromSquare, faCompress, faGripVertical, faExpand } from '@fortawesome/free-solid-svg-icons';
import { useDensity } from '../hooks/useDensity';
import { useAuth } from '../hooks/useAuth';
import { SitemapEntry } from '../types';
import {
  fetchSitemapEntries,
  createSitemapEntry,
  updateSitemapEntry,
  deleteSitemapEntry,
} from '../services/sitemap';
import styles from './Sitemap.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const CHANGEFREQ_OPTIONS = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];

function errMsg(err: unknown, fallback: string) {
  return (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback;
}

type ModalMode = 'create' | 'edit';

interface ModalState {
  mode: ModalMode;
  entry?: SitemapEntry;
}

export default function SitemapPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const [entries, setEntries] = useState<SitemapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [density, setDensity] = useDensity('sitemapDensity');

  const [modal, setModal] = useState<ModalState | null>(null);
  const [formUrl, setFormUrl] = useState('');
  const [formPriority, setFormPriority] = useState('0.5');
  const [formChangefreq, setFormChangefreq] = useState('weekly');
  const [formLastmod, setFormLastmod] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      setEntries(await fetchSitemapEntries());
    } catch (err) {
      toast.error(errMsg(err, 'Failed to load sitemap entries'));
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setFormUrl('');
    setFormPriority('0.5');
    setFormChangefreq('weekly');
    setFormLastmod('');
    setModal({ mode: 'create' });
  }

  function openEdit(entry: SitemapEntry) {
    setFormUrl(entry.url);
    setFormPriority(String(entry.priority));
    setFormChangefreq(entry.changefreq || 'weekly');
    setFormLastmod(entry.lastmod ? entry.lastmod.slice(0, 10) : '');
    setModal({ mode: 'edit', entry });
  }

  function closeModal() { setModal(null); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormSaving(true);
    try {
      const payload = {
        url: formUrl.trim(),
        priority: parseFloat(formPriority) || 0.5,
        changefreq: formChangefreq || null,
        lastmod: formLastmod || null,
      };
      if (modal?.mode === 'edit' && modal.entry) {
        await updateSitemapEntry(modal.entry.id, payload);
      } else {
        await createSitemapEntry(payload);
      }
      closeModal();
      await load();
    } catch (err) {
      toast.error(errMsg(err, 'Failed to save entry'));
    } finally {
      setFormSaving(false);
    }
  }

  async function handleDelete(entry: SitemapEntry) {
    if (!(await confirm({ title: 'Remove Entry', message: `Remove "${entry.url}" from the sitemap?`, confirmLabel: 'Remove', danger: true }))) return;
    try {
      await deleteSitemapEntry(entry.id);
      await load();
    } catch (err) {
      toast.error(errMsg(err, 'Failed to delete entry'));
    }
  }

  const canManage = hasPermission(PERMISSIONS.SEO_MANAGE);
  const xmlUrl = `${API_URL}/sitemap/xml`;

  return (
    <AdminLayout>
      <div className={styles.header}>
        <h2 className={styles.title}>Sitemap</h2>
        <div className={styles.headerActions}>
          <div className={styles.densitySwitch} role="group" aria-label="List density">
            <button type="button" className={`${styles.densityOption} ${density === 'compact' ? styles.densityOptionActive : ''}`} onClick={() => setDensity('compact')} title="Compact" aria-pressed={density === 'compact'}><FontAwesomeIcon icon={faCompress} /></button>
            <button type="button" className={`${styles.densityOption} ${density === 'condensed' ? styles.densityOptionActive : ''}`} onClick={() => setDensity('condensed')} title="Condensed" aria-pressed={density === 'condensed'}><FontAwesomeIcon icon={faGripVertical} /></button>
            <button type="button" className={`${styles.densityOption} ${density === 'relaxed' ? styles.densityOptionActive : ''}`} onClick={() => setDensity('relaxed')} title="Relaxed" aria-pressed={density === 'relaxed'}><FontAwesomeIcon icon={faExpand} /></button>
          </div>
          <a href={xmlUrl} target="_blank" rel="noreferrer" className={styles.xmlBtn}>
            View XML <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
          </a>
          {canManage && (
            <button className={styles.addButton} onClick={openCreate}>Add Entry</button>
          )}
        </div>
      </div>

      <div className={styles.notice}>
        The sitemap XML is auto-generated from all published posts and pages, plus any manual entries you add here.
        Available at <code>{xmlUrl}</code>
      </div>


      <div className={styles.tableWrapper}>
        <table className={styles[`density_${density}`]}>
          <thead>
            <tr>
              <th>URL</th>
              <th>Priority</th>
              <th>Changefreq</th>
              <th>Last Modified</th>
              {canManage && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className={styles.url}>{entry.url}</td>
                <td>
                  <span className={styles.priority}>{entry.priority.toFixed(1)}</span>
                </td>
                <td className={styles.freq}>{entry.changefreq || <span className={styles.muted}>—</span>}</td>
                <td className={styles.date}>
                  {entry.lastmod ? entry.lastmod.slice(0, 10) : <span className={styles.muted}>—</span>}
                </td>
                {canManage && (
                  <td className={styles.actions}>
                    <button onClick={() => openEdit(entry)}>Edit</button>
                    <button className={styles.deleteButton} onClick={() => handleDelete(entry)}>Delete</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && entries.length === 0 && (
          <div className={styles.empty}>No manual entries. All published posts/pages are included automatically.</div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3>{modal.mode === 'create' ? 'Add Sitemap Entry' : 'Edit Entry'}</h3>
              <button className={styles.closeBtn} onClick={closeModal}><FontAwesomeIcon icon={faXmark} /></button>
            </div>
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.field}>
                <label>URL</label>
                <input value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://…" required disabled={formSaving} autoFocus />
              </div>
              <div className={styles.twoCol}>
                <div className={styles.field}>
                  <label>Priority (0.0 – 1.0)</label>
                  <input type="number" step="0.1" min="0" max="1" value={formPriority} onChange={(e) => setFormPriority(e.target.value)} disabled={formSaving} />
                </div>
                <div className={styles.field}>
                  <label>Change Frequency</label>
                  <select value={formChangefreq} onChange={(e) => setFormChangefreq(e.target.value)} disabled={formSaving}>
                    <option value="">— none —</option>
                    {CHANGEFREQ_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>
              <div className={styles.field}>
                <label>Last Modified</label>
                <input type="date" value={formLastmod} onChange={(e) => setFormLastmod(e.target.value)} disabled={formSaving} />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={closeModal} disabled={formSaving}>Cancel</button>
                <button type="submit" className={styles.saveBtn} disabled={formSaving || !formUrl.trim()}>
                  {formSaving ? 'Saving…' : modal.mode === 'create' ? 'Add Entry' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
