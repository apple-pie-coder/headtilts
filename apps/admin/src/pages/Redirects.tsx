import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { PERMISSIONS } from '@headtilts/shared';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPen, faTrashCan, faArrowRight, faArrowUpRightFromSquare, faCopy, faMagnifyingGlass, faRightLeft, faPlus,
} from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmDialog';
import {
  Button, Card, DensityToggle, EmptyState, Field, FieldHint, MenuItem, PageHeader, Panel, RowMenu, SearchInput,
  SortHeader, StatusBadge, TableSkeleton, Tabs, relativeTime, absoluteTime,
} from '../components/ui';
import t from '../components/ui/table.module.css';
import { useAuth } from '../hooks/useAuth';
import { useDensity } from '../hooks/useDensity';
import { useUrlState } from '../hooks/useUrlState';
import { createRedirect, deleteRedirect, fetchRedirects, updateRedirect, Redirect } from '../services/redirects';
import styles from './Redirects.module.css';

function errMsg(err: unknown, fallback = 'Something went wrong'): string {
  return (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback;
}

/** "old-post" → "/old-post"; full URLs are left alone. */
function normalizePath(p: string): string {
  const v = p.trim();
  if (!v || /^https?:\/\//i.test(v)) return v;
  return v.startsWith('/') ? v : `/${v}`;
}

const EMPTY = { fromPath: '', toPath: '', type: 301 };

export default function RedirectsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.REDIRECT_MANAGE);

  const [q, setQ] = useUrlState({ search: '', type: '', sort: 'fromPath:asc' });
  const [sortBy, sortOrder] = q.sort.split(':') as [keyof Redirect, 'asc' | 'desc'];

  const [redirects, setRedirects] = useState<Redirect[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<Redirect | null>(null);
  const [saving, setSaving] = useState(false);
  const [density, setDensity] = useDensity('redirectsDensity');
  const fromRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setRedirects(await fetchRedirects());
      setLoaded(true);
    } catch (err) {
      toast.error(errMsg(err, 'Failed to load redirects'));
    }
  }

  function startEdit(r: Redirect) {
    setEditing(r);
    setForm({ fromPath: r.fromPath, toPath: r.toPath, type: r.type });
    requestAnimationFrame(() => {
      fromRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      fromRef.current?.focus();
    });
  }

  function cancelEdit() {
    setEditing(null);
    setForm(EMPTY);
  }

  // Live validation, so problems show before saving.
  const from = normalizePath(form.fromPath);
  const to = normalizePath(form.toPath);
  const duplicate = from && redirects.find((r) => r.fromPath === from && r.id !== editing?.id);
  const selfLoop = from && to && from === to;
  const chainsInto = to && redirects.find((r) => r.fromPath === to && r.id !== editing?.id);
  const canSubmit = !!from && !!to && !duplicate && !selfLoop && !saving;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      if (editing) {
        await updateRedirect(editing.id, { fromPath: from, toPath: to, type: form.type });
        toast.success('Redirect updated');
      } else {
        await createRedirect(from, to, form.type);
        toast.success(`Redirect added: ${from} → ${to}`);
      }
      cancelEdit();
      await load();
      fromRef.current?.focus();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(r: Redirect) {
    if (!(await confirm({
      title: 'Delete redirect?',
      message: `Visitors to ${r.fromPath} will no longer be sent to ${r.toPath}.`,
      confirmLabel: 'Delete',
      danger: true,
    }))) return;
    try {
      await deleteRedirect(r.id);
      if (editing?.id === r.id) cancelEdit();
      toast.success('Redirect deleted', {
        action: {
          label: 'Undo',
          onClick: () => createRedirect(r.fromPath, r.toPath, r.type).then(load).catch((e) => toast.error(errMsg(e, 'Undo failed'))),
        },
      });
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  }

  const rows = useMemo(() => {
    const term = q.search.trim().toLowerCase();
    const list = redirects.filter((r) =>
      (!q.type || String(r.type) === q.type)
      && (!term || r.fromPath.toLowerCase().includes(term) || r.toPath.toLowerCase().includes(term)));
    const dir = sortOrder === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      return (typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))) * dir;
    });
  }, [redirects, q.search, q.type, sortBy, sortOrder]);

  const permanent = redirects.filter((r) => r.type === 301).length;
  const onSort = (f: string, o: 'asc' | 'desc') => setQ({ sort: `${f}:${o}` });

  function menu(r: Redirect): MenuItem[] {
    return [
      { label: 'Edit', icon: faPen, onClick: () => startEdit(r), hidden: !canManage },
      { label: 'Test redirect', icon: faArrowUpRightFromSquare, onClick: () => window.open(r.fromPath, '_blank', 'noopener') },
      {
        label: 'Copy source URL',
        icon: faCopy,
        onClick: () => navigator.clipboard.writeText(new URL(r.fromPath, window.location.origin).href).then(() => toast.success('Copied'), () => toast.error('Could not copy')),
      },
      { label: 'Delete', icon: faTrashCan, onClick: () => handleDelete(r), danger: true, hidden: !canManage, divider: true },
    ];
  }

  return (
    <AdminLayout>
      <PageHeader
        title="Redirects"
        subtitle="Send visitors from old URLs to new ones. Use 301 for moves that are permanent."
      />

      <div className={t.split}>
        <div className={t.splitAside}>
          {canManage && (
            <Panel
              title={editing ? 'Edit redirect' : 'Add redirect'}
              actions={editing && <Button size="sm" variant="ghost" icon={faPlus} onClick={cancelEdit}>New</Button>}
            >
              <form onSubmit={handleSubmit}>
                <Field label="From path">
                  <input
                    ref={fromRef}
                    type="text"
                    placeholder="/old-page"
                    value={form.fromPath}
                    onChange={(e) => setForm((f) => ({ ...f, fromPath: e.target.value }))}
                    onBlur={() => setForm((f) => ({ ...f, fromPath: normalizePath(f.fromPath) }))}
                    aria-invalid={!!duplicate}
                    required
                  />
                  {duplicate && <FieldHint tone="danger">A redirect from {from} already exists.</FieldHint>}
                </Field>
                <Field label="To path or URL">
                  <input
                    type="text"
                    placeholder="/new-page or https://…"
                    value={form.toPath}
                    onChange={(e) => setForm((f) => ({ ...f, toPath: e.target.value }))}
                    onBlur={() => setForm((f) => ({ ...f, toPath: normalizePath(f.toPath) }))}
                    aria-invalid={!!selfLoop}
                    required
                  />
                  {selfLoop && <FieldHint tone="danger">From and To are the same — this would loop forever.</FieldHint>}
                  {!selfLoop && chainsInto && (
                    <FieldHint tone="warning">{to} itself redirects to {chainsInto.toPath}. Point straight there to avoid a chain.</FieldHint>
                  )}
                </Field>
                <Field label="Type" group>
                  <div className={styles.typeSwitch} role="radiogroup" aria-label="Redirect type">
                    {[
                      { v: 301, l: '301 Permanent', d: 'Search engines move rankings to the new URL' },
                      { v: 302, l: '302 Temporary', d: 'Old URL stays indexed' },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        role="radio"
                        aria-checked={form.type === o.v}
                        className={`${styles.typeOpt} ${form.type === o.v ? styles.typeOptOn : ''}`}
                        onClick={() => setForm((f) => ({ ...f, type: o.v }))}
                      >
                        <strong>{o.l}</strong>
                        <span>{o.d}</span>
                      </button>
                    ))}
                  </div>
                </Field>
                <div className={styles.preview} aria-live="polite">
                  <code>{from || '/from'}</code>
                  <FontAwesomeIcon icon={faArrowRight} />
                  <code>{to || '/to'}</code>
                </div>
                <div className={styles.actions}>
                  <Button type="submit" variant="primary" disabled={!canSubmit}>
                    {saving ? 'Saving…' : editing ? 'Save changes' : 'Add redirect'}
                  </Button>
                  {editing && <Button variant="ghost" onClick={cancelEdit}>Cancel</Button>}
                </div>
              </form>
            </Panel>
          )}
        </div>

        <div className={t.splitMain}>
          <Tabs
            tabs={[
              { key: '', label: 'All', count: redirects.length },
              { key: '301', label: 'Permanent', count: permanent },
              { key: '302', label: 'Temporary', count: redirects.length - permanent },
            ]}
            value={q.type}
            onChange={(type) => setQ({ type })}
          />
          <div className={t.toolbar}>
            <SearchInput value={q.search} onChange={(search) => setQ({ search })} placeholder="Search paths" delay={0} />
            <div className={t.spacer} />
            <DensityToggle value={density} onChange={setDensity} />
          </div>

          <Card>
            <div className={t.scroll}>
              <table className={`${t.table} ${t[`d_${density}`]}`}>
                <thead>
                  <tr>
                    <SortHeader label="From" field="fromPath" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
                    <th>To</th>
                    <th>Type</th>
                    <SortHeader label="Hits" field="hits" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} firstOrder="desc" />
                    <SortHeader label="Updated" field="updatedAt" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} firstOrder="desc" />
                    <th className={t.actionsCol}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {!loaded && <TableSkeleton rows={5} cols={6} />}
                  {rows.map((r) => (
                    <tr key={r.id} className={editing?.id === r.id ? t.rowSelected : undefined}>
                      <td><span className={t.mono}>{r.fromPath}</span></td>
                      <td><span className={t.mono}>{r.toPath}</span></td>
                      <td><StatusBadge tone={r.type === 301 ? 'info' : 'warning'}>{r.type}</StatusBadge></td>
                      <td className={t.num}>{r.hits.toLocaleString()}</td>
                      <td className={`${t.muted} ${t.nowrap}`} title={absoluteTime(r.updatedAt)}>{relativeTime(r.updatedAt)}</td>
                      <td className={t.actionsCol}>
                        <div className={t.rowActions}>
                          {canManage && (
                            <button type="button" className={t.quickAction} onClick={() => startEdit(r)} title="Edit" aria-label={`Edit redirect from ${r.fromPath}`}>
                              <FontAwesomeIcon icon={faPen} />
                            </button>
                          )}
                          <RowMenu items={menu(r)} label={`Actions for ${r.fromPath}`} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {loaded && rows.length === 0 && (
              q.search || q.type ? (
                <EmptyState
                  icon={faMagnifyingGlass}
                  title="No redirects match"
                  action={<Button onClick={() => setQ({ search: '', type: '' })}>Clear filters</Button>}
                />
              ) : (
                <EmptyState
                  icon={faRightLeft}
                  title="No redirects yet"
                  description="When you change a page's URL, add a redirect so old links and search results keep working."
                />
              )
            )}
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
