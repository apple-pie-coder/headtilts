import { useCallback, useEffect, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { PERMISSIONS } from '@headtilts/shared';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPen, faTrashCan, faTags, faMagnifyingGlass, faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import { TagForm } from '../components/TagForm';
import {
  Button, Card, DensityToggle, EmptyState, LoadingBar, MenuItem, PageHeader, Pagination, RowMenu, SearchInput, TableSkeleton,
} from '../components/ui';
import t from '../components/ui/table.module.css';
import { useAuth } from '../hooks/useAuth';
import { useDensity } from '../hooks/useDensity';
import { useUrlState } from '../hooks/useUrlState';
import { Tag } from '../types';
import { deleteTag, fetchTags } from '../services/tags';

function errorMessage(err: unknown, fallback: string): string {
  return (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback;
}

export default function TagsPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(PERMISSIONS.TAG_EDIT) || hasPermission(PERMISSIONS.TAG_CREATE);
  const canDelete = hasPermission(PERMISSIONS.TAG_DELETE);

  const [q, setQ] = useUrlState({ search: '', page: '1', per: '20' });
  const page = Math.max(1, Number(q.page) || 1);
  const perPage = Number(q.per) || 20;

  const [tags, setTags] = useState<Tag[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [density, setDensity] = useDensity('tagsDensity');
  const formRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const result = await fetchTags(page, perPage, q.search);
      if (id !== reqId.current) return;
      setTags(result.items);
      setTotal(result.pagination.total);
      setLoaded(true);
    } catch (err) {
      if (id === reqId.current) toast.error(errorMessage(err, 'Failed to load tags'));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [page, perPage, q.search]);

  useEffect(() => { load(); }, [load]);

  function edit(tag: Tag) {
    setEditing(tag);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      formRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    });
  }

  async function handleDelete(tag: Tag) {
    const posts = tag._count?.posts ?? 0;
    if (!(await confirm({
      title: `Delete “${tag.name}”?`,
      message: `${posts ? `It will be removed from ${posts} post${posts === 1 ? '' : 's'}. ` : ''}This cannot be undone.`,
      confirmLabel: 'Delete tag',
      danger: true,
    }))) return;
    try {
      await deleteTag(tag.id);
      if (editing?.id === tag.id) setEditing(null);
      toast.success(`Deleted “${tag.name}”`);
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete tag'));
    }
  }

  function menu(tag: Tag): MenuItem[] {
    return [
      { label: 'Edit', icon: faPen, onClick: () => edit(tag), hidden: !canEdit },
      { label: 'View on site', icon: faArrowUpRightFromSquare, onClick: () => window.open(`/tags/${tag.slug}`, '_blank', 'noopener') },
      { label: 'Delete', icon: faTrashCan, onClick: () => handleDelete(tag), danger: true, hidden: !canDelete, divider: true },
    ];
  }

  return (
    <AdminLayout>
      <PageHeader title="Tags" subtitle={loaded ? `${total} tag${total === 1 ? '' : 's'}` : ' '} />

      <div className={t.split}>
        <div className={t.splitAside} ref={formRef}>
          {canEdit && (
            <TagForm
              key={`${editing?.id ?? 'new'}-${formKey}`}
              tag={editing}
              onSaved={() => { setEditing(null); setFormKey((k) => k + 1); load(); }}
              onCancel={() => setEditing(null)}
            />
          )}
        </div>

        <div className={t.splitMain}>
          <div className={t.toolbar}>
            <SearchInput value={q.search} onChange={(search) => setQ({ search })} placeholder="Search tags" />
            <div className={t.spacer} />
            <DensityToggle value={density} onChange={setDensity} />
          </div>

          <Card>
            <LoadingBar active={loading && loaded} />
            <div className={t.scroll}>
              <table className={`${t.table} ${t[`d_${density}`]}`}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className={t.hideMd}>Description</th>
                    <th className={t.num}>Posts</th>
                    <th className={t.actionsCol}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {!loaded && <TableSkeleton rows={6} cols={4} />}
                  {tags.map((tag) => (
                    <tr key={tag.id} className={editing?.id === tag.id ? t.rowSelected : undefined}>
                      <td className={t.primaryCell}>
                        <div className={t.stack}>
                          {canEdit
                            ? <button type="button" className={t.primary} onClick={() => edit(tag)}>{tag.name}</button>
                            : <span className={t.primary}>{tag.name}</span>}
                          <span className={t.secondary}><span className={t.mono}>/{tag.slug}</span></span>
                        </div>
                      </td>
                      <td className={`${t.muted} ${t.hideMd}`}><span className={t.clamp2}>{tag.description || <span className={t.faint}>—</span>}</span></td>
                      <td className={t.num}>{tag._count?.posts ?? 0}</td>
                      <td className={t.actionsCol}>
                        <div className={t.rowActions}>
                          {canEdit && (
                            <button type="button" className={t.quickAction} onClick={() => edit(tag)} title="Edit" aria-label={`Edit ${tag.name}`}>
                              <FontAwesomeIcon icon={faPen} />
                            </button>
                          )}
                          <RowMenu items={menu(tag)} label={`Actions for ${tag.name}`} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {loaded && tags.length === 0 && (
              q.search ? (
                <EmptyState icon={faMagnifyingGlass} title={`No tags match “${q.search}”`} action={<Button onClick={() => setQ({ search: '' })}>Clear search</Button>} />
              ) : (
                <EmptyState icon={faTags} title="No tags yet" description="Tags are created here or straight from the post editor." />
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
        </div>
      </div>
    </AdminLayout>
  );
}
