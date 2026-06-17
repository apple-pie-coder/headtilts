import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { AdminLayout } from '../components/AdminLayout';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../hooks/useAuth';
import { fetchMe, updateMe } from '../services/profile';
import { User } from '../types';
import styles from './Profile.module.css';

function errMsg(err: unknown, fallback: string) {
  return (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback;
}

export default function ProfilePage() {
  useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Info form
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState('');
  const [infoSaving, setInfoSaving] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const me = await fetchMe();
      setProfile(me);
      setFirstName(me.firstName || '');
      setLastName(me.lastName || '');
      setBio(me.bio || '');
      setAvatar(me.avatar || '');
    } catch (err) {
      toast.error(errMsg(err, 'Failed to load profile'));
    } finally {
      setLoading(false);
    }
  }

  async function handleInfoSave(e: FormEvent) {
    e.preventDefault();
    setInfoSaving(true);
    try {
      const updated = await updateMe({ firstName: firstName.trim(), lastName: lastName.trim(), bio: bio.trim(), avatar: avatar.trim() || null });
      setProfile(updated);
      toast.success('Profile updated successfully.');
    } catch (err) {
      toast.error(errMsg(err, 'Failed to update profile'));
    } finally {
      setInfoSaving(false);
    }
  }

  async function handlePasswordSave(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match.');
      return;
    }
    setPwdSaving(true);
    try {
      await updateMe({ currentPassword, password: newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password changed successfully.');
    } catch (err) {
      toast.error(errMsg(err, 'Failed to change password'));
    } finally {
      setPwdSaving(false);
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className={styles.loading}>Loading profile…</div>
      </AdminLayout>
    );
  }

  const initials = profile
    ? (profile.firstName?.[0] ?? profile.username?.[0] ?? '?').toUpperCase()
    : '?';

  return (
    <AdminLayout>
      <h2 className={styles.title}>Your Profile</h2>

      <div className={styles.grid}>
        {/* Info card */}
        <div className={styles.card}>
          <div className={styles.avatarArea}>
            {profile?.avatar ? (
              <img src={profile.avatar} alt={initials} className={styles.avatarImg} />
            ) : (
              <div className={styles.avatarPlaceholder}>{initials}</div>
            )}
            <div className={styles.userHandle}>
              <span className={styles.username}>@{profile?.username}</span>
              <span className={styles.email}>{profile?.email}</span>
            </div>
          </div>

          <form onSubmit={handleInfoSave} className={styles.form}>
            <div className={styles.row}>
              <div className={styles.field}>
                <label>First Name</label>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" disabled={infoSaving} />
              </div>
              <div className={styles.field}>
                <label>Last Name</label>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" disabled={infoSaving} />
              </div>
            </div>

            <div className={styles.field}>
              <label>Avatar URL</label>
              <input value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://…" disabled={infoSaving} />
            </div>

            <div className={styles.field}>
              <label>Bio</label>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="A short bio…" disabled={infoSaving} />
            </div>

            <div className={styles.field}>
              <label>Roles</label>
              <div className={styles.roles}>
                {profile?.roles.map((r) => (
                  <span key={r.id} className={styles.roleBadge}>{r.name}</span>
                ))}
              </div>
            </div>

            <div className={styles.formFooter}>
              <button type="submit" className={styles.saveBtn} disabled={infoSaving}>
                {infoSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>

        {/* Password card */}
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Change Password</h3>

          <form onSubmit={handlePasswordSave} className={styles.form}>
            <div className={styles.field}>
              <label>Current Password</label>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required disabled={pwdSaving} autoComplete="current-password" />
            </div>
            <div className={styles.field}>
              <label>New Password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required disabled={pwdSaving} autoComplete="new-password" />
            </div>
            <div className={styles.field}>
              <label>Confirm New Password</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required disabled={pwdSaving} autoComplete="new-password" />
            </div>
            <div className={styles.formFooter}>
              <button type="submit" className={styles.saveBtn} disabled={pwdSaving || !currentPassword || !newPassword}>
                {pwdSaving ? 'Changing…' : 'Change Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}
