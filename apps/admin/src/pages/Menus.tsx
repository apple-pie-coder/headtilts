import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { PERMISSIONS } from '@headtilts/shared';
import { AdminLayout } from '../components/AdminLayout';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../hooks/useAuth';
import { MenuSummary } from '../types';
import { createMenu, deleteMenu, fetchMenus } from '../services/menus';
import styles from './Menus.module.css';

function errorMsg(err: unknown, fallback: string) {
  return (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback;
}

const LOCATION_SUGGESTIONS = ['primary', 'footer', 'social', 'sidebar'];

export default function MenusPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [menus, setMenus] = useState<MenuSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLocation, setNewLocation] = useState('primary');
  const [creating, setCreating] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      setMenus(await fetchMenus());
    } catch (err) {
      toast.error(errorMsg(err, 'Failed to load menus'));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const menu = await createMenu({ name: newName.trim(), location: newLocation.trim() });
      setNewName('');
      setNewLocation('primary');
      setShowCreate(false);
      navigate(`/admin/menus/${menu.id}`);
    } catch (err) {
      toast.error(errorMsg(err, 'Failed to create menu'));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(menu: MenuSummary) {
    if (!(await confirm({ title: 'Delete Menu', message: `Delete menu "${menu.name}"? All its items will be removed.`, confirmLabel: 'Delete', danger: true }))) return;
    try {
      await deleteMenu(menu.id);
      await load();
    } catch (err) {
      toast.error(errorMsg(err, 'Failed to delete menu'));
    }
  }

  const canCreate = hasPermission(PERMISSIONS.MENU_CREATE);
  const canDelete = hasPermission(PERMISSIONS.MENU_DELETE);

  return (
    <AdminLayout>
      <div className={styles.header}>
        <h2 className={styles.title}>Menus</h2>
        {canCreate && (
          <button className={styles.addButton} onClick={() => setShowCreate(true)}>
            Create Menu
          </button>
        )}
      </div>

      {showCreate && (
        <div className={styles.createPanel}>
          <h3>Create a New Menu</h3>
          <form onSubmit={handleCreate} className={styles.createForm}>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Menu Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Main Navigation"
                  required
                  disabled={creating}
                  autoFocus
                />
              </div>
              <div className={styles.formGroup}>
                <label>Location</label>
                <input
                  type="text"
                  list="location-suggestions"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  placeholder="e.g. primary"
                  required
                  disabled={creating}
                />
                <datalist id="location-suggestions">
                  {LOCATION_SUGGESTIONS.map((l) => <option key={l} value={l} />)}
                </datalist>
                <span className={styles.hint}>Unique identifier used by your theme (e.g. primary, footer)</span>
              </div>
            </div>
            <div className={styles.formActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setShowCreate(false)} disabled={creating}>
                Cancel
              </button>
              <button type="submit" className={styles.createBtn} disabled={creating || !newName.trim() || !newLocation.trim()}>
                {creating ? 'Creating…' : 'Create Menu'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className={styles.tableWrapper}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Location</th>
              <th>Items</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {menus.map((menu) => (
              <tr key={menu.id}>
                <td>
                  <button className={styles.nameLink} onClick={() => navigate(`/admin/menus/${menu.id}`)}>
                    {menu.name}
                  </button>
                </td>
                <td><span className={styles.locationChip}>{menu.location}</span></td>
                <td className={styles.count}>{menu._count.items}</td>
                <td className={styles.actions}>
                  <button onClick={() => navigate(`/admin/menus/${menu.id}`)}>Edit</button>
                  {canDelete && (
                    <button className={styles.deleteButton} onClick={() => handleDelete(menu)}>
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && menus.length === 0 && (
          <div className={styles.empty}>
            No menus yet.{canCreate && <> <button className={styles.emptyLink} onClick={() => setShowCreate(true)}>Create your first menu.</button></>}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
