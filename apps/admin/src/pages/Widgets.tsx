import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronUp, faChevronDown, faXmark } from '@fortawesome/free-solid-svg-icons';
import { PERMISSIONS } from '@headtilts/shared';
import { AdminLayout } from '../components/AdminLayout';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../hooks/useAuth';
import { Widget, WidgetZone, WidgetType, Category, Post } from '../types';
import {
  fetchWidgets,
  fetchWidgetZones,
  fetchWidgetTypes,
  createWidget,
  updateWidget,
  deleteWidget,
  updateZoneWidgets,
} from '../services/widgets';
import { fetchCategories } from '../services/categories';
import { fetchPosts } from '../services/posts';
import styles from './Widgets.module.css';

function errMsg(err: unknown, fallback: string) {
  return (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback;
}

type ConfigField = { key: string; label: string; type: 'text' | 'textarea' | 'number' | 'toggle' | 'category-select' | 'menu-items' };
const CONFIG_FIELDS: Record<string, ConfigField[]> = {
  text: [{ key: 'content', label: 'Content (HTML)', type: 'textarea' }],
  menu: [{ key: 'items', label: 'Menu Items', type: 'menu-items' }],
  'recent-posts': [{ key: 'count', label: 'Number of posts', type: 'number' }],
  'featured-posts': [{ key: 'count', label: 'Number of posts', type: 'number' }],
  'latest-posts-compact': [{ key: 'count', label: 'Number of posts', type: 'number' }],
  'category-posts-grid': [
    { key: 'categorySlug', label: 'Category', type: 'category-select' },
    { key: 'count', label: 'Number of posts', type: 'number' },
  ],
  categories: [
    { key: 'showCount', label: 'Show post count', type: 'toggle' },
    { key: 'hideEmpty', label: 'Hide empty categories', type: 'toggle' },
  ],
  tags: [{ key: 'maxTags', label: 'Maximum tags', type: 'number' }],
  search: [],
};

interface WidgetFormState {
  name: string;
  type: string;
  title: string;
  description: string;
  isActive: boolean;
  config: Record<string, unknown>;
}

const blankForm = (type = 'text'): WidgetFormState => ({
  name: '',
  type,
  title: '',
  description: '',
  isActive: true,
  config: {},
});

interface MenuLinkItem {
  label: string;
  pageId?: number | null;
  url?: string;
}

function MenuItemsEditor({
  items,
  pages,
  onChange,
}: {
  items: MenuLinkItem[];
  pages: Post[];
  onChange: (items: MenuLinkItem[]) => void;
}) {
  function update(index: number, patch: Partial<MenuLinkItem>) {
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }
  function add() {
    onChange([...items, { label: '', pageId: null, url: '' }]);
  }
  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }
  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className={styles.menuItems}>
      {items.length === 0 && <p className={styles.menuItemsEmpty}>No links yet. Add one below.</p>}
      {items.map((item, i) => {
        const target: 'page' | 'url' = item.pageId != null ? 'page' : 'url';
        return (
          <div key={i} className={styles.menuItemRow}>
            <div className={styles.menuItemReorder}>
              <button type="button" className={styles.reorderBtn} onClick={() => move(i, -1)} disabled={i === 0} title="Move up">
                <FontAwesomeIcon icon={faChevronUp} />
              </button>
              <button type="button" className={styles.reorderBtn} onClick={() => move(i, 1)} disabled={i === items.length - 1} title="Move down">
                <FontAwesomeIcon icon={faChevronDown} />
              </button>
            </div>
            <div className={styles.menuItemFields}>
              <input
                type="text"
                value={item.label ?? ''}
                placeholder="Link label"
                onChange={(e) => update(i, { label: e.target.value })}
              />
              <select
                value={target}
                onChange={(e) =>
                  e.target.value === 'page'
                    ? update(i, { pageId: pages[0]?.id ?? null, url: '' })
                    : update(i, { pageId: null })
                }
              >
                <option value="page">Page</option>
                <option value="url">Custom URL</option>
              </select>
              {target === 'page' ? (
                <select
                  value={item.pageId ?? ''}
                  onChange={(e) => update(i, { pageId: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">— Select a page —</option>
                  {pages.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={item.url ?? ''}
                  placeholder="https://example.com or /pages/about"
                  onChange={(e) => update(i, { url: e.target.value })}
                />
              )}
            </div>
            <button type="button" className={styles.removeBtn} onClick={() => remove(i)} title="Remove link">
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        );
      })}
      <button type="button" className={styles.addToZoneBtn} onClick={add}>Add Link</button>
    </div>
  );
}

function WidgetConfigFields({
  type,
  config,
  categories,
  pages,
  onChange,
}: {
  type: string;
  config: Record<string, unknown>;
  categories: Category[];
  pages: Post[];
  onChange: (key: string, value: unknown) => void;
}) {
  const fields = CONFIG_FIELDS[type] ?? [];
  if (fields.length === 0) return null;

  return (
    <div className={styles.configSection}>
      <div className={styles.configTitle}>Configuration</div>
      {fields.map((field) => (
        <div key={field.key} className={styles.formGroup}>
          <label>{field.label}</label>
          {field.type === 'menu-items' ? (
            <MenuItemsEditor
              items={Array.isArray(config[field.key]) ? (config[field.key] as MenuLinkItem[]) : []}
              pages={pages}
              onChange={(items) => onChange(field.key, items)}
            />
          ) : field.type === 'textarea' ? (
            <textarea
              rows={4}
              value={(config[field.key] as string) ?? ''}
              onChange={(e) => onChange(field.key, e.target.value)}
            />
          ) : field.type === 'toggle' ? (
            <label className={styles.toggleLabel}>
              <input
                type="checkbox"
                checked={Boolean(config[field.key])}
                onChange={(e) => onChange(field.key, e.target.checked)}
              />
              <span className={styles.toggleSlider} />
            </label>
          ) : field.type === 'category-select' ? (
            <select
              value={(config[field.key] as string) ?? ''}
              onChange={(e) => onChange(field.key, e.target.value)}
            >
              <option value="">— Select a category —</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.slug}>{cat.name}</option>
              ))}
            </select>
          ) : (
            <input
              type="number"
              min={1}
              value={(config[field.key] as number) ?? ''}
              onChange={(e) => onChange(field.key, e.target.value === '' ? undefined : Number(e.target.value))}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function WidgetsPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.WIDGET_CREATE);
  const canEdit   = hasPermission(PERMISSIONS.WIDGET_EDIT);
  const canDelete = hasPermission(PERMISSIONS.WIDGET_DELETE);

  const [widgets,   setWidgets]   = useState<Widget[]>([]);
  const [zones,     setZones]     = useState<WidgetZone[]>([]);
  const [types,     setTypes]     = useState<WidgetType[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pages,     setPages]     = useState<Post[]>([]);
  const [loading,   setLoading]   = useState(true);

  // Create / Edit panel
  const [panel,     setPanel]     = useState<'none' | 'create' | 'edit'>('none');
  const [editId,    setEditId]    = useState<number | null>(null);
  const [form,      setForm]      = useState<WidgetFormState>(blankForm());
  const [saving,    setSaving]    = useState(false);

  // Zone state: widgetIds per zone name
  const [zoneError, setZoneError] = useState<Record<string, string>>({});
  const [zoneSaving, setZoneSaving] = useState<Record<string, boolean>>({});
  // Per-zone: which widget is selected in the "add" dropdown
  const [addSelection, setAddSelection] = useState<Record<string, number | ''>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    toast.error('');
    try {
      const [w, z, t, c, p] = await Promise.all([
        fetchWidgets(),
        fetchWidgetZones(),
        fetchWidgetTypes(),
        fetchCategories(1, 100),
        fetchPosts(1, 200, { type: 'page', status: 'published' }),
      ]);
      setWidgets(w);
      setZones(z);
      setTypes(t);
      setCategories(c.items);
      setPages(p.items);
    } catch (err) {
      toast.error(errMsg(err, 'Failed to load widgets'));
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setForm(blankForm(types[0]?.value || 'text'));
    setEditId(null);
    setPanel('create');
  }

  function openEdit(widget: Widget) {
    setForm({
      name: widget.name,
      type: widget.type,
      title: widget.title ?? '',
      description: widget.description ?? '',
      isActive: widget.isActive,
      config: { ...widget.config },
    });
    setEditId(widget.id);
    setPanel('edit');
  }

  function closePanel() {
    setPanel('none');
    setEditId(null);
  }

  function setConfigField(key: string, value: unknown) {
    setForm((f) => ({ ...f, config: { ...f.config, [key]: value } }));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        title: form.title.trim() || null,
        description: form.description.trim() || null,
        isActive: form.isActive,
        config: form.config,
      };
      if (panel === 'create') {
        await createWidget(payload);
      } else if (editId !== null) {
        await updateWidget(editId, payload);
      }
      closePanel();
      await load();
    } catch (err) {
      toast.error(errMsg(err, 'Failed to save widget'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(widget: Widget) {
    if (!(await confirm({ title: 'Delete Widget', message: `Delete widget "${widget.name}"? It will be removed from all zones.`, confirmLabel: 'Delete', danger: true }))) return;
    try {
      await deleteWidget(widget.id);
      await load();
    } catch (err) {
      toast.error(errMsg(err, 'Failed to delete widget'));
    }
  }

  // Zone widget management
  function getZoneIds(zone: WidgetZone) {
    return zone.widgets.map((w) => w.id);
  }

  async function saveZone(zone: WidgetZone, ids: number[]) {
    setZoneSaving((s) => ({ ...s, [zone.name]: true }));
    setZoneError((e) => ({ ...e, [zone.name]: '' }));
    try {
      const updated = await updateZoneWidgets(zone.name, ids);
      setZones((prev) => prev.map((z) => (z.name === zone.name ? updated : z)));
    } catch (err) {
      setZoneError((e) => ({ ...e, [zone.name]: errMsg(err, 'Failed to update zone') }));
    } finally {
      setZoneSaving((s) => ({ ...s, [zone.name]: false }));
    }
  }

  async function addToZone(zone: WidgetZone) {
    const sel = addSelection[zone.name];
    if (!sel) return;
    const ids = getZoneIds(zone);
    if (ids.includes(sel)) return;
    setAddSelection((s) => ({ ...s, [zone.name]: '' }));
    await saveZone(zone, [...ids, sel]);
  }

  async function removeFromZone(zone: WidgetZone, widgetId: number) {
    await saveZone(zone, getZoneIds(zone).filter((id) => id !== widgetId));
  }

  async function moveInZone(zone: WidgetZone, index: number, dir: -1 | 1) {
    const ids = getZoneIds(zone);
    const newIndex = index + dir;
    if (newIndex < 0 || newIndex >= ids.length) return;
    const newIds = [...ids];
    [newIds[index], newIds[newIndex]] = [newIds[newIndex], newIds[index]];
    await saveZone(zone, newIds);
  }

  const assignedWidgetIds = new Set(zones.flatMap((z) => z.widgets.map((w) => w.id)));

  return (
    <AdminLayout>
      <div className={styles.header}>
        <h2 className={styles.title}>Widgets</h2>
        {canCreate && (
          <button className={styles.addButton} onClick={openCreate}>
            Add Widget
          </button>
        )}
      </div>


      {/* Create / Edit panel */}
      {panel !== 'none' && (
        <div className={styles.formPanel}>
          <h3 className={styles.panelTitle}>{panel === 'create' ? 'New Widget' : 'Edit Widget'}</h3>
          <form onSubmit={handleSave}>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Widget Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Internal name (unique)"
                  required
                  disabled={saving}
                  autoFocus
                />
              </div>
              <div className={styles.formGroup}>
                <label>Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value, config: {} }))}
                  disabled={saving || panel === 'edit'}
                >
                  {types.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Display Title <span className={styles.optional}>(optional)</span></label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Shown above the widget"
                  disabled={saving}
                />
              </div>
              <div className={`${styles.formGroup} ${styles.activeToggle}`}>
                <label>Active</label>
                <label className={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                    disabled={saving}
                  />
                  <span className={styles.toggleSlider} />
                </label>
              </div>
              <div className={`${styles.formGroup} ${styles.activeToggle}`}>
                <label>Hide on mobile</label>
                <label className={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={Boolean(form.config.hideOnMobile)}
                    onChange={(e) => setConfigField('hideOnMobile', e.target.checked)}
                    disabled={saving}
                  />
                  <span className={styles.toggleSlider} />
                </label>
              </div>
            </div>

            <WidgetConfigFields type={form.type} config={form.config} categories={categories} pages={pages} onChange={setConfigField} />

            <div className={styles.formActions}>
              <button type="button" className={styles.cancelBtn} onClick={closePanel} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className={styles.saveBtn} disabled={saving || !form.name.trim()}>
                {saving ? 'Saving…' : panel === 'create' ? 'Create Widget' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className={styles.layout}>
        {/* Left — Widget Library */}
        <div className={styles.libraryColumn}>
          <div className={styles.columnHeader}>
            <span>Widget Library</span>
            <span className={styles.badge}>{widgets.length}</span>
          </div>
          {loading ? (
            <div className={styles.loadingMsg}>Loading…</div>
          ) : widgets.length === 0 ? (
            <div className={styles.emptyMsg}>
              No widgets yet.{canCreate && (
                <> <button className={styles.inlineLink} onClick={openCreate}>Create one.</button></>
              )}
            </div>
          ) : (
            <div className={styles.widgetList}>
              {widgets.map((widget) => (
                <div
                  key={widget.id}
                  className={`${styles.widgetCard} ${editId === widget.id ? styles.widgetCardActive : ''}`}
                >
                  <div className={styles.widgetCardTop}>
                    <div className={styles.widgetInfo}>
                      <span className={styles.widgetName}>{widget.name}</span>
                      {widget.title && <span className={styles.widgetTitle}>&ldquo;{widget.title}&rdquo;</span>}
                      <span className={styles.typeBadge}>{widget.type}</span>
                      {!widget.isActive && <span className={styles.inactiveBadge}>inactive</span>}
                    </div>
                    <div className={styles.widgetActions}>
                      {canEdit && (
                        <button className={styles.editBtn} onClick={() => openEdit(widget)}>
                          Edit
                        </button>
                      )}
                      {canDelete && (
                        <button className={styles.deleteBtn} onClick={() => handleDelete(widget)}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  {assignedWidgetIds.has(widget.id) && (
                    <div className={styles.assignedZones}>
                      {zones
                        .filter((z) => z.widgets.some((w) => w.id === widget.id))
                        .map((z) => (
                          <span key={z.name} className={styles.zoneChip}>{z.name}</span>
                        ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right — Widget Zones */}
        <div className={styles.zonesColumn}>
          <div className={styles.columnHeader}>
            <span>Widget Zones</span>
          </div>
          {zones.map((zone) => (
            <div key={zone.name} className={styles.zoneCard}>
              <div className={styles.zoneHeader}>
                <div>
                  <span className={styles.zoneName}>{zone.name}</span>
                  {zone.description && <span className={styles.zoneDesc}>{zone.description}</span>}
                </div>
                <span className={styles.zoneCount}>{zone.widgets.length}/{zone.maxWidgets}</span>
              </div>

              {zoneError[zone.name] && (
                <div className={styles.zoneErrorMsg}>{zoneError[zone.name]}</div>
              )}

              <div className={styles.zoneWidgetList}>
                {zone.widgets.length === 0 ? (
                  <div className={styles.zoneEmpty}>No widgets assigned</div>
                ) : (
                  zone.widgets.map((zw, idx) => (
                    <div key={zw.id} className={styles.zoneWidget}>
                      <div className={styles.zoneWidgetReorder}>
                        <button
                          className={styles.reorderBtn}
                          onClick={() => moveInZone(zone, idx, -1)}
                          disabled={idx === 0 || zoneSaving[zone.name]}
                          title="Move up"
                        ><FontAwesomeIcon icon={faChevronUp} /></button>
                        <button
                          className={styles.reorderBtn}
                          onClick={() => moveInZone(zone, idx, 1)}
                          disabled={idx === zone.widgets.length - 1 || zoneSaving[zone.name]}
                          title="Move down"
                        ><FontAwesomeIcon icon={faChevronDown} /></button>
                      </div>
                      <div className={styles.zoneWidgetInfo}>
                        <span className={styles.zoneWidgetName}>{zw.name}</span>
                        {zw.title && <span className={styles.zoneWidgetTitle}>{zw.title}</span>}
                        <span className={styles.typeBadge}>{zw.type}</span>
                      </div>
                      {canEdit && (
                        <button
                          className={styles.removeBtn}
                          onClick={() => removeFromZone(zone, zw.id)}
                          disabled={zoneSaving[zone.name]}
                          title="Remove from zone"
                        ><FontAwesomeIcon icon={faXmark} /></button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {canEdit && zone.widgets.length < zone.maxWidgets && (
                <div className={styles.addToZone}>
                  <select
                    value={addSelection[zone.name] ?? ''}
                    onChange={(e) => setAddSelection((s) => ({ ...s, [zone.name]: e.target.value ? Number(e.target.value) : '' }))}
                    disabled={zoneSaving[zone.name]}
                  >
                    <option value="">— Add a widget —</option>
                    {widgets
                      .filter((w) => w.isActive && !zone.widgets.some((zw) => zw.id === w.id))
                      .map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}{w.title ? ` — ${w.title}` : ''}
                        </option>
                      ))}
                  </select>
                  <button
                    className={styles.addToZoneBtn}
                    onClick={() => addToZone(zone)}
                    disabled={!addSelection[zone.name] || zoneSaving[zone.name]}
                  >
                    {zoneSaving[zone.name] ? '…' : 'Add'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
