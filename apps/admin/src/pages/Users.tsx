import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { AdminLayout } from '../components/AdminLayout';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import { UserFormModal } from '../components/UserFormModal';
import { Role, User } from '../types';
import { deleteUser, fetchRoles, fetchUsers } from '../services/users';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCompress, faGripVertical, faExpand } from '@fortawesome/free-solid-svg-icons';
import { useDensity } from '../hooks/useDensity';
import styles from './Users.module.css';

const PAGE_SIZE = 10;

export default function UsersPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalUser, setModalUser] = useState<User | null | undefined>(undefined);
  const [density, setDensity] = useDensity('usersDensity');

  useEffect(() => {
    fetchRoles()
      .then(setRoles)
      .catch(() => setRoles([]));
  }, []);

  useEffect(() => {
    loadUsers();
  }, [page, search]);

  async function loadUsers() {
    setLoading(true);
    try {
      const result = await fetchUsers(page, PAGE_SIZE, search);
      setUsers(result.items);
      setTotal(result.pagination.total);
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Failed to load users'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(user: User) {
    if (!(await confirm({ title: 'Delete User', message: `Delete user "${user.username}"? This cannot be undone.`, confirmLabel: 'Delete', danger: true }))) {
      return;
    }

    try {
      await deleteUser(user.id);
      await loadUsers();
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Failed to delete user'
      );
    }
  }

  function handleSaved() {
    setModalUser(undefined);
    loadUsers();
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminLayout>
      <div className={styles.toolbar}>
        <h2>Users</h2>
        <div className={styles.search}>
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            autoFocus
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
        <button className={styles.addButton} onClick={() => setModalUser(null)}>
          Add User
        </button>
      </div>


      <div className={styles.tableWrapper}>
        <table className={styles[`density_${density}`]}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Username</th>
              <th>Name</th>
              <th>Roles</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>{user.username}</td>
                <td>{[user.firstName, user.lastName].filter(Boolean).join(' ') || '—'}</td>
                <td>
                  {user.roles.map((role) => (
                    <span key={role.id} className={styles.badge}>
                      {role.name}
                    </span>
                  ))}
                </td>
                <td>
                  <span className={user.isActive ? styles.statusActive : styles.statusInactive}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className={styles.actions}>
                  <button onClick={() => setModalUser(user)}>Edit</button>
                  <button className={styles.deleteButton} onClick={() => handleDelete(user)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && users.length === 0 && <div className={styles.empty}>No users found.</div>}
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

      {modalUser !== undefined && (
        <UserFormModal user={modalUser} roles={roles} onClose={() => setModalUser(undefined)} onSaved={handleSaved} />
      )}
    </AdminLayout>
  );
}
