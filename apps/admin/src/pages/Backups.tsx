import { useEffect, useRef, useState } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import { useToast } from '../components/ToastContext';
import {
  listBackups, createBackup, deleteBackup, restoreBackup,
  uploadBackup, pollBackup, downloadUrl, verifyBackup,
  getBackupSettings, updateBackupSettings,
  Backup, BackupSettings, RestoreScope,
} from '../services/backups';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faDownload, faTrash, faRotateLeft, faUpload,
  faCircleNotch, faCheckCircle, faTimesCircle, faShieldHalved,
  faGear, faChevronDown, faChevronUp,
} from '@fortawesome/free-solid-svg-icons';
import styles from './Backups.module.css';

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ── Restore Modal ─────────────────────────────────────────────────────────────

interface RestoreModalProps {
  backup: Backup;
  onConfirm: (scope: RestoreScope) => void;
  onCancel: () => void;
  restoring: boolean;
}

function RestoreModal({ backup, onConfirm, onCancel, restoring }: RestoreModalProps) {
  const [scope, setScope] = useState<RestoreScope>('all');
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>Restore Backup</h3>
        <p className={styles.modalDesc}>
          Restoring from <strong>{backup.label ?? backup.filename}</strong>.
          Choose what to restore:
        </p>
        <div className={styles.scopeGroup}>
          {([
            { value: 'all', label: 'Full restore', desc: 'Database, uploads, and app settings' },
            { value: 'db', label: 'Database only', desc: 'Restores all data, leaves media files intact' },
            { value: 'uploads', label: 'Uploads only', desc: 'Restores media files, leaves database intact' },
          ] as { value: RestoreScope; label: string; desc: string }[]).map((opt) => (
            <label key={opt.value} className={`${styles.scopeOption} ${scope === opt.value ? styles.scopeSelected : ''}`}>
              <input type="radio" name="scope" value={opt.value} checked={scope === opt.value} onChange={() => setScope(opt.value)} />
              <span>
                <strong>{opt.label}</strong>
                <span className={styles.scopeDesc}>{opt.desc}</span>
              </span>
            </label>
          ))}
        </div>
        {scope !== 'uploads' && (
          <p className={styles.modalWarn}>
            ⚠ This will overwrite current data and cannot be undone.
          </p>
        )}
        <div className={styles.modalActions}>
          <button className={styles.secondaryButton} onClick={onCancel} disabled={restoring}>Cancel</button>
          <button className={`${styles.primaryButton} ${styles.dangerButton}`} onClick={() => onConfirm(scope)} disabled={restoring}>
            {restoring ? <><FontAwesomeIcon icon={faCircleNotch} spin /> Restoring…</> : 'Restore'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Settings Panel ────────────────────────────────────────────────────────────

interface SettingsPanelProps { onClose: () => void }

function SettingsPanel({ onClose }: SettingsPanelProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<BackupSettings>({
    schedule: 'disabled', scheduleTime: '02:00', scheduleDay: 1,
    retentionDays: 0, retentionCount: 0, notifyEmail: '',
    preRestoreBackup: true, storage: 'local',
    s3Bucket: '', s3Region: '', s3AccessKey: '', s3SecretKey: '', s3Endpoint: '',
  });

  useEffect(() => {
    getBackupSettings()
      .then(setForm)
      .catch(() => toast.error('Failed to load backup settings'))
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof BackupSettings>(key: K, value: BackupSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Record<string, string> = {
        backup_schedule: form.schedule,
        backup_schedule_time: form.scheduleTime,
        backup_schedule_day: String(form.scheduleDay),
        backup_retention_days: String(form.retentionDays),
        backup_retention_count: String(form.retentionCount),
        backup_notify_email: form.notifyEmail,
        backup_pre_restore: String(form.preRestoreBackup),
        backup_storage: form.storage,
        backup_s3_bucket: form.s3Bucket,
        backup_s3_region: form.s3Region,
        backup_s3_access_key: form.s3AccessKey,
        backup_s3_secret_key: form.s3SecretKey,
        backup_s3_endpoint: form.s3Endpoint,
      };
      await updateBackupSettings(payload);
      toast.success('Backup settings saved');
      onClose();
    } catch {
      toast.error('Failed to save backup settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className={styles.panel}><p className={styles.hint}>Loading settings…</p></div>;

  return (
    <div className={styles.settingsPanel}>
      <div className={styles.settingsGrid}>

        {/* Schedule */}
        <div className={styles.settingsSection}>
          <h4 className={styles.settingsSectionTitle}>Auto-Schedule</h4>
          <div className={styles.formGroup}>
            <label>Schedule</label>
            <select className={styles.select} value={form.schedule} onChange={(e) => set('schedule', e.target.value as BackupSettings['schedule'])}>
              <option value="disabled">Disabled</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          {form.schedule !== 'disabled' && (
            <div className={styles.formGroup}>
              <label>Time (24h)</label>
              <input type="time" className={styles.input} value={form.scheduleTime} onChange={(e) => set('scheduleTime', e.target.value)} />
            </div>
          )}
          {form.schedule === 'weekly' && (
            <div className={styles.formGroup}>
              <label>Day</label>
              <select className={styles.select} value={form.scheduleDay} onChange={(e) => set('scheduleDay', Number(e.target.value))}>
                {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Retention */}
        <div className={styles.settingsSection}>
          <h4 className={styles.settingsSectionTitle}>Retention Policy</h4>
          <div className={styles.formGroup}>
            <label>Keep last N backups <span className={styles.optional}>(0 = unlimited)</span></label>
            <input type="number" min={0} className={styles.input} value={form.retentionCount}
              onChange={(e) => set('retentionCount', Number(e.target.value))} />
          </div>
          <div className={styles.formGroup}>
            <label>Delete after N days <span className={styles.optional}>(0 = never)</span></label>
            <input type="number" min={0} className={styles.input} value={form.retentionDays}
              onChange={(e) => set('retentionDays', Number(e.target.value))} />
          </div>
        </div>

        {/* Notifications */}
        <div className={styles.settingsSection}>
          <h4 className={styles.settingsSectionTitle}>Notifications</h4>
          <div className={styles.formGroup}>
            <label>Email on completion <span className={styles.optional}>(leave empty to disable)</span></label>
            <input type="email" className={styles.input} placeholder="admin@example.com"
              value={form.notifyEmail} onChange={(e) => set('notifyEmail', e.target.value)} />
          </div>
        </div>

        {/* Safety */}
        <div className={styles.settingsSection}>
          <h4 className={styles.settingsSectionTitle}>Safety</h4>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={form.preRestoreBackup}
              onChange={(e) => set('preRestoreBackup', e.target.checked)} />
            Auto-backup before full restore
          </label>
          <p className={styles.hint}>Creates a safety backup immediately before any full restore so you can roll back.</p>
        </div>

        {/* Storage */}
        <div className={`${styles.settingsSection} ${styles.settingsSectionFull}`}>
          <h4 className={styles.settingsSectionTitle}>Storage</h4>
          <div className={styles.formGroup}>
            <label>Storage provider</label>
            <select className={styles.select} value={form.storage} onChange={(e) => set('storage', e.target.value as 'local' | 's3')}>
              <option value="local">Local (server disk)</option>
              <option value="s3">Amazon S3 / Backblaze B2 / Compatible</option>
            </select>
          </div>
          {form.storage === 's3' && (
            <div className={styles.s3Grid}>
              <div className={styles.formGroup}>
                <label>Bucket</label>
                <input className={styles.input} value={form.s3Bucket} onChange={(e) => set('s3Bucket', e.target.value)} placeholder="my-backup-bucket" />
              </div>
              <div className={styles.formGroup}>
                <label>Region</label>
                <input className={styles.input} value={form.s3Region} onChange={(e) => set('s3Region', e.target.value)} placeholder="us-east-1" />
              </div>
              <div className={styles.formGroup}>
                <label>Access Key ID</label>
                <input className={styles.input} value={form.s3AccessKey} onChange={(e) => set('s3AccessKey', e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label>Secret Access Key</label>
                <input type="password" className={styles.input} value={form.s3SecretKey} onChange={(e) => set('s3SecretKey', e.target.value)} placeholder="Leave blank to keep existing" />
              </div>
              <div className={`${styles.formGroup} ${styles.spanTwo}`}>
                <label>Custom Endpoint <span className={styles.optional}>(Backblaze B2, Cloudflare R2, MinIO — leave blank for AWS)</span></label>
                <input className={styles.input} value={form.s3Endpoint} onChange={(e) => set('s3Endpoint', e.target.value)} placeholder="https://s3.us-west-001.backblazeb2.com" />
              </div>
            </div>
          )}
        </div>

      </div>

      <div className={styles.settingsFooter}>
        <button className={styles.secondaryButton} onClick={onClose}>Cancel</button>
        <button className={styles.primaryButton} onClick={handleSave} disabled={saving}>
          {saving ? <><FontAwesomeIcon icon={faCircleNotch} spin /> Saving…</> : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ backup, pending }: { backup: Backup; pending: boolean }) {
  if (pending || backup.status === 'pending') {
    return <span className={`${styles.badge} ${styles.badgePending}`}><FontAwesomeIcon icon={faCircleNotch} spin /> Running</span>;
  }
  if (backup.status === 'ready') {
    return <span className={`${styles.badge} ${styles.badgeReady}`}><FontAwesomeIcon icon={faCheckCircle} /> Ready</span>;
  }
  return (
    <span className={`${styles.badge} ${styles.badgeFailed}`} title={backup.errorMsg ?? undefined}>
      <FontAwesomeIcon icon={faTimesCircle} /> Failed
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BackupsPage() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  const [verifying, setVerifying] = useState<number | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    try {
      const data = await listBackups();
      setBackups(data);
      const pending = data.filter((b) => b.status === 'pending').map((b) => b.id);
      if (pending.length === 0 && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch {
      toast.error('Failed to load backups');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  function startPolling(id: number) {
    setPendingIds((prev) => new Set([...prev, id]));
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const b = await pollBackup(id);
        if (b.status !== 'pending') {
          setPendingIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
          await load();
          if (b.status === 'ready') toast.success('Backup ready');
          else toast.error(`Backup failed: ${b.errorMsg ?? 'unknown error'}`);
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
      } catch { /* ignore */ }
    }, 3000);
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const { id } = await createBackup(label.trim() || undefined);
      setLabel('');
      await load();
      startPolling(id);
      toast.success('Backup started');
    } catch {
      toast.error('Failed to start backup');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(b: Backup) {
    if (!window.confirm(`Delete backup "${b.label ?? b.filename}"? This cannot be undone.`)) return;
    try {
      await deleteBackup(b.id);
      setBackups((prev) => prev.filter((x) => x.id !== b.id));
      toast.success('Backup deleted');
    } catch {
      toast.error('Failed to delete backup');
    }
  }

  async function handleVerify(b: Backup) {
    setVerifying(b.id);
    try {
      const result = await verifyBackup(b.id);
      if (result.valid) {
        const m = result.manifest as Record<string, unknown>;
        toast.success(`Backup valid — ${m?.tableCount ?? '?'} tables, created ${m?.createdAt ? new Date(m.createdAt as string).toLocaleString() : 'unknown'}`);
      } else {
        toast.error(`Integrity check failed: ${result.error}`);
      }
    } catch {
      toast.error('Verification request failed');
    } finally {
      setVerifying(null);
    }
  }

  async function handleRestoreConfirm(scope: RestoreScope) {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      await restoreBackup(restoreTarget.id, scope);
      toast.success('Restore complete — you may need to reload the page');
      setRestoreTarget(null);
      await load();
    } catch {
      toast.error('Restore failed');
    } finally {
      setRestoring(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const backup = await uploadBackup(file);
      setBackups((prev) => [backup, ...prev]);
      toast.success('Backup uploaded successfully');
    } catch {
      toast.error('Upload failed — ensure the file is a valid .tar.gz backup');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <AdminLayout>
      {restoreTarget && (
        <RestoreModal
          backup={restoreTarget}
          onConfirm={handleRestoreConfirm}
          onCancel={() => setRestoreTarget(null)}
          restoring={restoring}
        />
      )}

      <div className={styles.header}>
        <h2 className={styles.title}>Backups</h2>
        <button className={styles.settingsToggle} onClick={() => setShowSettings((s) => !s)}>
          <FontAwesomeIcon icon={faGear} />
          Settings
          <FontAwesomeIcon icon={showSettings ? faChevronUp : faChevronDown} className={styles.chevron} />
        </button>
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      <div className={styles.layout}>
        {/* Create panel */}
        <div className={styles.panel}>
          <h3>Create Backup</h3>
          <p className={styles.hint}>
            Packages the database, all uploaded media, and application settings into a single
            downloadable <code>.tar.gz</code> file.
          </p>
          <div className={styles.formGroup}>
            <label>Label <span className={styles.optional}>(optional)</span></label>
            <input type="text" className={styles.input} placeholder="e.g. before-major-update"
              value={label} onChange={(e) => setLabel(e.target.value)} disabled={creating} />
          </div>
          <button className={styles.primaryButton} onClick={handleCreate} disabled={creating}>
            {creating ? <><FontAwesomeIcon icon={faCircleNotch} spin /> Starting…</> : <><FontAwesomeIcon icon={faPlus} /> Create Backup</>}
          </button>
        </div>

        {/* Upload panel */}
        <div className={styles.panel}>
          <h3>Upload &amp; Restore</h3>
          <p className={styles.hint}>
            Upload a previously downloaded <code>.tar.gz</code> backup file from another
            server or local storage. After uploading you can restore it from the list below.
          </p>
          <input ref={fileRef} type="file" accept=".tar.gz,application/gzip" style={{ display: 'none' }} onChange={handleUpload} />
          <button className={styles.secondaryButton} onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <><FontAwesomeIcon icon={faCircleNotch} spin /> Uploading…</> : <><FontAwesomeIcon icon={faUpload} /> Upload Backup File</>}
          </button>
        </div>
      </div>

      {/* Backup list */}
      <div className={styles.listSection}>
        <h3 className={styles.listTitle}>Backup History</h3>
        {loading && <p className={styles.status}>Loading…</p>}
        {!loading && backups.length === 0 && (
          <p className={styles.status}>No backups yet. Create your first backup above.</p>
        )}
        {backups.length > 0 && (
          <div className={styles.tableWrapper}>
            <table>
              <thead>
                <tr>
                  <th>Label / File</th>
                  <th>Status</th>
                  <th>Size</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <span className={styles.filename}>{b.label ?? b.filename}</span>
                      {b.label && <span className={styles.filenameSmall}>{b.filename}</span>}
                    </td>
                    <td><StatusBadge backup={b} pending={pendingIds.has(b.id)} /></td>
                    <td className={styles.numCell}>{formatBytes(b.sizeBytes)}</td>
                    <td className={styles.dateCell}>{formatDate(b.createdAt)}</td>
                    <td className={styles.actions}>
                      {b.status === 'ready' && (
                        <>
                          <a href={downloadUrl(b.id)} className={styles.actionBtn} title="Download" download>
                            <FontAwesomeIcon icon={faDownload} />
                          </a>
                          <button className={`${styles.actionBtn} ${styles.verifyBtn}`} title="Verify integrity"
                            onClick={() => handleVerify(b)} disabled={verifying !== null}>
                            {verifying === b.id ? <FontAwesomeIcon icon={faCircleNotch} spin /> : <FontAwesomeIcon icon={faShieldHalved} />}
                          </button>
                          <button className={`${styles.actionBtn} ${styles.restoreBtn}`} title="Restore"
                            onClick={() => setRestoreTarget(b)} disabled={restoring}>
                            <FontAwesomeIcon icon={faRotateLeft} />
                          </button>
                        </>
                      )}
                      <button className={`${styles.actionBtn} ${styles.deleteBtn}`} title="Delete"
                        onClick={() => handleDelete(b)} disabled={pendingIds.has(b.id)}>
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
