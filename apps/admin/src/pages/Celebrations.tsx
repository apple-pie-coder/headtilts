import { useCallback, useEffect, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { PERMISSIONS } from '@headtilts/shared';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPen, faTrashCan, faCakeCandles, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import { CelebrationForm } from '../components/CelebrationForm';
import {
  Button, Card, DensityToggle, EmptyState, LoadingBar, MenuItem, PageHeader, Pagination, RowMenu, SearchInput,
  StatusBadge, Switch, TableSkeleton, Tabs,
} from '../components/ui';
import t from '../components/ui/table.module.css';
import { useAuth } from '../hooks/useAuth';
import { useDensity } from '../hooks/useDensity';
import { useUrlState } from '../hooks/useUrlState';
import { Celebration } from '../types';
import { deleteCelebration, fetchCelebrations, updateCelebration } from '../services/celebrations';
import { resolveMediaUrl } from '../services/media';
import styles from './Celebrations.module.css';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function errorMessage(err: unknown, fallback: string): string {
  return (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback;
}

/** Next occurrence of month/day: days away (0 = today) and the year it falls in. */
function nextOccurrence(month: number, day: number): { days: number; year: number } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), month - 1, day);
  if (next < today) next = new Date(now.getFullYear() + 1, month - 1, day);
  return { days: Math.round((next.getTime() - today.getTime()) / 86_400_000), year: next.getFullYear() };
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function whenLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 31) return `In ${days} days`;
  return `In ${Math.round(days / 30)} months`;
}

export default function CelebrationsPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(PERMISSIONS.CELEBRATION_EDIT) || hasPermission(PERMISSIONS.CELEBRATION_CREATE);
  const canDelete = hasPermission(PERMISSIONS.CELEBRATION_DELETE);

  const [q, setQ] = useUrlState({ type: '', search: '', page: '1', per: '20' });
  const page = Math.max(1, Number(q.page) || 1);
  const perPage = Number(q.per) || 20;

  const [items, setItems] = useState<Celebration[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Celebration | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [density, setDensity] = useDensity('celebrationsDensity');
  const formRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const result = await fetchCelebrations(page, perPage, q.search, q.type);
      if (id !== reqId.current) return;
      setItems(result.items);
      setTotal(result.pagination.total);
      setLoaded(true);
    } catch (err) {
      if (id === reqId.current) toast.error(errorMessage(err, 'Failed to load celebrations'));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [page, perPage, q.search, q.type]);

  useEffect(() => { load(); }, [load]);

  function edit(c: Celebration) {
    setEditing(c);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      formRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    });
  }

  async function toggleActive(c: Celebration, isActive: boolean) {
    setItems((list) => list.map((x) => (x.id === c.id ? { ...x, isActive } : x)));
    try {
      await updateCelebration(c.id, { isActive });
      toast.success(isActive ? `${c.name} will be shown on the site` : `${c.name} is now hidden`);
    } catch (err) {
      setItems((list) => list.map((x) => (x.id === c.id ? { ...x, isActive: !isActive } : x)));
      toast.error(errorMessage(err, 'Failed to update'));
    }
  }

  async function handleDelete(c: Celebration) {
    if (!(await confirm({
      title: `Remove ${c.name}?`,
      message: 'Tip: switch it off instead to hide it without losing the details. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    }))) return;
    try {
      await deleteCelebration(c.id);
      if (editing?.id === c.id) setEditing(null);
      toast.success(`Removed ${c.name}`);
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete celebration'));
    }
  }

  function menu(c: Celebration): MenuItem[] {
    return [
      { label: 'Edit', icon: faPen, onClick: () => edit(c), hidden: !canEdit },
      { label: 'Delete', icon: faTrashCan, onClick: () => handleDelete(c), danger: true, hidden: !canDelete, divider: true },
    ];
  }

  return (
    <AdminLayout>
      <PageHeader
        title="Celebrations"
        subtitle="Artist birthdays and remembrances. On the day, the public site greets visitors with an animated spotlight."
      />

      <div className={t.split}>
        <div className={t.splitAside} ref={formRef}>
          {canEdit && (
            <CelebrationForm
              key={`${editing?.id ?? 'new'}-${formKey}`}
              celebration={editing}
              onSaved={() => { setEditing(null); setFormKey((k) => k + 1); load(); }}
              onCancel={() => setEditing(null)}
            />
          )}
        </div>

        <div className={t.splitMain}>
          <Tabs
            tabs={[
              { key: '', label: 'All' },
              { key: 'birthday', label: 'Birthdays' },
              { key: 'remembrance', label: 'Remembrances' },
            ]}
            value={q.type}
            onChange={(type) => setQ({ type })}
          />
          <div className={t.toolbar}>
            <SearchInput value={q.search} onChange={(search) => setQ({ search })} placeholder="Search by name" />
            <div className={t.spacer} />
            <DensityToggle value={density} onChange={setDensity} />
          </div>

          <Card>
            <LoadingBar active={loading && loaded} />
            <div className={t.scroll}>
              <table className={`${t.table} ${t[`d_${density}`]}`}>
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Date</th>
                    <th className={t.center}>Shown</th>
                    <th className={t.actionsCol}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {!loaded && <TableSkeleton rows={5} cols={4} />}
                  {items.map((c) => {
                    const { days, year } = nextOccurrence(c.month, c.day);
                    const turning = c.year ? year - c.year : null;
                    return (
                      <tr key={c.id} className={[editing?.id === c.id && t.rowSelected, !c.isActive && t.rowDim].filter(Boolean).join(' ') || undefined}>
                        <td className={t.primaryCell}>
                          <div className={t.primaryWrap}>
                            <span className={styles.photo}>
                              {c.photo
                                ? <img src={resolveMediaUrl(c.photo)} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                                : <span aria-hidden="true">{c.type === 'birthday' ? '🎂' : '🕯️'}</span>}
                            </span>
                            <div className={t.stack}>
                              {canEdit
                                ? <button type="button" className={t.primary} onClick={() => edit(c)}>{c.name}</button>
                                : <span className={t.primary}>{c.name}</span>}
                              <span className={t.secondary}>
                                <span className={c.type === 'birthday' ? styles.birthday : styles.remembrance}>
                                  {c.type === 'birthday' ? 'Birthday' : 'Remembrance'}
                                </span>
                                {c.year && <span>{c.year}</span>}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className={t.stack}>
                            <span className={t.nowrap}>{MONTHS_SHORT[c.month - 1]} {c.day}</span>
                            <span className={t.secondary}>
                              {days === 0
                                ? <StatusBadge tone="success">Today</StatusBadge>
                                : whenLabel(days)}
                              {turning !== null && turning > 0 && (
                                <span>· {c.type === 'birthday' ? `${ordinal(turning)} birthday` : `${ordinal(turning)} anniversary`}</span>
                              )}
                            </span>
                          </div>
                        </td>
                        <td className={t.center}>
                          <Switch
                            checked={c.isActive}
                            disabled={!canEdit}
                            label={c.isActive ? `Hide ${c.name} on the site` : `Show ${c.name} on the site`}
                            onChange={(next) => toggleActive(c, next)}
                          />
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

            {loaded && items.length === 0 && (
              q.search ? (
                <EmptyState icon={faMagnifyingGlass} title={`No one matches “${q.search}”`} action={<Button onClick={() => setQ({ search: '' })}>Clear search</Button>} />
              ) : (
                <EmptyState icon={faCakeCandles} title="No celebrations yet" description="Use the form to add a birthday or remembrance." />
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
