import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash, faCopy, faCheck, faKey, faCompress, faGripVertical, faExpand } from '@fortawesome/free-solid-svg-icons';
import { useDensity } from '../hooks/useDensity';
import { AdminLayout } from '../components/AdminLayout';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmDialog';
import {
  fetchApiKeys, fetchScopes, createApiKey, deleteApiKey,
  ApiKey, ApiKeyCreated,
} from '../services/apiKeys';
import styles from './ApiKeys.module.css';

const SCOPE_GROUPS: { label: string; resource: string }[] = [
  { label: 'Posts', resource: 'posts' },
  { label: 'Pages', resource: 'pages' },
  { label: 'Media', resource: 'media' },
  { label: 'Polls', resource: 'polls' },
  { label: 'Categories', resource: 'categories' },
  { label: 'Tags', resource: 'tags' },
  { label: 'Comments', resource: 'comments' },
  { label: 'Settings', resource: 'settings' },
  { label: 'Users', resource: 'users' },
];

function scopeActionsFor(resource: string, allScopes: string[]) {
  const actions = ['read', 'write', 'delete'].filter((a) =>
    allScopes.includes(`${resource}:${a}`),
  );
  return actions;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function ScopeSelector({
  allScopes,
  selected,
  onChange,
}: {
  allScopes: string[];
  selected: string[];
  onChange: (s: string[]) => void;
}) {
  function toggle(scope: string) {
    onChange(selected.includes(scope) ? selected.filter((s) => s !== scope) : [...selected, scope]);
  }

  function toggleGroup(resource: string, actions: string[]) {
    const groupScopes = actions.map((a) => `${resource}:${a}`);
    const allOn = groupScopes.every((s) => selected.includes(s));
    if (allOn) {
      onChange(selected.filter((s) => !groupScopes.includes(s)));
    } else {
      const merged = Array.from(new Set([...selected, ...groupScopes]));
      onChange(merged);
    }
  }

  return (
    <div className={styles.scopeGrid}>
      {SCOPE_GROUPS.map(({ label, resource }) => {
        const actions = scopeActionsFor(resource, allScopes);
        if (actions.length === 0) return null;
        const groupScopes = actions.map((a) => `${resource}:${a}`);
        const allOn = groupScopes.every((s) => selected.includes(s));
        return (
          <div key={resource} className={styles.scopeGroup}>
            <label className={styles.scopeGroupLabel}>
              <input
                type="checkbox"
                checked={allOn}
                onChange={() => toggleGroup(resource, actions)}
              />
              <span>{label}</span>
            </label>
            <div className={styles.scopeActions}>
              {actions.map((action) => {
                const scope = `${resource}:${action}`;
                return (
                  <label key={action} className={styles.scopeAction}>
                    <input
                      type="checkbox"
                      checked={selected.includes(scope)}
                      onChange={() => toggle(scope)}
                    />
                    <span className={styles.scopeActionLabel}>{action}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ApiKeysPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [allScopes, setAllScopes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [density, setDensity] = useDensity('apiKeysDensity');

  // Create form state
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);

  // One-time reveal
  const [revealedKey, setRevealedKey] = useState<ApiKeyCreated | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    load();
    fetchScopes().then(setAllScopes).catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    try {
      setKeys(await fetchApiKeys());
    } catch {
      toast.error('Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (selectedScopes.length === 0) { toast.error('Select at least one scope'); return; }
    setSaving(true);
    try {
      const created = await createApiKey({
        name: name.trim(),
        scopes: selectedScopes,
        expiresAt: expiresAt || null,
      });
      setRevealedKey(created);
      setShowForm(false);
      setName(''); setSelectedScopes([]); setExpiresAt('');
      load();
    } catch {
      toast.error('Failed to create API key');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(key: ApiKey) {
    const ok = await confirm({
      title: 'Revoke API key',
      message: `Revoke "${key.name}"? Any application using this key will immediately lose access.`,
      confirmLabel: 'Revoke',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteApiKey(key.id);
      toast.success('API key revoked');
      load();
    } catch {
      toast.error('Failed to revoke key');
    }
  }

  function handleCopy() {
    if (!revealedKey) return;
    navigator.clipboard.writeText(revealedKey.rawKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <AdminLayout>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>API Keys</h1>
          <p className={styles.subtitle}>
            Create long-lived keys for external scripts and integrations. Each key is shown only once on creation.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className={styles.densitySwitch} role="group" aria-label="List density">
            <button type="button" className={`${styles.densityOption} ${density === 'compact' ? styles.densityOptionActive : ''}`} onClick={() => setDensity('compact')} title="Compact" aria-pressed={density === 'compact'}><FontAwesomeIcon icon={faCompress} /></button>
            <button type="button" className={`${styles.densityOption} ${density === 'condensed' ? styles.densityOptionActive : ''}`} onClick={() => setDensity('condensed')} title="Condensed" aria-pressed={density === 'condensed'}><FontAwesomeIcon icon={faGripVertical} /></button>
            <button type="button" className={`${styles.densityOption} ${density === 'relaxed' ? styles.densityOptionActive : ''}`} onClick={() => setDensity('relaxed')} title="Relaxed" aria-pressed={density === 'relaxed'}><FontAwesomeIcon icon={faExpand} /></button>
          </div>
          <button className={styles.addButton} onClick={() => setShowForm((v) => !v)}>
            <FontAwesomeIcon icon={faPlus} /> New Key
          </button>
        </div>
      </div>

      {/* One-time reveal banner */}
      {revealedKey && (
        <div className={styles.revealBanner}>
          <div className={styles.revealHeader}>
            <FontAwesomeIcon icon={faKey} />
            <strong>Copy your new API key — it won't be shown again.</strong>
          </div>
          <div className={styles.revealKeyRow}>
            <code className={styles.revealKey}>{revealedKey.rawKey}</code>
            <button className={styles.copyBtn} onClick={handleCopy} title="Copy to clipboard">
              <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
              {copied ? ' Copied' : ' Copy'}
            </button>
          </div>
          <button className={styles.revealDismiss} onClick={() => setRevealedKey(null)}>
            I've saved it — dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className={styles.createPanel}>
          <h3 className={styles.createTitle}>New API Key</h3>

          <div className={styles.createField}>
            <label className={styles.createLabel}>Key name</label>
            <input
              className={styles.createInput}
              type="text"
              placeholder="e.g. Zapier integration, my-script"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className={styles.createField}>
            <label className={styles.createLabel}>Expiry (optional)</label>
            <input
              className={styles.createInput}
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              disabled={saving}
              style={{ width: '180px' }}
            />
            <p className={styles.createHint}>Leave blank for a key that never expires.</p>
          </div>

          <div className={styles.createField}>
            <label className={styles.createLabel}>Scopes</label>
            <ScopeSelector
              allScopes={allScopes}
              selected={selectedScopes}
              onChange={setSelectedScopes}
            />
          </div>

          <div className={styles.createActions}>
            <button className={styles.addButton} onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating…' : 'Create Key'}
            </button>
            <button className={styles.cancelBtn} onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Keys table */}
      <div className={styles.tableWrapper}>
        <table className={styles[`density_${density}`]}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Key prefix</th>
              <th>Scopes</th>
              <th>Last used</th>
              <th>Expires</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className={styles.empty}>Loading…</td></tr>
            ) : keys.length === 0 ? (
              <tr><td colSpan={7} className={styles.empty}>No API keys yet. Create one to get started.</td></tr>
            ) : keys.map((key) => (
              <tr key={key.id}>
                <td className={styles.nameCell}>{key.name}</td>
                <td><code className={styles.prefix}>{key.prefix}…</code></td>
                <td>
                  <div className={styles.scopeTags}>
                    {key.scopes.map((s) => <span key={s} className={styles.scopeTag}>{s}</span>)}
                  </div>
                </td>
                <td className={styles.dateCell}>{formatDate(key.lastUsedAt)}</td>
                <td className={styles.dateCell}>
                  {key.expiresAt
                    ? <span className={new Date(key.expiresAt) < new Date() ? styles.expired : ''}>
                        {formatDate(key.expiresAt)}
                      </span>
                    : <span className={styles.never}>Never</span>}
                </td>
                <td className={styles.dateCell}>{formatDate(key.createdAt)}</td>
                <td>
                  <button
                    className={`${styles.actionBtn} ${styles.danger}`}
                    title="Revoke"
                    onClick={() => handleDelete(key)}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Usage docs */}
      <div className={styles.docsPanel}>
        <h3 className={styles.docsTitle}>Using your API key</h3>
        <p className={styles.docsText}>
          Pass the key in the <code>X-API-Key</code> header on every request.
          Authenticated endpoints under <code>/api/*</code> accept the header in place of a JWT.
        </p>
        <pre className={styles.codeBlock}>{`# Fetch all published posts
curl https://your-site.com/api/posts \\
  -H "X-API-Key: htk_your_key_here"

# Create a post (requires posts:write scope)
curl -X POST https://your-site.com/api/posts \\
  -H "X-API-Key: htk_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Hello","content":"..."}'`}</pre>
        <p className={styles.docsText}>
          Each key only grants access to the scopes you selected. A <code>403</code> response
          with <code>"API key missing required scope: posts:write"</code> means you need to add that
          scope when creating the key.
        </p>
      </div>
    </AdminLayout>
  );
}
