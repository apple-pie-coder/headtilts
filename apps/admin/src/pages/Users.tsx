import { useCallback, useEffect, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { PERMISSIONS } from '@headtilts/shared';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUserPlus, faPen, faTrashCan, faUserSlash, faUserCheck, faEnvelope, faKey, faCopy,
  faMagnifyingGlass, faUsers, faShieldHalved, faRotateLeft,
} from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import { UserFormModal } from '../components/UserFormModal';
import {
  Button, Card, DensityToggle, EmptyState, LoadingBar, MenuItem, PageHeader, Pagination, RowMenu,
  SearchInput, StatusBadge, TableSkeleton, ActiveFilters,
} from '../components/ui';
import t from '../components/ui/table.module.css';
import { useAuth } from '../hooks/useAuth';
import { useDensity } from '../hooks/useDensity';
import { useHotkeys } from '../hooks/useHotkeys';
import { useUrlState } from '../hooks/useUrlState';
import { Role, User } from '../types';
import { deleteUser, fetchRoles, fetchUsers, resetUserMfa, updateUser } from '../services/users';
import { requestPasswordReset } from '../services/auth';
import { resolveMediaUrl } from '../services/media';

function errorMessage(err: unknown, fallback: string): string {
  return (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback;
}

function fullName(u: User): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ');
}

export default function UsersPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const { user: me, hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.USER_CREATE);
  const canEdit = hasPermission(PERMISSIONS.USER_EDIT);
  const canDelete = hasPermission(PERMISSIONS.USER_DELETE);

  const [q, setQ] = useUrlState({ search: '', page: '1', per: '20' });
  const page = Math.max(1, Number(q.page) || 1);
  const perPage = Number(q.per) || 20;

  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [modalUser, setModalUser] = useState<User | null | undefined>(undefined);
  const [density, setDensity] = useDensity('usersDensity');
  const reqId = useRef(0);

  useEffect(() => {
    fetchRoles().then(setRoles).catch(() => setRoles([]));
  }, []);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const result = await fetchUsers(page, perPage, q.search);
      if (id !== reqId.current) return;
      setUsers(result.items);
      setTotal(result.pagination.total);
      setLoaded(true);
    } catch (err) {
      if (id === reqId.current) toast.error(errorMessage(err, 'Failed to load users'));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [page, perPage, q.search]);

  useEffect(() => { load(); }, [load]);

  useHotkeys({ n: () => { if (canCreate) setModalUser(null); } });

  async function setActive(u: User, isActive: boolean) {
    if (!isActive && !(await confirm({
      title: `Deactivate ${u.username}?`,
      message: 'They will be signed out and unable to log in until reactivated. Their content stays in place.',
      confirmLabel: 'Deactivate',
      danger: true,
    }))) return;
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, isActive } : x)));
    try {
      await updateUser(u.id, { isActive });
      toast.success(`${isActive ? 'Activated' : 'Deactivated'} ${u.username}`, {
        action: { label: 'Undo', onClick: () => updateUser(u.id, { isActive: !isActive }).then(load).catch((e) => toast.error(errorMessage(e, 'Undo failed'))) },
      });
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update user'));
      load();
    }
  }

  async function sendReset(u: User) {
    try {
      await requestPasswordReset(u.email);
      toast.success(`Password reset link sent to ${u.email}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to send reset email'));
    }
  }

  async function handleResetMfa(u: User) {
    if (!(await confirm({
      title: `Reset two-step sign-in for ${u.username}?`,
      message: 'This removes their authenticator app, backup codes and passkeys, so they can sign in with just their password. '
        + 'If their role requires two-step sign-in, they will be asked to set it up again. Only do this once you are sure who is asking.',
      confirmLabel: 'Reset',
      danger: true,
    }))) return;
    try {
      await resetUserMfa(u.id);
      toast.success(`Two-step sign-in reset for ${u.username}`);
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to reset two-step sign-in'));
    }
  }

  async function handleDelete(u: User) {
    if (!(await confirm({
      title: `Delete ${u.username}?`,
      message: 'This permanently removes the account. Consider deactivating instead if you may need it again.',
      confirmLabel: 'Delete user',
      danger: true,
    }))) return;
    try {
      await deleteUser(u.id);
      toast.success(`Deleted ${u.username}`);
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete user'));
    }
  }

  function menu(u: User): MenuItem[] {
    const isMe = u.id === me?.id;
    return [
      { label: 'Edit', icon: faPen, onClick: () => setModalUser(u), hidden: !canEdit },
      { label: 'Send password reset', icon: faKey, onClick: () => sendReset(u), hidden: !canEdit },
      {
        label: 'Reset two-step sign-in',
        icon: faRotateLeft,
        onClick: () => handleResetMfa(u),
        hidden: !canEdit || isMe || !(u.mfaEnabled || u.passkeyCount),
      },
      { label: 'Email user', icon: faEnvelope, onClick: () => { window.location.href = `mailto:${u.email}`; } },
      {
        label: 'Copy email',
        icon: faCopy,
        onClick: () => navigator.clipboard.writeText(u.email).then(() => toast.success('Email copied'), () => toast.error('Could not copy')),
      },
      u.isActive
        ? { label: 'Deactivate', icon: faUserSlash, onClick: () => setActive(u, false), hidden: !canEdit || isMe, divider: true }
        : { label: 'Activate', icon: faUserCheck, onClick: () => setActive(u, true), hidden: !canEdit, divider: true },
      { label: 'Delete', icon: faTrashCan, onClick: () => handleDelete(u), danger: true, hidden: !canDelete || isMe },
    ];
  }

  return (
    <AdminLayout>
      <PageHeader
        title="Users"
        subtitle={loaded ? `${total} team member${total === 1 ? '' : 's'}` : ' '}
        actions={canCreate && (
          <Button variant="primary" icon={faUserPlus} kbd="N" onClick={() => setModalUser(null)}>Add user</Button>
        )}
      />

      <div className={t.toolbar}>
        <SearchInput value={q.search} onChange={(search) => setQ({ search })} placeholder="Search by name, username or email" />
        <div className={t.spacer} />
        <DensityToggle value={density} onChange={setDensity} />
      </div>

      <ActiveFilters
        filters={q.search ? [{ key: 'search', label: `“${q.search}”`, onRemove: () => setQ({ search: '' }) }] : []}
        onClearAll={() => setQ({ search: '' })}
      />

      <Card>
        <LoadingBar active={loading && loaded} />
        <div className={t.scroll}>
          <table className={`${t.table} ${t[`d_${density}`]}`}>
            <thead>
              <tr>
                <th>User</th>
                <th className={t.hideSm}>Username</th>
                <th>Roles</th>
                <th>Status</th>
                <th className={t.actionsCol}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {!loaded && <TableSkeleton rows={6} cols={5} />}
              {users.map((u) => {
                const name = fullName(u);
                const isMe = u.id === me?.id;
                return (
                  <tr key={u.id} className={u.isActive ? undefined : t.rowDim}>
                    <td className={t.primaryCell}>
                      <div className={t.primaryWrap}>
                        <span className={t.avatar}>
                          {u.avatar
                            ? <img src={resolveMediaUrl(u.avatar)} alt="" loading="lazy" />
                            : (u.firstName?.[0] ?? u.username[0] ?? '?').toUpperCase()}
                        </span>
                        <div className={t.stack}>
                          {canEdit ? (
                            <button type="button" className={t.primary} onClick={() => setModalUser(u)}>
                              {name || u.username}
                              {isMe && <span className={t.faint}> (you)</span>}
                            </button>
                          ) : (
                            <span className={t.primary}>{name || u.username}{isMe && <span className={t.faint}> (you)</span>}</span>
                          )}
                          <span className={t.secondary}>{u.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className={`${t.muted} ${t.hideSm}`}>@{u.username}</td>
                    <td>
                      <span className={t.chips}>
                        {u.roles.length === 0 && <span className={t.faint}>No role</span>}
                        {u.roles.map((r) => <span key={r.id} className={`${t.chip} ${t.chipAccent}`}>{r.name}</span>)}
                        {(u.mfaEnabled || !!u.passkeyCount) && (
                          <span
                            className={t.chip}
                            title={[
                              u.mfaEnabled && 'Authenticator app',
                              u.passkeyCount && `${u.passkeyCount} passkey${u.passkeyCount === 1 ? '' : 's'}`,
                            ].filter(Boolean).join(' · ')}
                          >
                            <FontAwesomeIcon icon={faShieldHalved} /> 2FA
                          </span>
                        )}
                      </span>
                    </td>
                    <td>
                      <StatusBadge tone={u.isActive ? 'success' : 'neutral'}>{u.isActive ? 'Active' : 'Inactive'}</StatusBadge>
                    </td>
                    <td className={t.actionsCol}>
                      <div className={t.rowActions}>
                        {canEdit && (
                          <button type="button" className={t.quickAction} onClick={() => setModalUser(u)} title="Edit" aria-label={`Edit ${u.username}`}>
                            <FontAwesomeIcon icon={faPen} />
                          </button>
                        )}
                        <RowMenu items={menu(u)} label={`Actions for ${u.username}`} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {loaded && users.length === 0 && (
          q.search ? (
            <EmptyState
              icon={faMagnifyingGlass}
              title={`No users match “${q.search}”`}
              action={<Button onClick={() => setQ({ search: '' })}>Clear search</Button>}
            />
          ) : (
            <EmptyState
              icon={faUsers}
              title="No users yet"
              action={canCreate && <Button variant="primary" icon={faUserPlus} onClick={() => setModalUser(null)}>Add user</Button>}
            />
          )
        )}
      </Card>

      {loaded && total > 0 && (
        <Pagination
          page={page}
          pageSize={perPage}
          total={total}
          onPage={(p) => setQ({ page: String(p) })}
          onPageSize={(n) => setQ({ per: String(n) })}
        />
      )}

      {modalUser !== undefined && (
        <UserFormModal
          user={modalUser}
          roles={roles}
          onClose={() => setModalUser(undefined)}
          onSaved={() => { setModalUser(undefined); load(); }}
        />
      )}
    </AdminLayout>
  );
}
