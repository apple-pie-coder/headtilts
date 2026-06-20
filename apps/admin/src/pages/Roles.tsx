import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { PERMISSIONS } from '@headtilts/shared';
import { AdminLayout } from '../components/AdminLayout';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faCompress, faGripVertical, faExpand } from '@fortawesome/free-solid-svg-icons';
import { useDensity } from '../hooks/useDensity';
import { useAuth } from '../hooks/useAuth';
import { Role } from '../types';
import {
  fetchRoles,
  fetchRole,
  fetchPermissions,
  createRole,
  updateRole,
  deleteRole,
  PermissionEntry,
} from '../services/roles';
import styles from './Roles.module.css';

function errMsg(err: unknown, fallback: string) {
  return (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback;
}

type ModalMode = 'create' | 'edit';

interface ModalState {
  mode: ModalMode;
  role?: Role;
}

export default function RolesPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permsByModule, setPermsByModule] = useState<Record<string, PermissionEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [density, setDensity] = useDensity('rolesDensity');

  const [modal, setModal] = useState<ModalState | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formMfaRequired, setFormMfaRequired] = useState(false);
  const [formPermIds, setFormPermIds] = useState<Set<number>>(new Set());
  const [formSaving, setFormSaving] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([fetchRoles(), fetchPermissions()]);
      setRoles(r);
      setPermsByModule(p);
    } catch (err) {
      toast.error(errMsg(err, 'Failed to load roles'));
    } finally {
      setLoading(false);
    }
  }

  async function openEdit(role: Role) {
    try {
      const full = await fetchRole(role.id);
      setFormName(full.name);
      setFormDesc(full.description || '');
      setFormMfaRequired(full.mfaRequired ?? false);
      setFormPermIds(new Set(full.permissions?.map((p) => p.id) ?? []));
      setModal({ mode: 'edit', role: full });
    } catch (err) {
      toast.error(errMsg(err, 'Failed to load role'));
    }
  }

  function openCreate() {
    setFormName('');
    setFormDesc('');
    setFormMfaRequired(false);
    setFormPermIds(new Set());
    setModal({ mode: 'create' });
  }

  function closeModal() {
    setModal(null);
  }

  function togglePerm(id: number) {
    setFormPermIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleModule(ids: number[]) {
    const allSelected = ids.every((id) => formPermIds.has(id));
    setFormPermIds((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormSaving(true);
    try {
      const payload = { name: formName.trim(), description: formDesc.trim(), permissionIds: [...formPermIds], mfaRequired: formMfaRequired };
      if (modal?.mode === 'edit' && modal.role) {
        await updateRole(modal.role.id, payload);
      } else {
        await createRole(payload);
      }
      closeModal();
      await loadAll();
    } catch (err) {
      toast.error(errMsg(err, 'Failed to save role'));
    } finally {
      setFormSaving(false);
    }
  }

  async function handleDelete(role: Role) {
    if (role.isSystem) return;
    if (!(await confirm({ title: 'Delete Role', message: `Delete role "${role.name}"? Users with this role will lose its permissions.`, confirmLabel: 'Delete', danger: true }))) return;
    try {
      await deleteRole(role.id);
      await loadAll();
    } catch (err) {
      toast.error(errMsg(err, 'Failed to delete role'));
    }
  }

  const canCreate = hasPermission(PERMISSIONS.ROLE_CREATE);
  const canEdit = hasPermission(PERMISSIONS.ROLE_EDIT);
  const canDelete = hasPermission(PERMISSIONS.ROLE_DELETE);

  return (
    <AdminLayout>
      <div className={styles.header}>
        <h2 className={styles.title}>Roles & Permissions</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className={styles.densitySwitch} role="group" aria-label="List density">
            <button type="button" className={`${styles.densityOption} ${density === 'compact' ? styles.densityOptionActive : ''}`} onClick={() => setDensity('compact')} title="Compact" aria-pressed={density === 'compact'}><FontAwesomeIcon icon={faCompress} /></button>
            <button type="button" className={`${styles.densityOption} ${density === 'condensed' ? styles.densityOptionActive : ''}`} onClick={() => setDensity('condensed')} title="Condensed" aria-pressed={density === 'condensed'}><FontAwesomeIcon icon={faGripVertical} /></button>
            <button type="button" className={`${styles.densityOption} ${density === 'relaxed' ? styles.densityOptionActive : ''}`} onClick={() => setDensity('relaxed')} title="Relaxed" aria-pressed={density === 'relaxed'}><FontAwesomeIcon icon={faExpand} /></button>
          </div>
          {canCreate && (
            <button className={styles.addButton} onClick={openCreate}>
              Create Role
            </button>
          )}
        </div>
      </div>


      <div className={styles.tableWrapper}>
        <table className={styles[`density_${density}`]}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Permissions</th>
              <th>MFA</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id}>
                <td>
                  <span className={styles.roleName}>{role.name}</span>
                  {role.isSystem && <span className={styles.systemBadge}>system</span>}
                </td>
                <td className={styles.desc}>{role.description || <span className={styles.muted}>—</span>}</td>
                <td>
                  <span className={styles.permCount}>{role.permissions?.length ?? '…'} permissions</span>
                </td>
                <td>
                  {role.mfaRequired
                    ? <span className={styles.mfaBadge}>Required</span>
                    : <span className={styles.muted}>—</span>
                  }
                </td>
                <td className={styles.actions}>
                  {canEdit && (
                    <button onClick={() => openEdit(role)}>Edit</button>
                  )}
                  {canDelete && !role.isSystem && (
                    <button className={styles.deleteButton} onClick={() => handleDelete(role)}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && roles.length === 0 && (
          <div className={styles.empty}>No roles found.</div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className={styles.overlay} onClick={closeModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>{modal.mode === 'create' ? 'Create Role' : `Edit "${modal.role?.name}"`}</h3>
              <button className={styles.closeBtn} onClick={closeModal}><FontAwesomeIcon icon={faXmark} /></button>
            </div>


            <form onSubmit={handleSubmit}>
              <div className={styles.field}>
                <label>Role Name</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. editor"
                  required
                  disabled={formSaving || (modal.mode === 'edit' && !!modal.role?.isSystem)}
                  autoFocus
                />
              </div>

              <div className={styles.field}>
                <label>Description</label>
                <input
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Optional description"
                  disabled={formSaving}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={formMfaRequired}
                    onChange={(e) => setFormMfaRequired(e.target.checked)}
                    disabled={formSaving}
                  />
                  <span>Require MFA for this role</span>
                </label>
                <span className={styles.fieldHint}>Users with this role must enable two-factor authentication to sign in.</span>
              </div>

              <div className={styles.permsSection}>
                <div className={styles.permsHeader}>
                  <span className={styles.permsLabel}>Permissions</span>
                  <span className={styles.permsCount}>{formPermIds.size} selected</span>
                </div>

                <div className={styles.permsGrid}>
                  {Object.entries(permsByModule).map(([module, perms]) => {
                    const ids = perms.map((p) => p.id);
                    const allChecked = ids.every((id) => formPermIds.has(id));
                    const someChecked = ids.some((id) => formPermIds.has(id));
                    return (
                      <div key={module} className={styles.permModule}>
                        <label className={styles.moduleLabel}>
                          <input
                            type="checkbox"
                            checked={allChecked}
                            ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                            onChange={() => toggleModule(ids)}
                            disabled={formSaving}
                          />
                          <span className={styles.moduleName}>{module}</span>
                        </label>
                        <div className={styles.permList}>
                          {perms.map((perm) => (
                            <label key={perm.id} className={styles.permItem}>
                              <input
                                type="checkbox"
                                checked={formPermIds.has(perm.id)}
                                onChange={() => togglePerm(perm.id)}
                                disabled={formSaving}
                              />
                              <span>{perm.action}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={closeModal} disabled={formSaving}>
                  Cancel
                </button>
                <button type="submit" className={styles.saveBtn} disabled={formSaving || !formName.trim()}>
                  {formSaving ? 'Saving…' : modal.mode === 'create' ? 'Create Role' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
