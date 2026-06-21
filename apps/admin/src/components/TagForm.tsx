import { FormEvent, useState } from 'react';
import { AxiosError } from 'axios';
import { slugify } from '@headtilts/shared';
import { Tag } from '../types';
import { createTag, updateTag } from '../services/tags';
import { useToast } from './ToastContext';
import styles from './TagForm.module.css';

interface TagFormProps {
  tag: Tag | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function TagForm({ tag, onSaved, onCancel }: TagFormProps) {
  const isEditing = !!tag;

  const [name, setName] = useState(tag?.name || '');
  const [slug, setSlug] = useState(tag?.slug || '');
  const [slugTouched, setSlugTouched] = useState(isEditing);
  const [description, setDescription] = useState(tag?.description || '');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

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
    };

    try {
      if (isEditing && tag) {
        await updateTag(tag.id, input);
      } else {
        await createTag(input);
      }
      onSaved();
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Failed to save tag'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.panel}>
      <h3>{isEditing ? 'Edit Tag' : 'Add New Tag'}</h3>

      <form onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            required
            disabled={saving}
            autoFocus
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


        <div className={styles.actions}>
          {isEditing && (
            <button type="button" className={styles.cancelButton} onClick={onCancel} disabled={saving}>
              Cancel
            </button>
          )}
          <button type="submit" className={styles.saveButton} disabled={saving}>
            {saving ? 'Saving...' : isEditing ? 'Update Tag' : 'Add Tag'}
          </button>
        </div>
      </form>
    </div>
  );
}
