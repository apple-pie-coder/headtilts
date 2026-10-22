import { FormEvent, useEffect, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { AdminLayout } from '../components/AdminLayout';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../hooks/useAuth';
import { fetchMe, updateMe } from '../services/profile';
import { getMfaStatus, setupMfa, enableMfa, disableMfa, regenerateBackupCodes } from '../services/mfa';
import { PasskeysCard } from './profile/PasskeysCard';
import { MediaPickerInput } from '../components/MediaPickerInput';
import { User } from '../types';
import { PageHeader } from '../components/ui';
import styles from './Profile.module.css';

function errMsg(err: unknown, fallback: string) {
  return (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback;
}

type MfaUiState = 'idle' | 'setup' | 'backupCodes' | 'disabling' | 'regenerating';

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
  const [website, setWebsite] = useState('');
  const [location, setLocation] = useState('');
  const [twitterUrl, setTwitterUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [infoSaving, setInfoSaving] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  // MFA state
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaBackupRemaining, setMfaBackupRemaining] = useState(0);
  const [mfaUi, setMfaUi] = useState<MfaUiState>('idle');
  const [mfaQr, setMfaQr] = useState('');
  const [mfaSecret, setMfaSecret] = useState('');
  const [mfaOtp, setMfaOtp] = useState(['', '', '', '', '', '']);
  const [mfaBackupCodes, setMfaBackupCodes] = useState<string[]>([]);
  // Password + current code, for turning MFA off or replacing the backup codes
  const [mfaPassword, setMfaPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaWorking, setMfaWorking] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [passkeyCount, setPasskeyCount] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [me, status] = await Promise.all([fetchMe(), getMfaStatus()]);
      setProfile(me);
      setFirstName(me.firstName || '');
      setLastName(me.lastName || '');
      setBio(me.bio || '');
      setAvatar(me.avatar || '');
      setWebsite(me.website || '');
      setLocation(me.location || '');
      setTwitterUrl(me.twitterUrl || '');
      setLinkedinUrl(me.linkedinUrl || '');
      setGithubUrl(me.githubUrl || '');
      setInstagramUrl(me.instagramUrl || '');
      setMfaEnabled(status.enabled);
      setMfaBackupRemaining(status.backupCodesRemaining);
      setMfaRequired(status.required);
      setPasskeyCount(status.passkeys);
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
      const updated = await updateMe({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        bio: bio.trim(),
        avatar: avatar.trim() || null,
        website: website.trim() || null,
        location: location.trim() || null,
        twitterUrl: twitterUrl.trim() || null,
        linkedinUrl: linkedinUrl.trim() || null,
        githubUrl: githubUrl.trim() || null,
        instagramUrl: instagramUrl.trim() || null,
      });
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
    if (newPassword !== confirmPassword) { toast.error('New passwords do not match.'); return; }
    setPwdSaving(true);
    try {
      await updateMe({ currentPassword, password: newPassword });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      toast.success('Password changed successfully.');
    } catch (err) {
      toast.error(errMsg(err, 'Failed to change password'));
    } finally {
      setPwdSaving(false);
    }
  }

  async function handleMfaSetupStart() {
    setMfaWorking(true);
    try {
      const data = await setupMfa();
      setMfaQr(data.qrCodeDataUrl);
      setMfaSecret(data.secret);
      setMfaOtp(['', '', '', '', '', '']);
      setMfaUi('setup');
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch (err) {
      toast.error(errMsg(err, 'Failed to start MFA setup'));
    } finally {
      setMfaWorking(false);
    }
  }

  function handleMfaOtpChange(idx: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...mfaOtp];
    next[idx] = digit;
    setMfaOtp(next);
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus();
    if (next.every((d) => d !== '')) submitMfaEnable(next.join(''));
  }

  function handleMfaOtpKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !mfaOtp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus();
  }

  function handleMfaOtpPaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      e.preventDefault();
      setMfaOtp(pasted.split(''));
      submitMfaEnable(pasted);
    }
  }

  async function submitMfaEnable(code: string) {
    setMfaWorking(true);
    try {
      const result = await enableMfa(code);
      setMfaBackupCodes(result.backupCodes);
      setMfaEnabled(true);
      setMfaUi('backupCodes');
      toast.success('Two-factor authentication is on.');
    } catch (err) {
      toast.error(errMsg(err, 'Invalid code — try again'));
      setMfaOtp(['', '', '', '', '', '']);
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } finally {
      setMfaWorking(false);
    }
  }

  function openConfirm(ui: 'disabling' | 'regenerating') {
    setMfaPassword('');
    setMfaCode('');
    setMfaUi(ui);
  }

  async function handleMfaDisable(e: FormEvent) {
    e.preventDefault();
    setMfaWorking(true);
    try {
      await disableMfa(mfaPassword, mfaCode.trim());
      setMfaEnabled(false);
      // Backup codes stay while passkeys remain, as their fallback.
      if (passkeyCount === 0) setMfaBackupRemaining(0);
      setMfaUi('idle');
      toast.success('Two-factor authentication disabled.');
    } catch (err) {
      toast.error(errMsg(err, 'Failed to disable MFA'));
    } finally {
      setMfaWorking(false);
    }
  }

  async function handleRegenerate(e: FormEvent) {
    e.preventDefault();
    setMfaWorking(true);
    try {
      const result = await regenerateBackupCodes(mfaPassword, mfaCode.trim());
      setMfaBackupCodes(result.backupCodes);
      setMfaUi('backupCodes');
      toast.success('New backup codes created. The old ones no longer work.');
    } catch (err) {
      toast.error(errMsg(err, 'Failed to create new backup codes'));
    } finally {
      setMfaWorking(false);
    }
  }

  function handleBackupDone() {
    setMfaBackupRemaining(mfaBackupCodes.length);
    setMfaBackupCodes([]);
    setMfaUi('idle');
  }

  if (loading) {
    return <AdminLayout><div className={styles.loading}>Loading profile…</div></AdminLayout>;
  }

  const initials = profile
    ? (profile.firstName?.[0] ?? profile.username?.[0] ?? '?').toUpperCase()
    : '?';

  return (
    <AdminLayout>
      <PageHeader title="Your profile" subtitle="Your details, password, two-factor authentication and passkeys." />

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
              <label>Avatar</label>
              <MediaPickerInput value={avatar} onChange={setAvatar} disabled={infoSaving} placeholder="Paste URL or choose from library…" />
            </div>

            <div className={styles.field}>
              <label>Bio</label>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="A short bio…" disabled={infoSaving} />
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label>Website</label>
                <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://yoursite.com" disabled={infoSaving} />
              </div>
              <div className={styles.field}>
                <label>Location</label>
                <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, Country" disabled={infoSaving} />
              </div>
            </div>

            <div className={styles.sectionHeading}>Social Links</div>
            <div className={styles.row}>
              <div className={styles.field}>
                <label>Twitter / X</label>
                <input value={twitterUrl} onChange={(e) => setTwitterUrl(e.target.value)} placeholder="https://x.com/username" disabled={infoSaving} />
              </div>
              <div className={styles.field}>
                <label>LinkedIn</label>
                <input value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/username" disabled={infoSaving} />
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.field}>
                <label>GitHub</label>
                <input value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.com/username" disabled={infoSaving} />
              </div>
              <div className={styles.field}>
                <label>Instagram</label>
                <input value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} placeholder="https://instagram.com/username" disabled={infoSaving} />
              </div>
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

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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

          {/* MFA card */}
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Two-Factor Authentication</h3>

            {/* Current status */}
            <div className={styles.mfaStatus}>
              <span className={styles.mfaStatusLabel}>Status</span>
              <span className={`${styles.mfaBadge} ${mfaEnabled ? styles.mfaBadgeOn : styles.mfaBadgeOff}`}>
                {mfaEnabled ? '✓ Enabled' : 'Disabled'}
              </span>
            </div>

            {/* Idle state — show enable or disable button */}
            {mfaUi === 'idle' && (
              <>
                {mfaRequired && (
                  <p className={styles.mfaNote}>Your role requires a second step at sign-in — an authenticator app or a passkey.</p>
                )}
                <p className={styles.mfaDesc}>
                  {mfaEnabled
                    ? 'Signing in with your password also asks for a code from your authenticator app.'
                    : 'Add an extra layer of security. After enabling, you\'ll need your authenticator app each time you sign in.'}
                  {(mfaEnabled || mfaBackupRemaining > 0) && ` You have ${mfaBackupRemaining} backup code${mfaBackupRemaining !== 1 ? 's' : ''} remaining.`}
                </p>
                {mfaEnabled ? (
                  <div className={styles.buttonRow}>
                    <button className={styles.secondaryBtn} onClick={() => openConfirm('regenerating')} disabled={mfaWorking}>
                      New backup codes
                    </button>
                    <button className={styles.dangerBtn} onClick={() => openConfirm('disabling')} disabled={mfaWorking}>
                      Disable MFA
                    </button>
                  </div>
                ) : (
                  <button className={styles.saveBtn} onClick={handleMfaSetupStart} disabled={mfaWorking}>
                    {mfaWorking ? 'Loading…' : 'Enable MFA'}
                  </button>
                )}
              </>
            )}

            {/* Setup: scan QR + confirm TOTP code */}
            {mfaUi === 'setup' && (
              <>
                <p className={styles.mfaDesc}>
                  Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.), then enter the 6-digit code to confirm.
                </p>
                <div className={styles.mfaQr}>
                  <img src={mfaQr} alt="QR code" />
                  <span className={styles.mfaSecret}>{mfaSecret}</span>
                </div>
                <div className={styles.mfaOtpRow} onPaste={handleMfaOtpPaste}>
                  {mfaOtp.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { otpRefs.current[i] = el; }}
                      className={styles.mfaOtpBox}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleMfaOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleMfaOtpKeyDown(i, e)}
                      disabled={mfaWorking}
                      autoComplete="one-time-code"
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button type="button" className={styles.dangerBtn} onClick={() => setMfaUi('idle')} disabled={mfaWorking}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.saveBtn}
                    onClick={() => submitMfaEnable(mfaOtp.join(''))}
                    disabled={mfaWorking || mfaOtp.some((d) => !d)}
                  >
                    {mfaWorking ? 'Verifying…' : 'Confirm'}
                  </button>
                </div>
              </>
            )}

            {/* Show backup codes after enabling */}
            {mfaUi === 'backupCodes' && (
              <>
                <div className={styles.backupCodesBox}>
                  <p>Save these backup codes somewhere safe. Each can only be used once if you lose access to your authenticator app.</p>
                  <div className={styles.backupCodesList}>
                    {mfaBackupCodes.map((code) => (
                      <span key={code} className={styles.backupCode}>{code}</span>
                    ))}
                  </div>
                </div>
                <div className={styles.formFooter}>
                  <button type="button" className={styles.saveBtn} onClick={handleBackupDone}>
                    I've saved my backup codes
                  </button>
                </div>
              </>
            )}

            {/* Disable / new backup codes: password plus a current code */}
            {(mfaUi === 'disabling' || mfaUi === 'regenerating') && (
              <form onSubmit={mfaUi === 'disabling' ? handleMfaDisable : handleRegenerate} className={styles.form}>
                {mfaUi === 'disabling' && mfaRequired && passkeyCount === 0 && (
                  <p className={styles.mfaNote}>
                    Your role requires two-step sign-in, so you’ll be asked to set it up again the next time you sign in.
                  </p>
                )}
                <div className={styles.field}>
                  <label htmlFor="mfa-confirm-password">Password</label>
                  <input
                    id="mfa-confirm-password"
                    type="password"
                    value={mfaPassword}
                    onChange={(e) => setMfaPassword(e.target.value)}
                    required
                    disabled={mfaWorking}
                    autoFocus
                    autoComplete="current-password"
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="mfa-confirm-code">Code from your authenticator app, or a backup code</label>
                  <input
                    id="mfa-confirm-code"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    required
                    disabled={mfaWorking}
                    autoComplete="one-time-code"
                    spellCheck={false}
                  />
                </div>
                <div className={styles.buttonRow}>
                  <button type="button" className={styles.secondaryBtn} onClick={() => setMfaUi('idle')} disabled={mfaWorking}>
                    Cancel
                  </button>
                  {mfaUi === 'disabling' ? (
                    <button type="submit" className={styles.dangerBtn} disabled={mfaWorking || !mfaPassword || !mfaCode.trim()}>
                      {mfaWorking ? 'Disabling…' : 'Disable MFA'}
                    </button>
                  ) : (
                    <button type="submit" className={styles.saveBtn} disabled={mfaWorking || !mfaPassword || !mfaCode.trim()}>
                      {mfaWorking ? 'Creating…' : 'Create new codes'}
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>

          <PasskeysCard required={mfaRequired} appEnabled={mfaEnabled} onCountChange={setPasskeyCount} />
        </div>
      </div>
    </AdminLayout>
  );
}
