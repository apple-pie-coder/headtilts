import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AxiosError } from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChevronRight, faTurnUp, faArrowUp, faArrowDown, faIndent, faOutdent,
  faEye, faEyeSlash, faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { PERMISSIONS } from '@headtilts/shared';
import { AdminLayout } from '../components/AdminLayout';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../hooks/useAuth';
import { Menu, MenuItem, Category, Tag, Post } from '../types';
import { fetchMenu, saveMenuItems, updateMenu } from '../services/menus';
import { fetchPosts } from '../services/posts';
import { fetchCategories } from '../services/categories';
import { fetchTags } from '../services/tags';
import styles from './MenuEditor.module.css';

function errorMsg(err: unknown, fallback: string) {
  return (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback;
}

type ItemType = 'url' | 'page' | 'post' | 'category' | 'tag';

interface DraftItem {
  id?: number;
  title: string;
  type: ItemType;
  url: string;
  postId: number | null;
  categoryId: number | null;
  tagId: number | null;
  depth: number;
  position: number;
  isVisible: boolean;
}

const TYPE_LABELS: Record<ItemType, string> = {
  url: 'Custom URL',
  page: 'Page',
  post: 'Post',
  category: 'Category',
  tag: 'Tag',
};

function buildDrafts(items: MenuItem[], pageIds: Set<number>): DraftItem[] {
  return [...items]
    .sort((a, b) => a.position - b.position)
    .map((item, i) => {
      let type: ItemType = 'url';
      if (item.postId != null) {
        type = pageIds.has(item.postId) ? 'page' : 'post';
      } else if (item.categoryId != null) {
        type = 'category';
      } else if (item.tagId != null) {
        type = 'tag';
      }
      return {
        id: item.id,
        title: item.title,
        type,
        url: item.url ?? '',
        postId: item.postId,
        categoryId: item.categoryId,
        tagId: item.tagId,
        depth: item.parentId != null ? 1 : 0,
        position: i,
        isVisible: item.isVisible,
      };
    });
}

export default function MenuEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const toast = useToast();

  const [menu, setMenu] = useState<Menu | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Reference lists
  const [pages, setPages] = useState<Post[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  // Edit menu meta
  const [editMeta, setEditMeta] = useState(false);
  const [metaName, setMetaName] = useState('');
  const [metaLocation, setMetaLocation] = useState('');
  const [metaSaving, setMetaSaving] = useState(false);

  // New item form
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<ItemType>('url');
  const [newUrl, setNewUrl] = useState('');
  const [newPostId, setNewPostId] = useState<number | null>(null);
  const [newCategoryId, setNewCategoryId] = useState<number | null>(null);
  const [newTagId, setNewTagId] = useState<number | null>(null);
  const [newDepth, setNewDepth] = useState(0);

  useEffect(() => {
    if (!id) return;
    loadAll(Number(id));
  }, [id]);

  async function loadAll(menuId: number) {
    setLoading(true);
    try {
      const [m, pagesResult, postsResult, catsResult, tagsResult] = await Promise.all([
        fetchMenu(menuId),
        fetchPosts(1, 200, { type: 'page', status: 'published' }),
        fetchPosts(1, 200, { type: 'post', status: 'published' }),
        fetchCategories(1, 200),
        fetchTags(1, 200),
      ]);
      const pageList = pagesResult.items as Post[];
      const postList = postsResult.items as Post[];
      setPages(pageList);
      setPosts(postList);
      setCategories(catsResult.items as Category[]);
      setTags(tagsResult.items as Tag[]);

      const pageIdSet = new Set(pageList.map((p) => p.id));
      setMenu(m);
      setItems(buildDrafts(m.items, pageIdSet));
      setMetaName(m.name);
      setMetaLocation(m.location);
    } catch (err) {
      toast.error(errorMsg(err, 'Failed to load menu'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveItems() {
    if (!menu) return;
    setSaving(true);
    try {
      const payload = items.map((item, i) => ({
        title: item.title,
        url: item.type === 'url' ? item.url || undefined : undefined,
        postId: (item.type === 'page' || item.type === 'post') && item.postId ? item.postId : undefined,
        categoryId: item.type === 'category' && item.categoryId ? item.categoryId : undefined,
        tagId: item.type === 'tag' && item.tagId ? item.tagId : undefined,
        depth: item.depth,
        position: i,
        isVisible: item.isVisible,
      }));
      await saveMenuItems(menu.id, payload);
      const pageIdSet = new Set(pages.map((p) => p.id));
      const refreshed = await fetchMenu(menu.id);
      setMenu(refreshed);
      setItems(buildDrafts(refreshed.items, pageIdSet));
      toast.success('Menu saved.');
    } catch (err) {
      toast.error(errorMsg(err, 'Failed to save menu'));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMeta(e: FormEvent) {
    e.preventDefault();
    if (!menu) return;
    setMetaSaving(true);
    try {
      await updateMenu(menu.id, { name: metaName.trim(), location: metaLocation.trim() });
      const refreshed = await fetchMenu(menu.id);
      setMenu(refreshed);
      setMetaName(refreshed.name);
      setMetaLocation(refreshed.location);
      setEditMeta(false);
    } catch (err) {
      toast.error(errorMsg(err, 'Failed to update menu'));
    } finally {
      setMetaSaving(false);
    }
  }

  // Auto-populate title when selecting a reference entity
  function autoTitle(type: ItemType, id: number | null): string {
    if (id == null) return '';
    if (type === 'page') return pages.find((p) => p.id === id)?.title ?? '';
    if (type === 'post') return posts.find((p) => p.id === id)?.title ?? '';
    if (type === 'category') return categories.find((c) => c.id === id)?.name ?? '';
    if (type === 'tag') return tags.find((t) => t.id === id)?.name ?? '';
    return '';
  }

  function handleNewTypeChange(t: ItemType) {
    setNewType(t);
    setNewPostId(null);
    setNewCategoryId(null);
    setNewTagId(null);
    setNewUrl('');
    setNewTitle('');
  }

  function handleNewRefChange(rawId: string) {
    const numId = Number(rawId) || null;
    if (newType === 'page' || newType === 'post') setNewPostId(numId);
    if (newType === 'category') setNewCategoryId(numId);
    if (newType === 'tag') setNewTagId(numId);
    // Auto-fill title when empty
    if (!newTitle.trim() && numId) {
      setNewTitle(autoTitle(newType, numId));
    }
  }

  function handleAddItem(e: FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const draft: DraftItem = {
      title: newTitle.trim(),
      type: newType,
      url: newType === 'url' ? newUrl.trim() : '',
      postId: (newType === 'page' || newType === 'post') ? newPostId : null,
      categoryId: newType === 'category' ? newCategoryId : null,
      tagId: newType === 'tag' ? newTagId : null,
      depth: newDepth,
      position: items.length,
      isVisible: true,
    };
    setItems((prev) => [...prev, draft]);
    setNewTitle('');
    setNewUrl('');
    setNewPostId(null);
    setNewCategoryId(null);
    setNewTagId(null);
    setNewDepth(0);
  }

  function isAddValid(): boolean {
    if (!newTitle.trim()) return false;
    if (newType === 'url') return true;
    if ((newType === 'page' || newType === 'post') && !newPostId) return false;
    if (newType === 'category' && !newCategoryId) return false;
    if (newType === 'tag' && !newTagId) return false;
    return true;
  }

  function handleRemove(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function handleMoveUp(index: number) {
    if (index === 0) return;
    setItems((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  function handleMoveDown(index: number) {
    setItems((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

  function handleIndent(index: number) {
    if (index === 0) return;
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], depth: Math.min(next[index].depth + 1, 2) };
      return next;
    });
  }

  function handleOutdent(index: number) {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], depth: Math.max(next[index].depth - 1, 0) };
      return next;
    });
  }

  function handleToggleVisible(index: number) {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], isVisible: !next[index].isVisible };
      return next;
    });
  }

  function handleTitleChange(index: number, value: string) {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], title: value };
      return next;
    });
  }

  function handleItemTypeChange(index: number, t: ItemType) {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], type: t, url: '', postId: null, categoryId: null, tagId: null };
      return next;
    });
  }

  function handleItemRefChange(index: number, rawId: string) {
    const numId = Number(rawId) || null;
    setItems((prev) => {
      const next = [...prev];
      const item = next[index];
      if (item.type === 'page' || item.type === 'post') next[index] = { ...item, postId: numId };
      else if (item.type === 'category') next[index] = { ...item, categoryId: numId };
      else if (item.type === 'tag') next[index] = { ...item, tagId: numId };
      return next;
    });
  }

  function handleItemUrlChange(index: number, value: string) {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], url: value };
      return next;
    });
  }

  function getItemRefValue(item: DraftItem): string {
    if (item.type === 'page' || item.type === 'post') return String(item.postId ?? '');
    if (item.type === 'category') return String(item.categoryId ?? '');
    if (item.type === 'tag') return String(item.tagId ?? '');
    return '';
  }

  const canEdit = hasPermission(PERMISSIONS.MENU_EDIT);

  if (loading) {
    return (
      <AdminLayout>
        <div className={styles.loading}>Loading menu…</div>
      </AdminLayout>
    );
  }

  if (!menu) {
    return (
      <AdminLayout>
        <div className={styles.error}>Menu not found.</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className={styles.breadcrumb}>
        <button className={styles.breadcrumbLink} onClick={() => navigate('/admin/menus')}>Menus</button>
        <span className={styles.breadcrumbSep}><FontAwesomeIcon icon={faChevronRight} /></span>
        <span>{menu.name}</span>
      </div>

      {/* Meta panel */}
      <div className={styles.metaPanel}>
        {editMeta ? (
          <form onSubmit={handleSaveMeta} className={styles.metaForm}>
            <div className={styles.metaRow}>
              <div className={styles.field}>
                <label>Menu Name</label>
                <input value={metaName} onChange={(e) => setMetaName(e.target.value)} required disabled={metaSaving} />
              </div>
              <div className={styles.field}>
                <label>Location</label>
                <input value={metaLocation} onChange={(e) => setMetaLocation(e.target.value)} required disabled={metaSaving} />
              </div>
            </div>
            <div className={styles.metaActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setEditMeta(false)} disabled={metaSaving}>Cancel</button>
              <button type="submit" className={styles.saveBtn} disabled={metaSaving}>{metaSaving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        ) : (
          <div className={styles.metaHeader}>
            <div>
              <h2 className={styles.menuTitle}>{menu.name}</h2>
              <span className={styles.locationChip}>{menu.location}</span>
            </div>
            {canEdit && (
              <button className={styles.editMetaBtn} onClick={() => setEditMeta(true)}>Edit Details</button>
            )}
          </div>
        )}
      </div>


      <div className={styles.workspace}>
        {/* Items list */}
        <div className={styles.itemsPanel}>
          <div className={styles.panelHeader}>
            <h3>Menu Items</h3>
            {canEdit && (
              <button className={styles.saveBtn} onClick={handleSaveItems} disabled={saving}>
                {saving ? 'Saving…' : 'Save Menu'}
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div className={styles.emptyItems}>No items yet. Add items using the form on the right.</div>
          ) : (
            <ul className={styles.itemsList}>
              {items.map((item, i) => (
                <li
                  key={i}
                  className={styles.itemRow}
                  style={{ marginLeft: `${item.depth * 2}rem` }}
                >
                  <div className={styles.itemHandle}>
                    <span className={styles.depthDot} style={{ opacity: item.depth > 0 ? 1 : 0.2 }}><FontAwesomeIcon icon={faTurnUp} rotation={90} /></span>
                  </div>
                  <div className={styles.itemFields}>
                    <input
                      className={styles.itemTitle}
                      value={item.title}
                      onChange={(e) => handleTitleChange(i, e.target.value)}
                      placeholder="Label"
                      disabled={!canEdit}
                    />
                    <div className={styles.itemRef}>
                      {canEdit ? (
                        <select
                          className={styles.itemTypeSelect}
                          value={item.type}
                          onChange={(e) => handleItemTypeChange(i, e.target.value as ItemType)}
                        >
                          <option value="url">URL</option>
                          <option value="page">Page</option>
                          <option value="post">Post</option>
                          <option value="category">Category</option>
                          <option value="tag">Tag</option>
                        </select>
                      ) : (
                        <span className={`${styles.typeBadge} ${styles[`type_${item.type}`]}`}>
                          {TYPE_LABELS[item.type]}
                        </span>
                      )}

                      {item.type === 'url' ? (
                        <input
                          className={styles.itemUrl}
                          value={item.url}
                          onChange={(e) => handleItemUrlChange(i, e.target.value)}
                          placeholder="/path or https://…"
                          disabled={!canEdit}
                        />
                      ) : item.type === 'page' ? (
                        <select className={styles.itemUrl} value={getItemRefValue(item)} onChange={(e) => handleItemRefChange(i, e.target.value)} disabled={!canEdit}>
                          <option value="">— select page —</option>
                          {pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                        </select>
                      ) : item.type === 'post' ? (
                        <select className={styles.itemUrl} value={getItemRefValue(item)} onChange={(e) => handleItemRefChange(i, e.target.value)} disabled={!canEdit}>
                          <option value="">— select post —</option>
                          {posts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                        </select>
                      ) : item.type === 'category' ? (
                        <select className={styles.itemUrl} value={getItemRefValue(item)} onChange={(e) => handleItemRefChange(i, e.target.value)} disabled={!canEdit}>
                          <option value="">— select category —</option>
                          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      ) : (
                        <select className={styles.itemUrl} value={getItemRefValue(item)} onChange={(e) => handleItemRefChange(i, e.target.value)} disabled={!canEdit}>
                          <option value="">— select tag —</option>
                          {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <div className={styles.itemControls}>
                      <button title="Move up" onClick={() => handleMoveUp(i)} disabled={i === 0}><FontAwesomeIcon icon={faArrowUp} /></button>
                      <button title="Move down" onClick={() => handleMoveDown(i)} disabled={i === items.length - 1}><FontAwesomeIcon icon={faArrowDown} /></button>
                      <button title="Indent" onClick={() => handleIndent(i)} disabled={i === 0 || item.depth >= 2}><FontAwesomeIcon icon={faIndent} /></button>
                      <button title="Outdent" onClick={() => handleOutdent(i)} disabled={item.depth === 0}><FontAwesomeIcon icon={faOutdent} /></button>
                      <button
                        title={item.isVisible ? 'Hide' : 'Show'}
                        onClick={() => handleToggleVisible(i)}
                        className={item.isVisible ? styles.visibleBtn : styles.hiddenBtn}
                      >
                        <FontAwesomeIcon icon={item.isVisible ? faEye : faEyeSlash} />
                      </button>
                      <button title="Remove" className={styles.removeBtn} onClick={() => handleRemove(i)}><FontAwesomeIcon icon={faXmark} /></button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add item form */}
        {canEdit && (
          <div className={styles.addPanel}>
            <h3>Add Item</h3>
            <form onSubmit={handleAddItem} className={styles.addForm}>
              <div className={styles.field}>
                <label>Type</label>
                <select value={newType} onChange={(e) => handleNewTypeChange(e.target.value as ItemType)}>
                  <option value="url">Custom URL</option>
                  <option value="page">Page</option>
                  <option value="post">Post</option>
                  <option value="category">Category</option>
                  <option value="tag">Tag</option>
                </select>
              </div>

              {newType === 'url' && (
                <div className={styles.field}>
                  <label>URL</label>
                  <input
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="/path or https://…"
                  />
                </div>
              )}

              {newType === 'page' && (
                <div className={styles.field}>
                  <label>Page</label>
                  <select value={newPostId ?? ''} onChange={(e) => handleNewRefChange(e.target.value)}>
                    <option value="">— select page —</option>
                    {pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </div>
              )}

              {newType === 'post' && (
                <div className={styles.field}>
                  <label>Post</label>
                  <select value={newPostId ?? ''} onChange={(e) => handleNewRefChange(e.target.value)}>
                    <option value="">— select post —</option>
                    {posts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </div>
              )}

              {newType === 'category' && (
                <div className={styles.field}>
                  <label>Category</label>
                  <select value={newCategoryId ?? ''} onChange={(e) => handleNewRefChange(e.target.value)}>
                    <option value="">— select category —</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              {newType === 'tag' && (
                <div className={styles.field}>
                  <label>Tag</label>
                  <select value={newTagId ?? ''} onChange={(e) => handleNewRefChange(e.target.value)}>
                    <option value="">— select tag —</option>
                    {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}

              <div className={styles.field}>
                <label>Label</label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Navigation label"
                  required
                />
              </div>

              <div className={styles.field}>
                <label>Depth</label>
                <select value={newDepth} onChange={(e) => setNewDepth(Number(e.target.value))}>
                  <option value={0}>Top level</option>
                  <option value={1}>Sub-item (1 level)</option>
                  <option value={2}>Sub-item (2 levels)</option>
                </select>
              </div>

              <button type="submit" className={styles.addBtn} disabled={!isAddValid()}>Add to Menu</button>
            </form>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
