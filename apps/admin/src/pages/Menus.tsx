import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { PERMISSIONS } from '@headtilts/shared';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPen, faTrashCan, faBars, faPlus } from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import {
  Button, Card, EmptyState, Field, FieldHint, MenuItem, PageHeader, Panel, RowMenu, TableSkeleton, relativeTime, absoluteTime,
} from '../components/ui';
import t from '../components/ui/table.module.css';
import { useAuth } from '../hooks/useAuth';
import { useHotkeys } from '../hooks/useHotkeys';
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
  const canCreate = hasPermission(PERMISSIONS.MENU_CREATE);
  const canEdit = hasPermission(PERMISSIONS.MENU_EDIT);
  const canDelete = hasPermission(PERMISSIONS.MENU_DELETE);

  const [menus, setMenus] = useState<MenuSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [creating, setCreating] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, []);

  useHotkeys({ n: () => nameRef.current?.focus() });

  async function load() {
    try {
      setMenus(await fetchMenus());
      setLoaded(true);
    } catch (err) {
      toast.error(errorMsg(err, 'Failed to load menus'));
    }
  }

  const location = newLocation.trim().toLowerCase();
  const taken = menus.find((m) => m.location === location);
  // Default to the first unused suggestion so creating a menu is one field.
  const suggested = LOCATION_SUGGESTIONS.find((l) => !menus.some((m) => m.location === l)) ?? '';
  const effectiveLocation = location || suggested;

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !effectiveLocation || taken) return;
    setCreating(true);
    try {
      const menu = await createMenu({ name: newName.trim(), location: effectiveLocation });
      toast.success(`Created “${menu.name}” — now add some links`);
      navigate(`/admin/menus/${menu.id}`);
    } catch (err) {
      toast.error(errorMsg(err, 'Failed to create menu'));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(menu: MenuSummary) {
    if (!(await confirm({
      title: `Delete “${menu.name}”?`,
      message: `Its ${menu._count.items} item${menu._count.items === 1 ? '' : 's'} will be removed and the “${menu.location}” spot on your site will be empty.`,
      confirmLabel: 'Delete menu',
      danger: true,
    }))) return;
    try {
      await deleteMenu(menu.id);
      toast.success('Menu deleted');
      load();
    } catch (err) {
      toast.error(errorMsg(err, 'Failed to delete menu'));
    }
  }

  function menuItems(menu: MenuSummary): MenuItem[] {
    return [
      { label: 'Edit items', icon: faPen, onClick: () => navigate(`/admin/menus/${menu.id}`), hidden: !canEdit },
      { label: 'Delete', icon: faTrashCan, onClick: () => handleDelete(menu), danger: true, hidden: !canDelete, divider: true },
    ];
  }

  return (
    <AdminLayout>
      <PageHeader title="Menus" subtitle="Navigation shown in your site's header, footer and other theme locations." />

      <div className={t.split}>
        <div className={t.splitAside}>
          {canCreate && (
            <Panel title="Create a menu">
              <form onSubmit={handleCreate}>
                <Field label="Name">
                  <input
                    ref={nameRef}
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Main navigation"
                    required
                    disabled={creating}
                  />
                </Field>
                <Field label="Location" group>
                  <div className={styles.locations}>
                    {LOCATION_SUGGESTIONS.map((l) => {
                      const used = menus.some((m) => m.location === l);
                      return (
                        <button
                          key={l}
                          type="button"
                          className={`${styles.loc} ${effectiveLocation === l ? styles.locOn : ''}`}
                          onClick={() => setNewLocation(l)}
                          disabled={used}
                          title={used ? 'Already has a menu' : undefined}
                        >
                          {l}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    placeholder={suggested ? `${suggested} (or type a custom one)` : 'custom-location'}
                    aria-label="Custom location"
                    aria-invalid={!!taken}
                    disabled={creating}
                  />
                  {taken
                    ? <FieldHint tone="danger">“{taken.name}” already uses this location.</FieldHint>
                    : <FieldHint>Your theme decides where each location appears.</FieldHint>}
                </Field>
                <div>
                  <Button type="submit" variant="primary" icon={faPlus} disabled={creating || !newName.trim() || !effectiveLocation || !!taken}>
                    {creating ? 'Creating…' : 'Create and add items'}
                  </Button>
                </div>
              </form>
            </Panel>
          )}
        </div>

        <div className={t.splitMain}>
          <Card>
            <div className={t.scroll}>
              <table className={t.table}>
                <thead>
                  <tr>
                    <th>Menu</th>
                    <th>Location</th>
                    <th className={t.num}>Items</th>
                    <th className={t.hideSm}>Updated</th>
                    <th className={t.actionsCol}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {!loaded && <TableSkeleton rows={3} cols={5} />}
                  {menus.map((menu) => (
                    <tr key={menu.id}>
                      <td className={t.primaryCell}>
                        <div className={t.stack}>
                          {canEdit
                            ? <Link to={`/admin/menus/${menu.id}`} className={t.primary}>{menu.name}</Link>
                            : <span className={t.primary}>{menu.name}</span>}
                          {menu.description && <span className={t.secondary}>{menu.description}</span>}
                        </div>
                      </td>
                      <td><span className={`${t.chip} ${t.chipAccent}`}>{menu.location}</span></td>
                      <td className={t.num}>
                        {menu._count.items === 0
                          ? <span className={styles.emptyWarn} title="This menu has no links yet">0 · empty</span>
                          : menu._count.items}
                      </td>
                      <td className={`${t.muted} ${t.hideSm}`} title={absoluteTime(menu.updatedAt)}>{relativeTime(menu.updatedAt)}</td>
                      <td className={t.actionsCol}>
                        <div className={t.rowActions}>
                          {canEdit && (
                            <Link to={`/admin/menus/${menu.id}`} className={t.quickAction} title="Edit items" aria-label={`Edit ${menu.name}`}>
                              <FontAwesomeIcon icon={faPen} />
                            </Link>
                          )}
                          <RowMenu items={menuItems(menu)} label={`Actions for ${menu.name}`} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {loaded && menus.length === 0 && (
              <EmptyState
                icon={faBars}
                title="No menus yet"
                description="Create a menu, then add links to pages, posts, categories or any URL."
                action={canCreate && <Button variant="primary" icon={faPlus} onClick={() => nameRef.current?.focus()}>Create a menu</Button>}
              />
            )}
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
