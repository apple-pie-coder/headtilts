import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { PERMISSIONS } from '@headtilts/shared';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPen, faTrashCan, faLayerGroup, faMagnifyingGlass, faArrowUpRightFromSquare, faList } from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import { CategoryIcon } from '../components/CategoryIcon';
import { CategoryForm } from '../components/CategoryForm';
import {
  Button, Card, DensityToggle, EmptyState, LoadingBar, MenuItem, PageHeader, RowMenu, SearchInput, TableSkeleton,
} from '../components/ui';
import t from '../components/ui/table.module.css';
import { useAuth } from '../hooks/useAuth';
import { useDensity } from '../hooks/useDensity';
import { useUrlState } from '../hooks/useUrlState';
import { Category } from '../types';
import { deleteCategory, fetchCategories } from '../services/categories';

/** Re-order a flat list so each parent is immediately followed by its children. */
function toTreeOrder(cats: Category[]): { cat: Category; depth: number }[] {
  const byParent = new Map<number | null, Category[]>();
  for (const c of cats) {
    const key = c.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(c);
  }
  function walk(parentId: number | null, depth: number): { cat: Category; depth: number }[] {
    return (byParent.get(parentId) ?? []).flatMap((c) => [{ cat: c, depth }, ...walk(c.id, depth + 1)]);
  }
  return walk(null, 0);
}

function errorMessage(err: unknown, fallback: string): string {
  return (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback;
}

export default function CategoriesPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(PERMISSIONS.CATEGORY_EDIT) || hasPermission(PERMISSIONS.CATEGORY_CREATE);
  const canDelete = hasPermission(PERMISSIONS.CATEGORY_DELETE);

  const [q, setQ] = useUrlState({ search: '' });
  const [all, setAll] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [density, setDensity] = useDensity('categoriesDensity');
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const result = await fetchCategories(1, 500);
      setAll(result.items);
      setLoaded(true);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load categories'));
    } finally {
      setLoading(false);
    }
  }

  function edit(c: Category) {
    setEditing(c);
    // On narrow screens the form sits above the list — bring it into view.
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      formRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    });
  }

  async function handleDelete(c: Category) {
    const children = all.filter((x) => x.parentId === c.id).length;
    const posts = c._count?.posts ?? 0;
    const notes = [
      posts ? `${posts} post${posts === 1 ? '' : 's'} will lose this category; any left with none move to ${all.find((x) => x.isDefault)?.name ?? 'Uncategorized'}.` : '',
      children ? `${children} subcategor${children === 1 ? 'y' : 'ies'} will become top-level.` : '',
    ].filter(Boolean).join(' ');
    if (!(await confirm({
      title: `Delete “${c.name}”?`,
      message: `${notes} This cannot be undone.`.trim(),
      confirmLabel: 'Delete category',
      danger: true,
    }))) return;
    try {
      await deleteCategory(c.id);
      if (editing?.id === c.id) setEditing(null);
      toast.success(`Deleted “${c.name}”`);
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete category'));
    }
  }

  // Searching flattens the tree; otherwise parents are followed by their children.
  const rows = useMemo(() => {
    const term = q.search.trim().toLowerCase();
    if (!term) return toTreeOrder(all);
    return all
      .filter((c) => c.name.toLowerCase().includes(term) || c.slug.toLowerCase().includes(term) || (c.description ?? '').toLowerCase().includes(term))
      .map((cat) => ({ cat, depth: 0 }));
  }, [all, q.search]);

  function menu(c: Category): MenuItem[] {
    return [
      { label: 'Edit', icon: faPen, onClick: () => edit(c), hidden: !canEdit },
      { label: 'View posts', icon: faList, onClick: () => navigate(`/admin/posts?category=${c.id}`) },
      { label: 'View on site', icon: faArrowUpRightFromSquare, onClick: () => window.open(`/categories/${c.slug}`, '_blank', 'noopener') },
      { label: 'Delete', icon: faTrashCan, onClick: () => handleDelete(c), danger: true, hidden: !canDelete || c.isDefault, divider: true },
    ];
  }

  return (
    <AdminLayout>
      <PageHeader title="Categories" subtitle={loaded ? `${all.length} categor${all.length === 1 ? 'y' : 'ies'}` : ' '} />

      <div className={t.split}>
        <div className={t.splitAside} ref={formRef}>
          {canEdit && (
            <CategoryForm
              key={`${editing?.id ?? 'new'}-${formKey}`}
              category={editing}
              categories={all}
              onSaved={() => { setEditing(null); setFormKey((k) => k + 1); load(); }}
              onCancel={() => setEditing(null)}
            />
          )}
        </div>

        <div className={t.splitMain}>
          <div className={t.toolbar}>
            <SearchInput value={q.search} onChange={(search) => setQ({ search })} placeholder="Search categories" delay={0} />
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
                  {rows.map(({ cat: c, depth }) => {
                    const posts = c._count?.posts ?? 0;
                    return (
                      <tr key={c.id} className={editing?.id === c.id ? t.rowSelected : undefined}>
                        <td className={t.primaryCell}>
                          <div className={t.primaryWrap} style={{ paddingLeft: `${depth * 1.25}rem` }}>
                            {depth > 0 && <span className={t.faint} aria-hidden="true">└</span>}
                            <CategoryIcon icon={c.icon} iconSvg={c.iconSvg} />
                            <div className={t.stack}>
                              {canEdit
                                ? <button type="button" className={t.primary} onClick={() => edit(c)}>{c.name}</button>
                                : <span className={t.primary}>{c.name}</span>}
                              <span className={t.secondary}>
                                <span className={t.mono}>/{c.slug}</span>
                                {c.isDefault && <span className={t.chip} title="Posts without a category are filed here. It can't be deleted.">Default</span>}
                                {q.search && c.parent?.name && <span className={t.chip}>in {c.parent.name}</span>}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className={`${t.muted} ${t.hideMd}`}><span className={t.clamp2}>{c.description || <span className={t.faint}>—</span>}</span></td>
                        <td className={t.num}>
                          {posts > 0
                            ? <Link to={`/admin/posts?category=${c.id}`} className={t.countLink} title={`View posts in ${c.name}`}>{posts}</Link>
                            : <span className={t.faint}>0</span>}
                        </td>
                        <td className={t.actionsCol}>
                          <div className={t.rowActions}>
                            {canEdit && (
                              <button type="button" className={t.quickAction} onClick={() => edit(c)} title="Edit" aria-label={`Edit ${c.name}`}>
                                <FontAwesomeIcon icon={faPen} />
                              </button>
                            )}
                            <RowMenu items={menu(c)} label={`Actions for ${c.name}`} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {loaded && rows.length === 0 && (
              q.search ? (
                <EmptyState icon={faMagnifyingGlass} title={`No categories match “${q.search}”`} action={<Button onClick={() => setQ({ search: '' })}>Clear search</Button>} />
              ) : (
                <EmptyState icon={faLayerGroup} title="No categories yet" description="Use the form to add your first category." />
              )
            )}
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
