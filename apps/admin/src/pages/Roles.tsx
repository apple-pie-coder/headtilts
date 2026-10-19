import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { PERMISSIONS } from '@headtilts/shared';
import { AdminLayout } from '../components/AdminLayout';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import { faPlus } from '@fortawesome/free-solid-svg-icons';
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
import { Button, DensityToggle, PageHeader } from '../components/ui';
import { RoleEditor, RolePayload } from './roles/RoleEditor';
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
      setModal({ mode: 'edit', role: await fetchRole(role.id) });
    } catch (err) {
      toast.error(errMsg(err, 'Failed to load role'));
    }
  }

  async function handleSave(payload: RolePayload) {
    try {
      if (modal?.mode === 'edit' && modal.role) await updateRole(modal.role.id, payload);
      else await createRole(payload);
      toast.success(modal?.mode === 'edit' ? `Saved “${payload.name}”` : `Created “${payload.name}”`);
      setModal(null);
      await loadAll();
    } catch (err) {
      toast.error(errMsg(err, 'Failed to save role'));
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
      <PageHeader
        title="Roles & permissions"
        subtitle="Control what each group of users can see and do."
        actions={
          <>
            <DensityToggle value={density} onChange={setDensity} />
            {canCreate && <Button variant="primary" icon={faPlus} onClick={() => setModal({ mode: 'create' })}>New role</Button>}
          </>
        }
      />


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

      {modal && (
        <RoleEditor
          key={modal.role?.id ?? 'new'}
          mode={modal.mode}
          role={modal.role}
          roles={roles}
          permsByModule={permsByModule}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </AdminLayout>
  );
}
