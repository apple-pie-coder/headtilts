import { FormEvent, useState } from 'react';
import { AxiosError } from 'axios';
import { slugify } from '@headtilts/shared';
import { Category } from '../types';
import { createCategory, updateCategory } from '../services/categories';
import { useToast } from './ToastContext';
import styles from './CategoryForm.module.css';

interface CategoryFormProps {
  category: Category | null;
  categories: Category[];
  onSaved: () => void;
  onCancel: () => void;
}

export function CategoryForm({ category, categories, onSaved, onCancel }: CategoryFormProps) {
  const isEditing = !!category;

  const [name, setName] = useState(category?.name || '');
  const [slug, setSlug] = useState(category?.slug || '');
  const [slugTouched, setSlugTouched] = useState(isEditing);
  const [description, setDescription] = useState(category?.description || '');
  const [parentId, setParentId] = useState<string>(category?.parentId ? String(category.parentId) : '');
  const [icon, setIcon] = useState(category?.icon || '');
  const [showSidebar, setShowSidebar] = useState(category?.showSidebar ?? false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const parentOptions = categories.filter((c) => c.id !== category?.id);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) {
      setSlug(slugify(value));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);

    const input = {
      name,
      slug: slug || undefined,
      description: description || undefined,
      parentId: parentId ? Number(parentId) : null,
      icon: icon || undefined,
      showSidebar,
    };

    try {
      if (isEditing && category) {
        await updateCategory(category.id, input);
      } else {
        await createCategory(input);
      }
      onSaved();
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Failed to save category'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.panel}>
      <h3>{isEditing ? 'Edit Category' : 'Add New Category'}</h3>

      <form onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            required
            disabled={saving}
          />
        </div>

        <div className={styles.formGroup}>
          <label>Slug</label>
          <input
            type="text"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            placeholder={slugify(name)}
            disabled={saving}
          />
        </div>

        <div className={styles.formGroup}>
          <label>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            disabled={saving}
          />
        </div>

        <div className={styles.formGroup}>
          <label>Parent Category</label>
          <select value={parentId} onChange={(e) => setParentId(e.target.value)} disabled={saving}>
            <option value="">— None —</option>
            {parentOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentId ? `— ${c.name}` : c.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.formGroup}>
          <label>Icon</label>
          <input
            type="text"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="e.g. 📰 or icon class name"
            disabled={saving}
          />
        </div>

        <div className={styles.formGroup}>
          <label>
            <input
              type="checkbox"
              checked={showSidebar}
              onChange={(e) => setShowSidebar(e.target.checked)}
              disabled={saving}
            />
            {' '}Show sidebar on this category's archive page
          </label>
        </div>


        <div className={styles.actions}>
          {isEditing && (
            <button type="button" className={styles.cancelButton} onClick={onCancel} disabled={saving}>
              Cancel
            </button>
          )}
          <button type="submit" className={styles.saveButton} disabled={saving}>
            {saving ? 'Saving...' : isEditing ? 'Update Category' : 'Add Category'}
          </button>
        </div>
      </form>
    </div>
  );
}
