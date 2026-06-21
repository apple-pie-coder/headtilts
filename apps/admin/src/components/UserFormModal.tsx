import { FormEvent, useState } from 'react';
import { AxiosError } from 'axios';
import { Role, User } from '../types';
import { createUser, updateUser } from '../services/users';
import { MediaPickerInput } from './MediaPickerInput';
import { useToast } from './ToastContext';
import styles from './UserFormModal.module.css';

interface UserFormModalProps {
  user: User | null;
  roles: Role[];
  onClose: () => void;
  onSaved: () => void;
}

export function UserFormModal({ user, roles, onClose, onSaved }: UserFormModalProps) {
  const isEditing = !!user;

  const [email, setEmail] = useState(user?.email || '');
  const [username, setUsername] = useState(user?.username || '');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [roleIds, setRoleIds] = useState<number[]>(user?.roles.map((r) => r.id) || []);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  function toggleRole(roleId: number) {
    setRoleIds((prev) => (prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      if (isEditing && user) {
        await updateUser(user.id, {
          email,
          username,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          avatar: avatar || null,
          isActive,
          roleIds,
        });
      } else {
        await createUser({
          email,
          username,
          password,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          roleIds,
        });
      }
      onSaved();
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Failed to save user'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <h2>{isEditing ? 'Edit User' : 'Add User'}</h2>

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={saving} />
          </div>

          <div className={styles.formGroup}>
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={saving}
            />
          </div>

          {!isEditing && (
            <div className={styles.formGroup}>
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={saving}
              />
            </div>
          )}

          <div className={styles.formGroup}>
            <label>First Name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Last Name</label>
            <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={saving} />
          </div>

          {isEditing && (
            <div className={styles.formGroup}>
              <label>Avatar</label>
              <MediaPickerInput
                value={avatar}
                onChange={setAvatar}
                disabled={saving}
                placeholder="Paste URL or choose from library…"
              />
            </div>
          )}

          {isEditing && (
            <div className={styles.formGroup}>
              <div className={styles.checkboxRow}>
                <input
                  id="isActive"
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  disabled={saving}
                />
                <label htmlFor="isActive">Active</label>
              </div>
            </div>
          )}

          <div className={styles.formGroup}>
            <label>Roles</label>
            <div className={styles.roleList}>
              {roles.map((role) => (
                <label key={role.id}>
                  <input
                    type="checkbox"
                    checked={roleIds.includes(role.id)}
                    onChange={() => toggleRole(role.id)}
                    disabled={saving}
                  />
                  {role.name}
                </label>
              ))}
            </div>
          </div>


          <div className={styles.actions}>
            <button type="button" className={styles.cancelButton} onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className={styles.saveButton} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
